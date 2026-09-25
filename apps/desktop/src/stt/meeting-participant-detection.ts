import { commands as detectCommands } from "@anlg/plugin-detect";

import { createHuman, searchContacts } from "~/contacts/queries";
import { liveQueryClient } from "~/db";
import { addSessionParticipant } from "~/session/queries/participants";

const MEETING_PARTICIPANT_DETECTION_INTERVAL_MS = 5_000;

export function startMeetingParticipantDetection({
  sessionId,
  ownerUserId,
  isEnabled,
}: {
  sessionId: string;
  ownerUserId: string;
  isEnabled?: () => boolean | Promise<boolean>;
}) {
  const handledNames = new Set<string>();
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  const detectionIsEnabled = isEnabled ?? (() => true);

  const detectOnce = async () => {
    try {
      if (!(await detectionIsEnabled())) {
        return;
      }

      const applications = await detectCommands.listMicUsingApplications();
      if (stopped || !(await detectionIsEnabled())) {
        return;
      }
      if (applications.status === "error") {
        return;
      }

      const activeBundleIds = new Set(
        applications.data.map((app) => app.id).filter(Boolean),
      );
      if (activeBundleIds.size === 0) {
        return;
      }

      const inspections = await detectCommands.inspectMeetingAccessibility();
      if (stopped || !(await detectionIsEnabled())) {
        return;
      }
      if (inspections.status === "error") {
        return;
      }

      const detectedNames = new Set<string>();
      for (const inspection of inspections.data) {
        if (
          inspection.platform !== "zoom" ||
          !inspection.accessibilityTrusted ||
          !activeBundleIds.has(inspection.app.id)
        ) {
          continue;
        }
        for (const stream of inspection.participantStreams) {
          const name = stream.participantName?.trim();
          if (name) {
            detectedNames.add(name);
          }
        }
      }

      const newNames = [...detectedNames].filter(
        (name) => !handledNames.has(normalizeDetectedName(name)),
      );
      if (newNames.length === 0) {
        return;
      }

      const existingNames = await loadSessionParticipantNames(sessionId);

      for (const name of newNames) {
        if (stopped) {
          return;
        }
        handledNames.add(normalizeDetectedName(name));
        if (existingNames.has(normalizeDetectedName(name))) {
          continue;
        }

        const humanId = await resolveHumanIdForName(name, ownerUserId);
        if (stopped) {
          return;
        }
        await addSessionParticipant(sessionId, humanId, "auto");
      }
    } catch (error) {
      console.warn("[listener] failed to detect meeting participants", error);
    }
  };

  const detect = () => {
    if (stopped || inFlight) {
      return inFlight ?? Promise.resolve();
    }

    const pendingDetection = detectOnce().finally(() => {
      if (inFlight === pendingDetection) {
        inFlight = null;
      }
    });
    inFlight = pendingDetection;
    return pendingDetection;
  };

  void detect();
  const interval = setInterval(() => {
    void detect();
  }, MEETING_PARTICIPANT_DETECTION_INTERVAL_MS);

  return async () => {
    stopped = true;
    clearInterval(interval);
    await inFlight;
  };
}

function normalizeDetectedName(name: string): string {
  return name.trim().toLowerCase();
}

async function loadSessionParticipantNames(
  sessionId: string,
): Promise<Set<string>> {
  const rows = await liveQueryClient.execute<{ name: string }>(
    `
      SELECT COALESCE(NULLIF(human.name, ''), participant.display_name) AS name
      FROM session_participants AS participant
      LEFT JOIN humans AS human
        ON human.id = participant.human_id AND human.deleted_at IS NULL
      WHERE participant.session_id = ? AND participant.deleted_at IS NULL
    `,
    [sessionId],
  );
  return new Set(
    rows.map((row) => normalizeDetectedName(row.name || "")).filter(Boolean),
  );
}

// Reuses an existing contact whose name matches exactly, rather than always
// creating a new human — the same person is often detected across multiple
// polls (and across sessions), so this avoids piling up duplicate contacts
// for one real person.
async function resolveHumanIdForName(
  name: string,
  ownerUserId: string,
): Promise<string> {
  const matches = await searchContacts(name, 5);
  const exactMatch = matches.find(
    (contact) =>
      normalizeDetectedName(contact.name) === normalizeDetectedName(name),
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  return createHuman({
    ownerUserId,
    name,
    entryPoint: "session_participants",
  });
}
