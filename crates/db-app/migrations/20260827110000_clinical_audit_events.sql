-- Operational encounter audit trail. Identifiers and metadata only; no raw PHI payloads.
CREATE TABLE IF NOT EXISTS clinical_audit_events (
  id                    TEXT PRIMARY KEY NOT NULL,
  session_id            TEXT NOT NULL DEFAULT '',
  actor_id              TEXT NOT NULL DEFAULT '',
  action                TEXT NOT NULL DEFAULT '',
  resource_type         TEXT NOT NULL DEFAULT '',
  resource_id_hash      TEXT NOT NULL DEFAULT '',
  metadata_json         TEXT NOT NULL DEFAULT '{}',
  occurred_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  previous_event_hash   TEXT NOT NULL DEFAULT '',
  event_hash            TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX IF NOT EXISTS idx_clinical_audit_events_session_time
  ON clinical_audit_events (session_id, occurred_at, id);
CREATE TRIGGER IF NOT EXISTS clinical_audit_events_no_update
BEFORE UPDATE ON clinical_audit_events
BEGIN
  SELECT RAISE(ABORT, 'clinical audit events are append-only');
END;
CREATE TRIGGER IF NOT EXISTS clinical_audit_events_no_delete
BEFORE DELETE ON clinical_audit_events
BEGIN
  SELECT RAISE(ABORT, 'clinical audit events are append-only');
END;
