import { useMutation } from "@tanstack/react-query";

import { sha256 } from "./hash";
import { fetchMedlinePlusTopics } from "./medlineplus";
import { fetchPmcOpenAccessDocuments, type PmcOpenAccessDocument } from "./pmc";
import {
  fetchPubMedArticles,
  type PubMedArticle,
  type StudyDesign,
} from "./pubmed";
import {
  BASELINE_EVIDENCE_WEIGHTS,
  rankEvidence,
  trainEvidenceWeights,
} from "./scoring";
import type { NormalizedEvidenceArticle } from "./sources";

import { executeTransaction, liveQueryClient, useLiveQuery } from "~/db";

export type ClinicalEvidenceRow = {
  id: string;
  pmid: string;
  pmcid: string;
  doi: string;
  title: string;
  abstract_text: string;
  journal: string;
  publication_year: number;
  publication_types_json: string;
  mesh_terms_json: string;
  study_design: StudyDesign;
  retraction_status: string;
  source_url: string;
  fetched_at: string;
  source_id: string;
  external_id: string;
};

export type ClinicalEvidenceSnapshot = {
  articleCount: number;
  retractionCount: number;
  latestRun: {
    status: string;
    query: string;
    fetchedCount: number;
    completedAt: string | null;
    error: string;
  } | null;
  checkpoint: {
    id: string;
    version: number;
    status: string;
    trainingExamples: number;
    weightsJson: string;
  } | null;
  auditCount: number;
};

const SNAPSHOT_SQL = `
  SELECT
    (SELECT COUNT(*) FROM clinical_evidence_articles) AS article_count,
    (SELECT COUNT(*) FROM clinical_evidence_articles WHERE retraction_status <> 'clear') AS retraction_count,
    (SELECT status FROM clinical_evidence_ingestion_runs ORDER BY started_at DESC LIMIT 1) AS run_status,
    (SELECT query FROM clinical_evidence_ingestion_runs ORDER BY started_at DESC LIMIT 1) AS run_query,
    (SELECT fetched_count FROM clinical_evidence_ingestion_runs ORDER BY started_at DESC LIMIT 1) AS run_fetched_count,
    (SELECT completed_at FROM clinical_evidence_ingestion_runs ORDER BY started_at DESC LIMIT 1) AS run_completed_at,
    (SELECT error FROM clinical_evidence_ingestion_runs ORDER BY started_at DESC LIMIT 1) AS run_error,
    (SELECT id FROM clinical_reranker_checkpoints ORDER BY version DESC LIMIT 1) AS checkpoint_id,
    (SELECT version FROM clinical_reranker_checkpoints ORDER BY version DESC LIMIT 1) AS checkpoint_version,
    (SELECT status FROM clinical_reranker_checkpoints ORDER BY version DESC LIMIT 1) AS checkpoint_status,
    (SELECT training_examples FROM clinical_reranker_checkpoints ORDER BY version DESC LIMIT 1) AS training_examples,
    (SELECT weights_json FROM clinical_reranker_checkpoints ORDER BY version DESC LIMIT 1) AS weights_json,
    (SELECT COUNT(*) FROM clinical_phi_audit_events) AS audit_count
`;

export function useClinicalEvidenceSnapshot() {
  return useLiveQuery<Record<string, unknown>, ClinicalEvidenceSnapshot>({
    sql: SNAPSHOT_SQL,
    mapRows: (rows) => {
      const row = rows[0] ?? {};
      const runStatus = stringValue(row.run_status);
      const checkpointId = stringValue(row.checkpoint_id);
      return {
        articleCount: numberValue(row.article_count),
        retractionCount: numberValue(row.retraction_count),
        latestRun: runStatus
          ? {
              status: runStatus,
              query: stringValue(row.run_query),
              fetchedCount: numberValue(row.run_fetched_count),
              completedAt: nullableString(row.run_completed_at),
              error: stringValue(row.run_error),
            }
          : null,
        checkpoint: checkpointId
          ? {
              id: checkpointId,
              version: numberValue(row.checkpoint_version),
              status: stringValue(row.checkpoint_status),
              trainingExamples: numberValue(row.training_examples),
              weightsJson: stringValue(row.weights_json),
            }
          : null,
        auditCount: numberValue(row.audit_count),
      };
    },
  });
}

