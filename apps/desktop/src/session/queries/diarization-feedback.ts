import { executeTransaction } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import { id } from "~/shared/utils";

export const DIARIZATION_FEEDBACK_REASONS = [
  "wrong_speaker",
  "missed_speaker",
  "transcript_words",
  "speaker_boundary",
  "overlapping_speech",
  "doctor_patient_label",
  "other",
] as const;

export type DiarizationFeedbackRating = "positive" | "negative";
export type DiarizationFeedbackReason =
  (typeof DIARIZATION_FEEDBACK_REASONS)[number];

export function recordDiarizationFeedback({
  sessionId,
  rating,
  reason,
  provider,
  modelVersion,
  speakerMode,
}: {
  sessionId: string;
  rating: DiarizationFeedbackRating;
  reason?: DiarizationFeedbackReason;
  provider?: string;
  modelVersion?: string;
  speakerMode?: string;
}): Promise<void> {
  return enqueueDatabaseWrite("diarization-feedback", async () => {
    await executeTransaction([
      {
        sql: `
          INSERT INTO diarization_feedback (
            id, session_id, provider, model_version, speaker_mode, rating, reason
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          id(),
          sessionId,
          provider ?? "",
          modelVersion ?? "",
          speakerMode ?? "",
          rating,
          reason ?? "",
        ],
      },
    ]);
  });
}
