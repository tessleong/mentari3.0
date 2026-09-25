-- Rights-aware source registry and normalized full-text passages.
-- Older builds ignore these additive, non-CloudSync tables and columns.
ALTER TABLE clinical_evidence_articles ADD COLUMN pmcid TEXT NOT NULL DEFAULT '';
ALTER TABLE clinical_evidence_articles ADD COLUMN license_id TEXT NOT NULL DEFAULT '';
ALTER TABLE clinical_evidence_articles ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'metadata_only';

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_evidence_articles_pmcid
  ON clinical_evidence_articles (pmcid) WHERE pmcid <> '';

CREATE TABLE IF NOT EXISTS clinical_source_registry (
  id                    TEXT PRIMARY KEY NOT NULL,
  display_name          TEXT NOT NULL DEFAULT '',
  source_kind           TEXT NOT NULL DEFAULT '',
  base_url              TEXT NOT NULL DEFAULT '',
  access_mode           TEXT NOT NULL DEFAULT 'open',
  terms_url             TEXT NOT NULL DEFAULT '',
  attribution           TEXT NOT NULL DEFAULT '',
  enabled               INTEGER NOT NULL DEFAULT 1,
  last_synced_at        TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT OR IGNORE INTO clinical_source_registry
  (id, display_name, source_kind, base_url, access_mode, terms_url, attribution)
VALUES
  ('pubmed', 'PubMed', 'bibliographic_metadata', 'https://pubmed.ncbi.nlm.nih.gov/', 'open',
   'https://www.ncbi.nlm.nih.gov/home/about/policies/', 'National Library of Medicine PubMed'),
  ('pmc-oa', 'PMC Open Access Subset', 'full_text', 'https://pmc.ncbi.nlm.nih.gov/', 'license_scoped',
   'https://pmc.ncbi.nlm.nih.gov/tools/openftlist/', 'PMC Open Access Subset, National Library of Medicine'),
  ('crossref', 'Crossref', 'metadata_integrity', 'https://api.crossref.org/', 'open',
   'https://www.crossref.org/documentation/retrieve-metadata/', 'Crossref metadata');

CREATE TABLE IF NOT EXISTS clinical_evidence_documents (
  id                    TEXT PRIMARY KEY NOT NULL,
  article_id            TEXT NOT NULL DEFAULT '',
  source_id             TEXT NOT NULL DEFAULT '',
  external_id           TEXT NOT NULL DEFAULT '',
  content_format        TEXT NOT NULL DEFAULT '',
  license_id            TEXT NOT NULL DEFAULT '',
  license_url           TEXT NOT NULL DEFAULT '',
  commercial_use_allowed INTEGER NOT NULL DEFAULT 0,
  redistribution_allowed INTEGER NOT NULL DEFAULT 0,
  entitlement_id        TEXT NOT NULL DEFAULT '',
  content_sha256        TEXT NOT NULL DEFAULT '',
  source_revision       TEXT NOT NULL DEFAULT '',
  fetched_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at            TEXT
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_evidence_documents_source_external
  ON clinical_evidence_documents (source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_documents_article
  ON clinical_evidence_documents (article_id, deleted_at);

CREATE TABLE IF NOT EXISTS clinical_evidence_passages (
  id                    TEXT PRIMARY KEY NOT NULL,
  document_id           TEXT NOT NULL DEFAULT '',
  article_id            TEXT NOT NULL DEFAULT '',
  section_kind          TEXT NOT NULL DEFAULT '',
  section_title         TEXT NOT NULL DEFAULT '',
  passage_index         INTEGER NOT NULL DEFAULT 0,
  content               TEXT NOT NULL DEFAULT '',
  content_sha256        TEXT NOT NULL DEFAULT '',
  token_count           INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_evidence_passages_document_index
  ON clinical_evidence_passages (document_id, passage_index);
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_passages_article
  ON clinical_evidence_passages (article_id, section_kind);