export function useIngestPubMed() {
  return useMutation({
    mutationFn: async ({
      query,
      email,
      limit = 50,
      apiKey,
    }: {
      query: string;
      email: string;
      limit?: number;
      apiKey?: string;
    }) => {
      if (!query.trim()) throw new Error("Enter a PubMed query");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        throw new Error("NCBI requires a valid contact email");
      }
      const runId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      await executeTransaction([
        {
          sql: `INSERT INTO clinical_evidence_ingestion_runs
            (id, query, requested_count, started_at) VALUES (?, ?, ?, ?)`,
          params: [runId, query.trim(), limit, startedAt],
        },
      ]);
      try {
        const articles = await fetchPubMedArticles({
          query: query.trim(),
          email: email.trim(),
          limit,
          apiKey: apiKey?.trim() || undefined,
        });
        const existingPmids = new Set(
          articles.length === 0
            ? []
            : (
                await liveQueryClient.execute<{ pmid: string }>(
                  "SELECT pmid FROM clinical_evidence_articles WHERE pmid IN (" +
                    articles.map(() => "?").join(",") +
                    ")",
                  articles.map((article) => article.pmid),
                )
              ).map((row) => row.pmid),
        );
        const now = new Date().toISOString();
        await executeTransaction(
          articles.map((article) => articleUpsert(article, now)),
        );
        const pmcids = articles.map((article) => article.pmcid).filter(Boolean);
        let fullTextWarning = "";
        let documents: PmcOpenAccessDocument[] = [];
        try {
          documents = await fetchPmcOpenAccessDocuments(pmcids);
        } catch (error) {
          fullTextWarning = errorMessage(error);
        }
        const articleIds = new Map(
          pmcids.length === 0
            ? []
            : (
                await liveQueryClient.execute<{ id: string; pmcid: string }>(
                  `SELECT id, pmcid FROM clinical_evidence_articles WHERE pmcid IN (${pmcids.map(() => "?").join(",")})`,
                  pmcids,
                )
              ).map((row) => [row.pmcid, row.id] as const),
        );
        const documentStatements = documents.flatMap((document) =>
          documentUpserts(document, articleIds.get(document.pmcid) ?? "", now),
        );
        await executeTransaction([
          ...documentStatements,
          {
            sql: `UPDATE clinical_evidence_ingestion_runs SET
              status = ?, fetched_count = ?, inserted_count = ?, updated_count = ?, error = ?, completed_at = ?
              WHERE id = ?`,
            params: [
              fullTextWarning ? "completed_with_warnings" : "completed",
              articles.length,
              articles.filter((article) => !existingPmids.has(article.pmid))
                .length,
              articles.filter((article) => existingPmids.has(article.pmid))
                .length,
              fullTextWarning,
              now,
              runId,
            ],
          },
        ]);
        return articles.length;
      } catch (error) {
        await executeTransaction([
          {
            sql: `UPDATE clinical_evidence_ingestion_runs SET
              status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
            params: [errorMessage(error), new Date().toISOString(), runId],
          },
        ]);
        throw error;
      }
    },
  });
}

export function useIngestMedlinePlus() {
  return useMutation({
    mutationFn: async ({
      query,
      email,
      limit = 20,
    }: {
      query: string;
      email: string;
      limit?: number;
    }) => {
      if (!query.trim()) throw new Error("Enter a MedlinePlus query");
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        throw new Error("MedlinePlus requires a valid contact email");
      }
      const runId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      await executeTransaction([
        {
          sql: `INSERT INTO clinical_evidence_ingestion_runs
            (id, source, query, requested_count, started_at) VALUES (?, 'medline_plus', ?, ?, ?)`,
          params: [runId, query.trim(), limit, startedAt],
        },
      ]);
      try {
        const articles = await fetchMedlinePlusTopics({
          query: query.trim(),
          email: email.trim(),
          limit,
        });
        const now = new Date().toISOString();
        await executeTransaction(
          articles.map((article) => normalizedArticleUpsert(article, now)),
        );
        await executeTransaction([
          {
            sql: `UPDATE clinical_evidence_ingestion_runs SET
              status = 'completed', fetched_count = ?, completed_at = ? WHERE id = ?`,
            params: [articles.length, now, runId],
          },
          {
            sql: `UPDATE clinical_source_registry SET last_synced_at = ? WHERE id = 'medline_plus'`,
            params: [now],
          },
        ]);
        return articles.length;
      } catch (error) {
        await executeTransaction([
          {
            sql: `UPDATE clinical_evidence_ingestion_runs SET
              status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
            params: [errorMessage(error), new Date().toISOString(), runId],
          },
        ]);
        throw error;
      }
    },
  });
}

