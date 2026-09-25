import { sha256 } from "./hash";

import { liveQueryClient, useLiveQuery } from "~/db";

// Mirrors the ids seeded into clinical_source_registry (see
// crates/db-app/migrations/20260826173000_clinical_full_text.sql and
// 20260830190000_clinical_evidence_sources.sql).
export type EvidenceSourceId =
  | "pubmed"
  | "pmc-oa"
  | "crossref"
  | "medline_plus"
  | "cdc"
  | "mayo_clinic"
  | "uptodate";

export type EvidenceAccessMode =
  | "open"
  | "license_scoped"
  | "unavailable"
  | "requires_license";

export type EvidenceSourceStatus = {
  id: EvidenceSourceId;
  displayName: string;
  sourceKind: string;
  baseUrl: string;
  accessMode: EvidenceAccessMode;
  termsUrl: string;
  attribution: string;
  enabled: boolean;
  lastSyncedAt: string | null;
};

// A source with no working public API today. isConfigured() always returns
// false; searching throws SourceUnavailableError instead of returning an
// empty result, so callers can tell "no matches" apart from "not connected
// yet" and the UI can show an honest status rather than silence.
export class SourceUnavailableError extends Error {
  constructor(
    public readonly sourceId: EvidenceSourceId,
    reason: string,
  ) {
    super(`${sourceId} is not yet connected: ${reason}`);
    this.name = "SourceUnavailableError";
  }
}

// A normalized shape non-PubMed sources map into so they can share the
// existing clinical_evidence_articles corpus, search, and citation pipeline.
// PubMed/PMC keep using their own richer PubMedArticle shape (see pubmed.ts);
// this is for everything ingested through repository.ts's generic path.
export type NormalizedEvidenceArticle = {
  sourceId: EvidenceSourceId;
  externalId: string;
  title: string;
  abstractText: string;
  sourceUrl: string;
  publicationYear: number;
  sourceSha256: string;
};

export async function hashEvidencePayload(payload: string): Promise<string> {
  return sha256(payload);
}

// Static display labels, kept in sync with clinical_source_registry's seed
// data. A synchronous lookup so UI code can label a source without a DB
// round-trip; useEvidenceSources() is the source of truth for anything else
// (access mode, terms, attribution).
const SOURCE_DISPLAY_LABELS: Record<string, string> = {
  pubmed: "PubMed",
  "pmc-oa": "PubMed Central",
  crossref: "Crossref",
  medline_plus: "MedlinePlus",
  cdc: "CDC",
  mayo_clinic: "Mayo Clinic",
  uptodate: "UpToDate",
};

export function sourceDisplayLabel(sourceId: string): string {
  return SOURCE_DISPLAY_LABELS[sourceId] ?? sourceId;
}

export function useEvidenceSources() {
  return useLiveQuery<Record<string, unknown>, EvidenceSourceStatus[]>({
    sql: `SELECT id, display_name, source_kind, base_url, access_mode, terms_url, attribution, enabled, last_synced_at
          FROM clinical_source_registry ORDER BY display_name`,
    mapRows: (rows) =>
      rows.map((row) => ({
        id: String(row.id) as EvidenceSourceId,
        displayName: String(row.display_name ?? ""),
        sourceKind: String(row.source_kind ?? ""),
        baseUrl: String(row.base_url ?? ""),
        accessMode: String(row.access_mode ?? "open") as EvidenceAccessMode,
        termsUrl: String(row.terms_url ?? ""),
        attribution: String(row.attribution ?? ""),
        enabled: Boolean(row.enabled),
        lastSyncedAt:
          typeof row.last_synced_at === "string" ? row.last_synced_at : null,
      })),
  });
}

export async function fetchEvidenceSource(
  id: EvidenceSourceId,
): Promise<EvidenceSourceStatus | null> {
  const rows = await liveQueryClient.execute<Record<string, unknown>>(
    `SELECT id, display_name, source_kind, base_url, access_mode, terms_url, attribution, enabled, last_synced_at
     FROM clinical_source_registry WHERE id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id) as EvidenceSourceId,
    displayName: String(row.display_name ?? ""),
    sourceKind: String(row.source_kind ?? ""),
    baseUrl: String(row.base_url ?? ""),
    accessMode: String(row.access_mode ?? "open") as EvidenceAccessMode,
    termsUrl: String(row.terms_url ?? ""),
    attribution: String(row.attribution ?? ""),
    enabled: Boolean(row.enabled),
    lastSyncedAt:
      typeof row.last_synced_at === "string" ? row.last_synced_at : null,
  };
}
