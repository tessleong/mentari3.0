import { generateText, type LanguageModel } from "ai";

import {
  extractCitedPmids,
  stripCitationMarkup,
} from "./citation-verification";
import {
  loadEncounterSegments,
  type EncounterSegment,
} from "./encounter-retrieval";
import {
  buildThematicEvidenceQuery,
  retrieveSummaryMedicalEvidence,
  type SummaryMedicalEvidence,
} from "./summary-evidence";

import { getGenerationMaxRetries } from "~/ai/generation-retries";

export type PlainEnglishLine = EncounterSegment & {
  plainEnglish: string | null;
  citedPmids: string[];
};

const MAX_OUTPUT_TOKENS = 16_000;
// Matches "[SEG_<id>] <definition text up to the next [SEG_ tag or end of
// string>". Stops only at the next [SEG_ tag (not at any "[") so a citation
// like "[PMID 123](...)" embedded in the definition isn't cut off partway
// through — a plain "stop at the next bracket" pattern would truncate the
// definition right before its own citation.
const SEGMENT_TAG_PATTERN = /\[SEG_([^\]]+)\]\s*([\s\S]*?)(?=\[SEG_|$)/g;

function formatEvidenceBlock(evidence: SummaryMedicalEvidence[]): string {
  if (evidence.length === 0) return "";

  const sources = evidence
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} (${source.journal || "Unknown journal"}, ${source.publicationYear || "undated"}; ${source.studyDesign}; PMID ${source.pmid})\n   ${source.abstractText.slice(0, 1_200)}\n   ${source.sourceUrl}`,
    )
    .join("\n\n");

  return `

# Retrieved Research Evidence

The sources below provide general background on this conversation's topic — use them only to help define a flagged term, never as facts about this specific patient or visit.

${sources}

# Citation Rules

- Cite a source inline with a markdown link in the form [PMID 12345678](https://pubmed.ncbi.nlm.nih.gov/12345678/) only when it directly supports or helps define the specific term you are explaining.
- Do not cite a source merely because it shares a keyword with the term. Never cite a source that is not listed above, and never invent a citation.`;
}

function buildPrompt(
  segments: EncounterSegment[],
  evidence: SummaryMedicalEvidence[],
): string {
  const lines = segments
    .map(
      (segment) =>
        `[SEG_${segment.segmentId}] ${segment.speaker}: ${segment.text}`,
    )
    .join("\n");

  return `Read through the transcript below carefully and identify only the specific words, phrases, or moments that use medical jargon, clinical terminology, research or scientific terms, or language that is uncommon in everyday speech and could be misunderstood by someone without specialized training.

For each tagged line that contains such a term:
- Reply with that line's exact [SEG_xxx] tag, followed by a short, clear PLAIN-ENGLISH DEFINITION of the specific flagged term or phrase — not a paraphrase of the whole sentence, and not a restatement of ordinary conversation.
- Never phrase it as a diagnosis or medical advice (no "you have X"). Describe only what the term means, or what was discussed.${formatEvidenceBlock(evidence)}

For every tagged line that is ordinary conversational language — small talk, logistics, pleasantries, or wording that is already plain and needs no explanation — do NOT reply for that line at all. Skip it entirely. Do not produce an entry for every line, and do not enumerate or list every term you notice — only the ones genuinely worth defining.

Reply ONLY with tagged lines for the lines you are flagging, one per flagged line, in this format, and nothing else (no headers, no commentary, no notes about lines you skipped):
[SEG_xxx] <definition>

# Transcript
${lines}`;
}

function parseTranslations(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of text.matchAll(SEGMENT_TAG_PATTERN)) {
    const [, id, translation] = match;
    const trimmed = translation?.trim();
    if (id && trimmed) {
      result.set(id, trimmed);
    }
  }
  return result;
}

/**
 * Translates a session's transcript into plain English, flagging only lines
 * that contain jargon or terminology worth defining — most lines are
 * ordinary conversation and are expected to have no entry at all, not a
 * fallback message. A single bulk generation call rather than one call per
 * line — segments are tagged with their own ID in both the prompt and the
 * expected reply, so a skipped line and a genuinely-flagged line are
 * indistinguishable to the parser, which is exactly the desired behavior
 * now that skipping is the common case, not a failure mode.
 */
export async function translatePlainEnglish(
  sessionId: string,
  model: LanguageModel,
  signal?: AbortSignal,
): Promise<PlainEnglishLine[]> {
  const segments = await loadEncounterSegments(sessionId);
  if (segments.length === 0) {
    return [];
  }

  const transcriptText = segments.map((segment) => segment.text).join(" ");
  const effectiveSignal = signal ?? new AbortController().signal;

  let evidence: SummaryMedicalEvidence[] = [];
  try {
    const query = await buildThematicEvidenceQuery(
      transcriptText,
      model,
      effectiveSignal,
    );
    if (query) {
      evidence = await retrieveSummaryMedicalEvidence(query, effectiveSignal);
    }
  } catch (error) {
    if (effectiveSignal.aborted) throw error;
    console.error("[plain-english] failed to retrieve PubMed evidence", error);
  }

  const { text } = await generateText({
    model,
    prompt: buildPrompt(segments, evidence),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: getGenerationMaxRetries(model),
    abortSignal: signal,
  });

  const allowedPmids = new Set(evidence.map((source) => source.pmid));
  const translations = parseTranslations(text);

  return segments.map((segment) => {
    const rawEntry = translations.get(segment.segmentId);
    if (!rawEntry) {
      return { ...segment, plainEnglish: null, citedPmids: [] };
    }

    // Citation markup is always removed from the display text — this
    // surface never renders inline markdown, so even a verified citation's
    // link is shown separately (see plain-english.tsx), and a hallucinated
    // one must leave no residual "PMID xxx" text behind, unlike
    // stripUnverifiedCitations's plain-text fallback (designed for a
    // surface that DOES render the surrounding markdown).
    const citedPmids = extractCitedPmids(rawEntry).filter((pmid) =>
      allowedPmids.has(pmid),
    );
    const cleanText = stripCitationMarkup(rawEntry);
    return {
      ...segment,
      plainEnglish: cleanText || null,
      citedPmids: cleanText ? citedPmids : [],
    };
  });
}
