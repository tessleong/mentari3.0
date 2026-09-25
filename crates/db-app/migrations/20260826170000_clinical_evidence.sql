-- Local clinical evidence corpus, retrieval provenance, reranker checkpoints, and PHI audit controls.
-- Older builds ignore these additive, non-CloudSync tables.
CREATE TABLE IF NOT EXISTS clinical_evidence_articles (
  id                    TEXT PRIMARY KEY NOT NULL,
  pmid                  TEXT NOT NULL DEFAULT '',
  doi                   TEXT NOT NULL DEFAULT '',
  title                 TEXT NOT NULL DEFAULT '',
  abstract_text         TEXT NOT NULL DEFAULT '',
  journal               TEXT NOT NULL DEFAULT '',
  publication_year      INTEGER NOT NULL DEFAULT 0,
  publication_types_json TEXT NOT NULL DEFAULT '[]',
  authors_json          TEXT NOT NULL DEFAULT '[]',
  mesh_terms_json       TEXT NOT NULL DEFAULT '[]',
  related_articles_json TEXT NOT NULL DEFAULT '[]',
  study_design          TEXT NOT NULL DEFAULT 'other',
  retraction_status     TEXT NOT NULL DEFAULT 'clear',
  source_url            TEXT NOT NULL DEFAULT '',
  source_revision       TEXT NOT NULL DEFAULT '',
  source_sha256         TEXT NOT NULL DEFAULT '',
  fetched_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_evidence_articles_pmid
  ON clinical_evidence_articles (pmid) WHERE pmid <> '';
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_articles_year
  ON clinical_evidence_articles (publication_year DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_articles_design
  ON clinical_evidence_articles (study_design, retraction_status);

CREATE TABLE IF NOT EXISTS clinical_evidence_ingestion_runs (
  id                    TEXT PRIMARY KEY NOT NULL,
  source                TEXT NOT NULL DEFAULT 'pubmed',
  query                 TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'running',
  requested_count       INTEGER NOT NULL DEFAULT 0,
  fetched_count         INTEGER NOT NULL DEFAULT 0,
  inserted_count        INTEGER NOT NULL DEFAULT 0,
  updated_count         INTEGER NOT NULL DEFAULT 0,
  error                 TEXT NOT NULL DEFAULT '',
  started_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at          TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_clinical_evidence_ingestion_runs_started
  ON clinical_evidence_ingestion_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS clinical_evidence_labels (
  id                    TEXT PRIMARY KEY NOT NULL,
  query                 TEXT NOT NULL DEFAULT '',
  article_id            TEXT NOT NULL DEFAULT '',
  relevance             INTEGER NOT NULL DEFAULT 0 CHECK (relevance BETWEEN 0 AND 3),
  reviewer_id           TEXT NOT NULL DEFAULT '',
  rationale             TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_clinical_evidence_labels_query
  ON clinical_evidence_labels (query, created_at DESC);

CREATE TABLE IF NOT EXISTS clinical_reranker_checkpoints (
  id                    TEXT PRIMARY KEY NOT NULL,
  version               INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'unvalidated',
  feature_schema        TEXT NOT NULL DEFAULT 'mentari-evidence-v1',
  weights_json          TEXT NOT NULL DEFAULT '{}',
  training_examples     INTEGER NOT NULL DEFAULT 0,
  validation_examples   INTEGER NOT NULL DEFAULT 0,
  metrics_json          TEXT NOT NULL DEFAULT '{}',
  dataset_sha256        TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  activated_at          TEXT
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_reranker_checkpoints_version
  ON clinical_reranker_checkpoints (version);

CREATE TABLE IF NOT EXISTS clinical_evidence_queries (
  id                    TEXT PRIMARY KEY NOT NULL,
  query                 TEXT NOT NULL DEFAULT '',
  checkpoint_id         TEXT NOT NULL DEFAULT '',
  corpus_revision       TEXT NOT NULL DEFAULT '',
  result_count          INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS clinical_evidence_query_results (
  id                    TEXT PRIMARY KEY NOT NULL,
  query_id              TEXT NOT NULL DEFAULT '',
  article_id            TEXT NOT NULL DEFAULT '',
  rank                  INTEGER NOT NULL DEFAULT 0,
  score                 REAL NOT NULL DEFAULT 0,
  score_explanation_json TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_clinical_evidence_query_results_query
  ON clinical_evidence_query_results (query_id, rank);

CREATE TABLE IF NOT EXISTS clinical_phi_provider_policies (
  id                    TEXT PRIMARY KEY NOT NULL,
  provider_type         TEXT NOT NULL DEFAULT '',
  provider_id           TEXT NOT NULL DEFAULT '',
  route_kind            TEXT NOT NULL DEFAULT 'network',
  baa_attested          INTEGER NOT NULL DEFAULT 0,
  phi_allowed           INTEGER NOT NULL DEFAULT 0,
  attested_by           TEXT NOT NULL DEFAULT '',
  attested_at           TEXT,
  expires_at            TEXT,
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_phi_provider_policy
  ON clinical_phi_provider_policies (provider_type, provider_id);

CREATE TABLE IF NOT EXISTS clinical_phi_audit_events (
  id                    TEXT PRIMARY KEY NOT NULL,
  occurred_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_id              TEXT NOT NULL DEFAULT '',
  action                TEXT NOT NULL DEFAULT '',
  resource_type         TEXT NOT NULL DEFAULT '',
  resource_id_hash      TEXT NOT NULL DEFAULT '',
  provider_type         TEXT NOT NULL DEFAULT '',
  provider_id           TEXT NOT NULL DEFAULT '',
  decision              TEXT NOT NULL DEFAULT '',
  reason                TEXT NOT NULL DEFAULT '',
  contains_phi          INTEGER NOT NULL DEFAULT 0,
  previous_event_hash   TEXT NOT NULL DEFAULT '',
  event_hash            TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX IF NOT EXISTS idx_clinical_phi_audit_events_occurred
  ON clinical_phi_audit_events (occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS clinical_phi_audit_events_no_update
BEFORE UPDATE ON clinical_phi_audit_events
BEGIN
  SELECT RAISE(ABORT, 'clinical PHI audit events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS clinical_phi_audit_events_no_delete
BEFORE DELETE ON clinical_phi_audit_events
BEGIN
  SELECT RAISE(ABORT, 'clinical PHI audit events are append-only');
END;
