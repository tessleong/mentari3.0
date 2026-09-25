-- Generic per-source identity for clinical_evidence_articles, plus registry
-- entries for accredited sources beyond PubMed/PMC (MedlinePlus, CDC, Mayo
-- Clinic, UpToDate), so they can share the same corpus/search/citation
-- pipeline. Older builds ignore these additive columns and rows.
ALTER TABLE clinical_evidence_articles ADD COLUMN source_id TEXT NOT NULL DEFAULT 'pubmed';
ALTER TABLE clinical_evidence_articles ADD COLUMN external_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_evidence_articles_source_external
  ON clinical_evidence_articles (source_id, external_id) WHERE external_id <> '';
CREATE INDEX IF NOT EXISTS idx_clinical_evidence_articles_source
  ON clinical_evidence_articles (source_id);

-- access_mode: 'open' sources have a free, keyless (or key-optional) API we
-- ingest from today. 'unavailable' and 'requires_license' sources have no
-- usable public API; they're registered so the app can show them as known,
-- not-yet-connected sources rather than silently omitting them.
INSERT OR IGNORE INTO clinical_source_registry
  (id, display_name, source_kind, base_url, access_mode, terms_url, attribution, enabled)
VALUES
  ('medline_plus', 'MedlinePlus', 'consumer_health', 'https://medlineplus.gov/', 'open',
   'https://medlineplus.gov/about/using/usingmedlineplus/', 'National Library of Medicine MedlinePlus', 1),
  ('cdc', 'CDC', 'public_health_guidance', 'https://www.cdc.gov/', 'unavailable',
   'https://www.cdc.gov/other/agencymaterials.html', 'Centers for Disease Control and Prevention', 0),
  ('mayo_clinic', 'Mayo Clinic', 'clinical_reference', 'https://www.mayoclinic.org/', 'unavailable',
   'https://www.mayoclinic.org/about-this-site/terms-conditions-use-policy',
   'Mayo Foundation for Medical Education and Research', 0),
  ('uptodate', 'UpToDate', 'clinical_decision_support', 'https://www.uptodate.com/', 'requires_license',
   'https://www.wolterskluwer.com/en/know/terms-of-use', 'Wolters Kluwer UpToDate', 0);
