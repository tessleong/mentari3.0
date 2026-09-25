import { generateText, type LanguageModel } from "ai";

import { hasPlausibleClinicalContent } from "./medical-terms";
import { fetchPubMedArticles, type StudyDesign } from "./pubmed";
import { rankEvidence } from "./scoring";

import { getGenerationMaxRetries } from "~/ai/generation-retries";
import { executeTransaction } from "~/db";

export const DOCTORS_VISIT_TEMPLATE_ID = "default-doctors-visit";

const NCBI_CONTACT_EMAIL = "founders@anarlog.so";
const PUBMED_TIMEOUT_MS = 8_000;
const MAX_EVIDENCE_SOURCES = 4;
const TOPIC_EXTRACTION_MAX_OUTPUT_TOKENS = 60;
const MAX_TOPIC_TERMS = 3;

export type SummaryMedicalEvidence = {
  pmid: string;
  title: string;
  abstractText: string;
  journal: string;
  publicationYear: number;
  studyDesign: StudyDesign;
  sourceUrl: string;
};

/**
 * Identifies the 1-3 specific clinical/research terms this text is
 * genuinely, centrally about — as opposed to counting word frequency, which
 * cannot distinguish a conversation's real subject from incidental
 * vocabulary (e.g. a device-data meeting that mentions "heart rate" as a
 * sensor reading is not "about" cardiology). Returns null for content with
 * no real clinical/research topic, including a cheap pre-filter that skips
 * the model call entirely when the text has no clinical-adjacent
 * vocabulary at all.
 */
export async function extractResearchTopicTerms(
  transcriptText: string,
  model: LanguageModel,
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (!hasPlausibleClinicalContent(transcriptText)) {
    return null;
  }

  const { text } = await generateText({
    model,
    prompt: `Identify the 1-3 most specific clinical, medical, or research terms or short phrases (2-4 words each) that the conversation below is CENTRALLY, SUBSTANTIVELY about — precise enough to find directly relevant PubMed literature.

Ignore anything mentioned only in passing, incidentally, or in a non-clinical context (e.g. a technical or business conversation that happens to mention a biometric reading, like "heart rate" as sensor data, is not "about" cardiology).

Reply with EXACTLY a comma-separated list of 1-3 terms, or the single word NONE if the conversation is not centrally about a specific clinical, medical, or research topic at all. No other text.

# Transcript
${transcriptText}`,
    maxOutputTokens: TOPIC_EXTRACTION_MAX_OUTPUT_TOKENS,
    temperature: 0,
    maxRetries: getGenerationMaxRetries(model),
    abortSignal: signal,
  });

  const trimmed = text.trim();
  if (!trimmed || /^none$/i.test(trimmed)) {
    return null;
  }

  const terms = trimmed
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, MAX_TOPIC_TERMS);

  return terms.length > 0 ? terms : null;
}

/**
 * ANDs the given terms together so a returned article must relate to their
 * combination, not just any single one — the key relevance fix over the
 * previous frequency-based OR query, which returned any article matching
 * even one incidental keyword in isolation.
 */
export function buildEvidenceQueryFromTerms(terms: string[]): string {
  const core = terms.map((term) => `"${term}"[Title/Abstract]`).join(" AND ");

  return `(${core}) AND (systematic review[pt] OR meta-analysis[pt] OR practice guideline[pt] OR randomized controlled trial[pt] OR review[pt])`;
}

export async function buildThematicEvidenceQuery(
  transcriptText: string,
  model: LanguageModel,
  signal?: AbortSignal,
): Promise<string | null> {
  const terms = await extractResearchTopicTerms(transcriptText, model, signal);
  return terms ? buildEvidenceQueryFromTerms(terms) : null;
}

export async function retrieveSummaryMedicalEvidence(
  query: string,
  signal: AbortSignal,
): Promise<SummaryMedicalEvidence[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBMED_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();

  try {
    const articles = (
      await fetchPubMedArticles({
        query,
        limit: 8,
        email: NCBI_CONTACT_EMAIL,
        signal: controller.signal,
      })
    ).filter((article) => article.retractionStatus === "clear");
    const lexicalQuery = [...query.matchAll(/"([^"]+)"\[Title\/Abstract\]/g)]
      .map((match) => match[1])
      .join(" ");
    const ranked = rankEvidence(
      lexicalQuery,
      articles.map((article) => ({
        id: article.pmid,
        title: article.title,
        abstractText: article.abstractText,
        meshTerms: article.meshTerms,
        publicationYear: article.publicationYear,
        studyDesign: article.studyDesign,
        retractionStatus: article.retractionStatus,
      })),
    );
    const byPmid = new Map(articles.map((article) => [article.pmid, article]));
    const selected = (
      ranked.length > 0
        ? ranked.map((result) => byPmid.get(result.article.id)!)
        : articles
    ).slice(0, MAX_EVIDENCE_SOURCES);

    return selected.map((article) => ({
      pmid: article.pmid,
      title: article.title,
      abstractText: article.abstractText,
      journal: article.journal,
      publicationYear: article.publicationYear,
      studyDesign: article.studyDesign,
      sourceUrl: article.sourceUrl,
    }));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

/**
 * Records the evidence retrieved for a note's generation, independent of
 * which (if any) of it the model chose to cite inline — so the research
 * panel can show what was actually found rather than being gated on the
 * model's own citation behavior, which the retrieval prompt only asks for
 * conditionally. Best-effort: a failure here shouldn't fail generation.
 */
export async function persistRetrievedResearchEvidence(
  enhancedNoteId: string,
  evidence: SummaryMedicalEvidence[],
): Promise<void> {
  await executeTransaction([
    {
      sql: `
        UPDATE session_documents
        SET generation_metadata_json = json_set(
          CASE
            WHEN json_valid(generation_metadata_json) THEN generation_metadata_json
            ELSE '{}'
          END,
          '$.researchEvidence', json(?)
        )
        WHERE id = ?
          AND kind IN ('summary', 'template_output')
          AND deleted_at IS NULL
      `,
      params: [JSON.stringify(evidence), enhancedNoteId],
    },
  ]);
}

export function appendResearchEvidence(
  prompt: string,
  evidence: SummaryMedicalEvidence[],
): string {
  if (evidence.length === 0) return prompt;

  const sources = evidence
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} (${source.journal || "Unknown journal"}, ${source.publicationYear || "undated"}; ${source.studyDesign}; PMID ${source.pmid})\n   ${source.abstractText.slice(0, 1_200)}\n   ${source.sourceUrl}`,
    )
    .join("\n\n");

  return `${prompt}

# Retrieved Research Evidence

The sources below provide general medical context, not facts about this patient or visit.

${sources}

# Research Citation Rules

- Keep patient-specific facts, diagnoses, and instructions grounded only in the visit transcript and notes.
- When a retrieved source directly supports a general medical claim in the summary, cite it inline with a markdown link in the form [PMID 12345678](https://pubmed.ncbi.nlm.nih.gov/12345678/).
- Do not cite a source merely because it shares a keyword. Omit unsupported general claims and never invent a citation.
- Do not use research evidence to infer a diagnosis, change the clinician's plan, or add treatment advice that was not discussed.
- Research links are informational and are not a substitute for advice from a qualified clinician.`;
}