function normalizedArticleUpsert(
  article: NormalizedEvidenceArticle,
  now: string,
) {
  return {
    sql: `INSERT INTO clinical_evidence_articles (
      id, source_id, external_id, title, abstract_text, source_url,
      publication_year, source_sha256, fetched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, external_id) DO UPDATE SET
      title = excluded.title, abstract_text = excluded.abstract_text,
      source_url = excluded.source_url, publication_year = excluded.publication_year,
      source_sha256 = excluded.source_sha256, fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at`,
    params: [
      crypto.randomUUID(),
      article.sourceId,
      article.externalId,
      article.title,
      article.abstractText,
      article.sourceUrl,
      article.publicationYear,
      article.sourceSha256,
      now,
      now,
      now,
    ],
  };
}

function documentUpserts(
  document: PmcOpenAccessDocument,
  articleId: string,
  now: string,
) {
  if (!articleId || !document.pmcid) return [];
  const documentId = `pmc-oa:${document.pmcid}`;
  return [
    {
      sql: `INSERT INTO clinical_evidence_documents (
        id, article_id, source_id, external_id, content_format, license_id,
        license_url, commercial_use_allowed, redistribution_allowed,
        content_sha256, fetched_at
      ) VALUES (?, ?, 'pmc-oa', ?, 'bioc_json', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, external_id) DO UPDATE SET
        article_id = excluded.article_id, license_id = excluded.license_id,
        license_url = excluded.license_url,
        commercial_use_allowed = excluded.commercial_use_allowed,
        redistribution_allowed = excluded.redistribution_allowed,
        content_sha256 = excluded.content_sha256, fetched_at = excluded.fetched_at,
        deleted_at = NULL`,
      params: [
        documentId,
        articleId,
        document.pmcid,
        document.licenseId,
        document.licenseUrl,
        document.commercialUseAllowed ? 1 : 0,
        document.redistributionAllowed ? 1 : 0,
        document.contentSha256,
        now,
      ],
    },
    ...document.passages.map((passage, index) => ({
      sql: `INSERT INTO clinical_evidence_passages (
        id, document_id, article_id, section_kind, section_title, passage_index,
        content, content_sha256, token_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, passage_index) DO UPDATE SET
        article_id = excluded.article_id, section_kind = excluded.section_kind,
        section_title = excluded.section_title, content = excluded.content,
        content_sha256 = excluded.content_sha256, token_count = excluded.token_count`,
      params: [
        `${documentId}:${index}`,
        documentId,
        articleId,
        passage.sectionKind,
        passage.sectionTitle,
        index,
        passage.content,
        "",
        passage.content.split(/\s+/).length,
      ],
    })),
    {
      sql: `UPDATE clinical_evidence_articles SET
        license_id = ?, access_tier = 'pmc_open_access', updated_at = ? WHERE id = ?`,
      params: [document.licenseId, now, articleId],
    },
  ];
}

