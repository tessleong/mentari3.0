-- Clinician cues and the structured encounter layer. Local-only and additive.
CREATE TABLE IF NOT EXISTS clinical_cues (
  id                    TEXT PRIMARY KEY NOT NULL,
  session_id            TEXT NOT NULL DEFAULT '',
  owner_user_id         TEXT NOT NULL DEFAULT '',
  captured_at_ms        INTEGER NOT NULL DEFAULT 0,
  text                  TEXT NOT NULL DEFAULT '',
  category              TEXT NOT NULL DEFAULT 'unclassified',
  source                TEXT NOT NULL DEFAULT 'clinician_entered',
  linked_transcript_id  TEXT NOT NULL DEFAULT '',
  linked_segment_key    TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at            TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS idx_clinical_cues_session_time
  ON clinical_cues (session_id, captured_at_ms, created_at);

CREATE TABLE IF NOT EXISTS clinical_cue_revisions (
  id                    TEXT PRIMARY KEY NOT NULL,
  cue_id                TEXT NOT NULL DEFAULT '',
  session_id            TEXT NOT NULL DEFAULT '',
  editor_user_id        TEXT NOT NULL DEFAULT '',
  text                  TEXT NOT NULL DEFAULT '',
  edited_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_clinical_cue_revisions_cue
  ON clinical_cue_revisions (cue_id, edited_at);

CREATE TABLE IF NOT EXISTS clinical_facts (
  id                    TEXT PRIMARY KEY NOT NULL,
  session_id            TEXT NOT NULL DEFAULT '',
  fact_type             TEXT NOT NULL DEFAULT '',
  value_json            TEXT NOT NULL DEFAULT '{}',
  confidence            TEXT NOT NULL DEFAULT 'uncertain',
  source_kind           TEXT NOT NULL DEFAULT 'model_inferred',
  source_id             TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'needs_review',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at            TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS idx_clinical_facts_session_status
  ON clinical_facts (session_id, status, fact_type);

CREATE TABLE IF NOT EXISTS clinical_fact_conflicts (
  id                    TEXT PRIMARY KEY NOT NULL,
  session_id            TEXT NOT NULL DEFAULT '',
  fact_id               TEXT NOT NULL DEFAULT '',
  conflicting_value_json TEXT NOT NULL DEFAULT '{}',
  source_kind           TEXT NOT NULL DEFAULT 'transcript_direct',
  source_id             TEXT NOT NULL DEFAULT '',
  resolution            TEXT NOT NULL DEFAULT 'unresolved',
  resolved_by           TEXT NOT NULL DEFAULT '',
  resolved_at           TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_clinical_fact_conflicts_session
  ON clinical_fact_conflicts (session_id, resolution, created_at);
