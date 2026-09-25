import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSessionContentSnapshot: vi.fn(),
  loadHumansByIds: vi.fn(),
  buildRenderTranscriptRequestFromRows: vi.fn(),
  collectAssignedHumanIdsFromTranscriptRows: vi.fn(),
  renderTranscriptSegments: vi.fn(),
}));

vi.mock("~/session/content-queries", () => ({
  loadSessionContentSnapshot: mocks.loadSessionContentSnapshot,
}));

vi.mock("~/contacts/queries", () => ({
  loadHumansByIds: mocks.loadHumansByIds,
}));

vi.mock("~/stt/render-transcript", () => ({
  buildRenderTranscriptRequestFromRows:
    mocks.buildRenderTranscriptRequestFromRows,
  collectAssignedHumanIdsFromTranscriptRows:
    mocks.collectAssignedHumanIdsFromTranscriptRows,
  renderTranscriptSegments: mocks.renderTranscriptSegments,
}));

import {
  loadEncounterSegments,
  retrieveEncounterSegments,
} from "./encounter-retrieval";

function baseSnapshot() {
  return {
    sessionId: "session-1",
    transcripts: [{ id: "transcript-1" }],
    participants: [{ humanId: "human-1" }],
  };
}

describe("retrieveEncounterSegments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns segments matching the query, ranked by term overlap", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue(baseSnapshot());
    mocks.collectAssignedHumanIdsFromTranscriptRows.mockReturnValue([]);
    mocks.loadHumansByIds.mockResolvedValue([]);
    mocks.buildRenderTranscriptRequestFromRows.mockReturnValue({
      transcripts: [],
      participant_human_ids: [],
      self_human_id: null,
      humans: [],
    });
    mocks.renderTranscriptSegments.mockResolvedValue([
      {
        id: "seg-1",
        speaker_label: "Patient",
        start_ms: 742_000,
        end_ms: 748_500,
        text: "It started Monday morning.",
      },
      {
        id: "seg-2",
        speaker_label: "Clinician",
        start_ms: 800_000,
        end_ms: 805_000,
        text: "Any history of blood clots?",
      },
      {
        id: "seg-3",
        speaker_label: "Patient",
        start_ms: 810_000,
        end_ms: 812_000,
        text: "No.",
      },
    ]);

    const results = await retrieveEncounterSegments(
      "session-1",
      "when did the pain start",
    );

    expect(results).toEqual([
      {
        segmentId: "seg-1",
        speaker: "Patient",
        startMs: 742_000,
        endMs: 748_500,
        text: "It started Monday morning.",
        matchedTerms: ["start"],
        score: expect.any(Number),
        sourceType: "transcript_direct",
      },
    ]);
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("returns an empty list when the session has no content", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue(null);

    const results = await retrieveEncounterSegments("missing-session", "pain");

    expect(results).toEqual([]);
    expect(mocks.loadHumansByIds).not.toHaveBeenCalled();
  });

  it("returns an empty list for a query with no meaningful terms", async () => {
    const results = await retrieveEncounterSegments("session-1", "  ");

    expect(results).toEqual([]);
    expect(mocks.loadSessionContentSnapshot).not.toHaveBeenCalled();
  });

  it("falls back to an index-based id when the renderer omits a segment id", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue(baseSnapshot());
    mocks.collectAssignedHumanIdsFromTranscriptRows.mockReturnValue([]);
    mocks.loadHumansByIds.mockResolvedValue([]);
    mocks.buildRenderTranscriptRequestFromRows.mockReturnValue({
      transcripts: [],
      participant_human_ids: [],
      self_human_id: null,
      humans: [],
    });
    mocks.renderTranscriptSegments.mockResolvedValue([
      {
        id: "",
        speaker_label: "Patient",
        start_ms: 0,
        end_ms: 1000,
        text: "penicillin allergy",
      },
    ]);

    const results = await retrieveEncounterSegments("session-1", "allergy");

    expect(results[0]!.segmentId).toBe("session-1:0");
  });

  it("returns a concise exact passage instead of an entire speaker block", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue(baseSnapshot());
    mocks.collectAssignedHumanIdsFromTranscriptRows.mockReturnValue([]);
    mocks.loadHumansByIds.mockResolvedValue([]);
    mocks.buildRenderTranscriptRequestFromRows.mockReturnValue({
      transcripts: [],
      participant_human_ids: [],
      self_human_id: null,
      humans: [],
    });
    mocks.renderTranscriptSegments.mockResolvedValue([
      {
        id: "seg-long",
        speaker_label: "Instructor",
        start_ms: 0,
        end_ms: 30_000,
        text: "First we reviewed sodium channels. The calcium gradient depends on free calcium, not total calcium. Then we moved on to membrane voltage.",
      },
    ]);

    const results = await retrieveEncounterSegments(
      "session-1",
      "free calcium gradient",
      1,
    );

    expect(results[0]).toMatchObject({
      text: "The calcium gradient depends on free calcium, not total calcium.",
      contextBefore: "First we reviewed sodium channels.",
      contextAfter: "Then we moved on to membrane voltage.",
      matchedTerms: ["free", "calcium", "gradient"],
    });
    expect(results[0]!.startMs).toBeGreaterThan(0);
    expect(results[0]!.endMs).toBeLessThan(30_000);
  });
});

describe("loadEncounterSegments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every segment in transcript order, unfiltered and unscored", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue(baseSnapshot());
    mocks.collectAssignedHumanIdsFromTranscriptRows.mockReturnValue([]);
    mocks.loadHumansByIds.mockResolvedValue([]);
    mocks.buildRenderTranscriptRequestFromRows.mockReturnValue({
      transcripts: [],
      participant_human_ids: [],
      self_human_id: null,
      humans: [],
    });
    mocks.renderTranscriptSegments.mockResolvedValue([
      {
        id: "seg-1",
        speaker_label: "Patient",
        start_ms: 0,
        end_ms: 1000,
        text: "Unrelated small talk.",
      },
      {
        id: "seg-2",
        speaker_label: "Doctor",
        start_ms: 1000,
        end_ms: 2000,
        text: "Let's schedule a follow-up in six months.",
      },
    ]);

    const segments = await loadEncounterSegments("session-1");

    expect(segments).toEqual([
      {
        segmentId: "seg-1",
        speaker: "Patient",
        startMs: 0,
        endMs: 1000,
        text: "Unrelated small talk.",
      },
      {
        segmentId: "seg-2",
        speaker: "Doctor",
        startMs: 1000,
        endMs: 2000,
        text: "Let's schedule a follow-up in six months.",
      },
    ]);
  });

  it("returns an empty list when the session has no content", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue(null);

    const segments = await loadEncounterSegments("missing-session");

    expect(segments).toEqual([]);
  });
});