export async function searchClinicalEvidence(query: string, limit = 12) {
  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2),
    ),
  ];
  if (terms.length === 0) return [];
  const where = terms
    .map(
      () =>
        "(lower(a.title) LIKE ? OR lower(a.abstract_text) LIKE ? OR lower(a.mesh_terms_json) LIKE ? OR EXISTS (SELECT 1 FROM clinical_evidence_passages p WHERE p.article_id = a.id AND lower(p.content) LIKE ?))",
    )
    .join(" OR ");
  const params = terms.flatMap((term) => [
    `%${term}%`,
    `%${term}%`,
    `%${term}%`,
    `%${term}%`,
  ]);
  const rows = await liveQueryClient.execute<ClinicalEvidenceRow>(
    `SELECT a.* FROM clinical_evidence_articles a WHERE ${where} LIMIT 500`,
    params,
  );
  const checkpoint = await ensureBaselineCheckpoint();
  const weights = JSON.parse(
    checkpoint.weights_json,
  ) as typeof BASELINE_EVIDENCE_WEIGHTS;
  const ranked = rankEvidence(
    query,
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      abstractText: row.abstract_text,
      meshTerms: parseStringArray(row.mesh_terms_json),
      publicationYear: row.publication_year,
      studyDesign: row.study_design,
      retractionStatus: row.retraction_status,
    })),
    weights,
  ).slice(0, limit);
  const queryId = crypto.randomUUID();
  await executeTransaction([
    {
      sql: `INSERT INTO clinical_evidence_queries
        (id, query, checkpoint_id, corpus_revision, result_count) VALUES (?, ?, ?, ?, ?)`,
      params: [
        queryId,
        query,
        checkpoint.id,
        await corpusRevision(rows),
        ranked.length,
      ],
    },
    ...ranked.map((result, index) => ({
      sql: `INSERT INTO clinical_evidence_query_results
        (id, query_id, article_id, rank, score, score_explanation_json)
        VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        queryId,
        result.article.id,
        index + 1,
        result.score,
        JSON.stringify(result.explanation),
      ],
    })),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rankedIds = ranked.map((result) => result.article.id);
  const passages =
    rankedIds.length === 0
      ? []
      : await liveQueryClient.execute<{ article_id: string; content: string }>(
          `SELECT article_id, content FROM clinical_evidence_passages
           WHERE article_id IN (${rankedIds.map(() => "?").join(",")})
           ORDER BY passage_index`,
          rankedIds,
        );
  const excerpts = new Map<string, string>();
  for (const passage of passages) {
    if (!excerpts.has(passage.article_id)) {
      excerpts.set(passage.article_id, passage.content);
    }
  }
  return ranked.map((result) => ({
    ...result,
    article: byId.get(result.article.id)!,
    evidenceExcerpt:
      excerpts.get(result.article.id) ?? result.article.abstractText,
    queryId,
  }));
}

// Looks up already-ingested articles by PMID, without running a new search
// — used to display the sources a note's citations already point to (see
// citation-verification.ts's extractCitedPmids). Order matches `pmids`.
export async function fetchClinicalEvidenceByPmids(
  pmids: string[],
): Promise<Array<{ article: ClinicalEvidenceRow; excerpt: string }>> {
  const uniquePmids = [...new Set(pmids.filter(Boolean))];
  if (uniquePmids.length === 0) return [];

  const rows = await liveQueryClient.execute<ClinicalEvidenceRow>(
    `SELECT * FROM clinical_evidence_articles WHERE pmid IN (${uniquePmids.map(() => "?").join(",")})`,
    uniquePmids,
  );
  const articleIds = rows.map((row) => row.id);
  const passages =
    articleIds.length === 0
      ? []
      : await liveQueryClient.execute<{ article_id: string; content: string }>(
          `SELECT article_id, content FROM clinical_evidence_passages
           WHERE article_id IN (${articleIds.map(() => "?").join(",")})
           ORDER BY passage_index`,
          articleIds,
        );
  const excerptByArticleId = new Map<string, string>();
  for (const passage of passages) {
    if (!excerptByArticleId.has(passage.article_id)) {
      excerptByArticleId.set(passage.article_id, passage.content);
    }
  }

  const rowByPmid = new Map(rows.map((row) => [row.pmid, row]));
  return uniquePmids
    .map((pmid) => rowByPmid.get(pmid))
    .filter((row): row is ClinicalEvidenceRow => Boolean(row))
    .map((article) => ({
      article,
      excerpt: excerptByArticleId.get(article.id) || article.abstract_text,
    }));
}

export async function saveEvidenceLabel(input: {
  query: string;
  articleId: string;
  relevance: 0 | 1 | 2 | 3;
  reviewerId: string;
  rationale: string;
}) {
  await executeTransaction([
    {
      sql: `INSERT INTO clinical_evidence_labels
        (id, query, article_id, relevance, reviewer_id, rationale)
        VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        input.query.trim(),
        input.articleId,
        input.relevance,
        input.reviewerId.trim(),
        input.rationale.trim(),
      ],
    },
  ]);
}

