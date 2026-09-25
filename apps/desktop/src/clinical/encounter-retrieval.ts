import { loadHumansByIds } from "~/contacts/queries";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import {
  buildRenderTranscriptRequestFromRows,
  collectAssignedHumanIdsFromTranscriptRows,
  renderTranscriptSegments,
} from "~/stt/render-transcript";

export type EncounterSegment = {
  segmentId: string;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type EncounterSegmentResult = EncounterSegment & {
  contextBefore?: string;
  contextAfter?: string;
  matchedTerms: string[];
  score: number;
  sourceType: "transcript_direct";
};

const QUERY_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "because",
  "before",
  "being",
  "discussed",
  "discusses",
  "during",
  "from",
  "have",
  "into",
  "just",
  "more",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
]);

/**
 * Loads every rendered speaker-turn segment for a session, in transcript
 * order, with no query filtering or scoring. Shared by the query-scored
 * retriever below and by anything that needs to scan the whole encounter
 * (e.g. next-steps extraction).
 */
export async function loadEncounterSegments(
  sessionId: string,
): Promise<EncounterSegment[]> {
  const snapshot = await loadSessionContentSnapshot(sessionId);
  if (!snapshot) return [];

  const participantHumanIds = snapshot.participants.map(
    (participant) => participant.humanId,
  );
  const assignedHumanIds = collectAssignedHumanIdsFromTranscriptRows(
    snapshot.transcripts,
  );
  const humanIds = [
    ...new Set([...participantHumanIds, ...assignedHumanIds].filter(Boolean)),
  ];
  const humans = await loadHumansByIds(humanIds);

  const request = buildRenderTranscriptRequestFromRows(
    snapshot.transcripts,
    {
      humans: humans
        .filter((human) => human.name)
        .map((human) => ({ human_id: human.id, name: human.name })),
    },
    participantHumanIds,
  );
  if (!request) return [];

  const segments = await renderTranscriptSegments(request);

  return segments.map((segment, index) => ({
    segmentId: segment.id || `${sessionId}:${index}`,
    speaker: segment.speaker_label,
    startMs: segment.start_ms,
    endMs: segment.end_ms,
    text: segment.text,
  }));
}

export async function retrieveEncounterSegments(
  sessionId: string,
  query: string,
  limit = 8,
): Promise<EncounterSegmentResult[]> {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const segments = await loadEncounterSegments(sessionId);

  return segments
    .flatMap((segment) => scoreSegmentPassages(segment, terms))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function tokenizeQuery(query: string): string[] {
  const words = [
    ...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []),
  ].filter((term) => term.length > 2);
  const informativeWords = words.filter((term) => !QUERY_STOP_WORDS.has(term));
  return informativeWords.length > 0 ? informativeWords : words;
}

function scoreSegmentPassages(
  segment: EncounterSegment,
  terms: string[],
): EncounterSegmentResult[] {
  const passages = splitTranscriptPassages(segment.text);
  return passages.map((passage, index) => {
    const lower = passage.text.toLowerCase();
    const matchedTerms = terms.filter((term) => lower.includes(term));
    const coverage = matchedTerms.length / terms.length;
    const specificity = matchedTerms.length / Math.max(tokenCount(lower), 1);
    const duration = Math.max(segment.endMs - segment.startMs, 0);
    const startRatio = passage.startOffset / Math.max(segment.text.length, 1);
    const endRatio = passage.endOffset / Math.max(segment.text.length, 1);

    return {
      ...segment,
      segmentId:
        passages.length === 1
          ? segment.segmentId
          : `${segment.segmentId}:passage:${index}`,
      startMs: Math.round(segment.startMs + duration * startRatio),
      endMs: Math.round(segment.startMs + duration * endRatio),
      text: passage.text,
      ...(passages[index - 1]
        ? { contextBefore: passages[index - 1].text }
        : {}),
      ...(passages[index + 1]
        ? { contextAfter: passages[index + 1].text }
        : {}),
      matchedTerms,
      score: coverage + specificity * 0.2,
      sourceType: "transcript_direct" as const,
    };
  });
}

function splitTranscriptPassages(text: string): Array<{
  text: string;
  startOffset: number;
  endOffset: number;
}> {
  const passages = [...text.matchAll(/[^.!?]+(?:[.!?]+|$)/g)]
    .map((match) => {
      const raw = match[0];
      const leadingWhitespace = raw.length - raw.trimStart().length;
      const passageText = raw.trim();
      const startOffset = (match.index ?? 0) + leadingWhitespace;
      return {
        text: passageText,
        startOffset,
        endOffset: startOffset + passageText.length,
      };
    })
    .filter((passage) => passage.text.length > 0);

  return passages.length > 0
    ? passages
    : [{ text, startOffset: 0, endOffset: text.length }];
}

function tokenCount(text: string): number {
  return text.match(/[a-z0-9]+/g)?.length ?? 0;
}
