-- Local-only structured feedback on diarization/transcription quality. Never
-- leaves the device and is never included in e2ee sync (no dirty-row
-- triggers reference this table), matching the voiceprint tables' pattern.
CREATE TABLE IF NOT EXISTS diarization_feedback (
  id             TEXT PRIMARY KEY NOT NULL,
  session_id     TEXT NOT NULL DEFAULT '',
  sync_scope     TEXT NOT NULL DEFAULT 'local_only' CHECK (sync_scope = 'local_only'),
  provider       TEXT NOT NULL DEFAULT '',
  model_version  TEXT NOT NULL DEFAULT '',
  speaker_mode   TEXT NOT NULL DEFAULT '',
  rating         TEXT NOT NULL DEFAULT '' CHECK (rating IN ('positive', 'negative')),
  reason         TEXT NOT NULL DEFAULT '' CHECK (
    reason IN (
      '', 'wrong_speaker', 'missed_speaker', 'transcript_words',
      'speaker_boundary', 'overlapping_speech', 'doctor_patient_label', 'other'
    )
  ),
  metadata_json  TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_diarization_feedback_session
  ON diarization_feedback (session_id, created_at);

CREATE TRIGGER IF NOT EXISTS diarization_feedback_no_update
BEFORE UPDATE ON diarization_feedback
BEGIN
  SELECT RAISE(ABORT, 'diarization feedback is append-only');
END;

CREATE TRIGGER IF NOT EXISTS diarization_feedback_no_delete
BEFORE DELETE ON diarization_feedback
BEGIN
  SELECT RAISE(ABORT, 'diarization feedback is append-only');
END;