export async function trainClinicalReranker() {
  const labels = await liveQueryClient.execute<
    ClinicalEvidenceRow & { query: string; relevance: number; label_id: string }
  >(`SELECT a.*, l.query, l.relevance, l.id AS label_id
     FROM clinical_evidence_labels l
     JOIN clinical_evidence_articles a ON a.id = l.article_id
     ORDER BY l.created_at, l.id`);
  if (labels.length < 4) {
    throw new Error(
      "At least four clinician-reviewed relevance labels are required",
    );
  }
  const examples = labels.map((row) => {
    const result = rankEvidence(row.query, [
      {
        id: row.id,
        title: row.title,
        abstractText: row.abstract_text,
        meshTerms: parseStringArray(row.mesh_terms_json),
        publicationYear: row.publication_year,
        studyDesign: row.study_design,
        retractionStatus: row.retraction_status,
      },
    ])[0];
    const features = result?.explanation ?? {
      lexical: 0,
      design: 0,
      recency: 0,
      retraction: row.retraction_status === "clear" ? 0 : 1,
    };
    return {
      features: {
        lexical: features.lexical,
        design: features.design,
        recency: features.recency,
        retraction: features.retraction,
      },
      relevance: row.relevance,
    };
  });
  const weights = trainEvidenceWeights(examples);
  const versions = await liveQueryClient.execute<{ version: number }>(
    "SELECT version FROM clinical_reranker_checkpoints ORDER BY version DESC LIMIT 1",
  );
  const version = (versions[0]?.version ?? 0) + 1;
  const datasetSha256 = await sha256(
    labels.map((row) => `${row.label_id}:${row.relevance}`).join("|"),
  );
  const id = crypto.randomUUID();
  await executeTransaction([
    {
      sql: `INSERT INTO clinical_reranker_checkpoints
        (id, version, status, weights_json, training_examples, metrics_json, dataset_sha256)
        VALUES (?, ?, 'trained_unvalidated', ?, ?, ?, ?)`,
      params: [
        id,
        version,
        JSON.stringify(weights),
        labels.length,
        JSON.stringify({ validation: "required_before_activation" }),
        datasetSha256,
      ],
    },
  ]);
  return { id, version, weights, trainingExamples: labels.length };
}

async function ensureBaselineCheckpoint() {
  const existing = await liveQueryClient.execute<{
    id: string;
    weights_json: string;
  }>(
    "SELECT id, weights_json FROM clinical_reranker_checkpoints ORDER BY version DESC LIMIT 1",
  );
  if (existing[0]) return existing[0];
  const id = crypto.randomUUID();
  await executeTransaction([
    {
      sql: `INSERT INTO clinical_reranker_checkpoints
        (id, version, status, weights_json, metrics_json)
        VALUES (?, 1, 'baseline_unvalidated', ?, ?)`,
      params: [
        id,
        JSON.stringify(BASELINE_EVIDENCE_WEIGHTS),
        JSON.stringify({
          note: "Expert-prior baseline; requires reviewed labels",
        }),
      ],
    },
  ]);
  return { id, weights_json: JSON.stringify(BASELINE_EVIDENCE_WEIGHTS) };
}

function articleUpsert(article: PubMedArticle, now: string) {
  return {
    sql: `INSERT INTO clinical_evidence_articles (
      id, pmid, pmcid, doi, title, abstract_text, journal, publication_year,
      publication_types_json, authors_json, mesh_terms_json, related_articles_json,
      study_design, retraction_status, source_url, source_revision, source_sha256,
      fetched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pmid) DO UPDATE SET
      pmcid = excluded.pmcid, doi = excluded.doi, title = excluded.title, abstract_text = excluded.abstract_text,
      journal = excluded.journal, publication_year = excluded.publication_year,
      publication_types_json = excluded.publication_types_json,
      authors_json = excluded.authors_json, mesh_terms_json = excluded.mesh_terms_json,
      related_articles_json = excluded.related_articles_json,
      study_design = excluded.study_design, retraction_status = excluded.retraction_status,
      source_url = excluded.source_url, source_revision = excluded.source_revision,
      source_sha256 = excluded.source_sha256, fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at`,
    params: [
      crypto.randomUUID(),
      article.pmid,
      article.pmcid,
      article.doi,
      article.title,
      article.abstractText,
      article.journal,
      article.publicationYear,
      JSON.stringify(article.publicationTypes),
      JSON.stringify(article.authors),
      JSON.stringify(article.meshTerms),
      JSON.stringify(article.relatedArticles),
      article.studyDesign,
      article.retractionStatus,
      article.sourceUrl,
      article.sourceRevision,
      article.sourceSha256,
      now,
      now,
      now,
    ],
  };
}

async function corpusRevision(rows: ClinicalEvidenceRow[]): Promise<string> {
  const payload = rows
    .map((row) => `${row.pmid}:${row.fetched_at}`)
    .sort()
    .join("|");
  return sha256(payload);
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
