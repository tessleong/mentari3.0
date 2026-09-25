import type { SummaryMedicalEvidence } from "~/clinical/summary-evidence";

export type SessionRecord = {
  id: string;
  user_id: string;
  created_at: string;
  folder_id: string;
  event_json: string;
  title: string;
  raw_md: string;
  raw_template_id: string;
  locked: boolean;
  // The clinician's own count of who'll be in the room, independent of
  // (and preferred over) whichever participants happen to be attached — an
  // ad-hoc walk-in visit often has no attached participants at all, but the
  // clinician still knows there'll be a family member joining. Feeds speaker
  // diarization's speaker-count hint; null means "not specified".
  expected_speaker_count: number | null;
};

export type SessionChanges = Partial<
  Pick<
    SessionRecord,
    | "created_at"
    | "event_json"
    | "expected_speaker_count"
    | "folder_id"
    | "locked"
    | "raw_md"
    | "raw_template_id"
    | "title"
  >
>;

export type SessionSummaryRecord = {
  id: string;
  title: string;
  created_at: string;
};

export type EnhancedNoteRecord = {
  id: string;
  sessionId: string;
  title: string;
  content: string;
  templateId: string;
  position: number;
  // Research retrieved for this note's generation, independent of whether
  // the model chose to cite any of it inline — see
  // persistRetrievedResearchEvidence in clinical/summary-evidence.ts.
  researchEvidence: SummaryMedicalEvidence[];
};

export type SessionParticipantRecord = {
  id: string;
  sessionId: string;
  humanId: string;
  source: string;
  role: string;
  name: string;
  email: string;
  jobTitle: string;
  linkedinUsername: string;
  organizationId: string;
  organizationName: string;
};
