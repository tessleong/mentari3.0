import type { TextStreamPart, ToolSet } from "ai";

// Matches the exact citation shape instructed in summary-evidence.ts's
// "Research Citation Rules": [PMID 12345678](https://pubmed.ncbi.nlm.nih.gov/12345678/)
const CITATION_PATTERN =
  /\[PMID (\d+)\]\(https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/\)/g;

export type CitationVerificationResult = {
  text: string;
  strippedPmids: string[];
};

// Reads back the PMIDs cited in an already-persisted, already-verified
// summary — used to show which sources a note actually references, without
// re-running retrieval. Order-preserving and de-duplicated.
export function extractCitedPmids(text: string): string[] {
  const seen = new Set<string>();
  const pmids: string[] = [];
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const [, labelPmid, urlPmid] = match;
    if (labelPmid !== urlPmid || seen.has(labelPmid)) {
      continue;
    }
    seen.add(labelPmid);
    pmids.push(labelPmid);
  }
  return pmids;
}

// For a surface that shows a citation as a separate element (e.g. a small
// link rendered next to a definition) rather than inline markdown — removes
// the citation markup entirely rather than converting it to plain "PMID X"
// text, then collapses any whitespace left behind so removing a citation
// from the middle or end of a sentence doesn't leave a double space or
// trailing space.
export function stripCitationMarkup(text: string): string {
  return text
    .replace(CITATION_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// The model is instructed never to invent a citation, but nothing upstream
// enforces that. This strips any [PMID X](url) that doesn't match a PMID we
// actually retrieved and injected into the prompt, converting it to plain
// unlinked text so it can no longer read as a verified reference.
export function stripUnverifiedCitations(
  text: string,
  allowedPmids: ReadonlySet<string>,
): CitationVerificationResult {
  const strippedPmids: string[] = [];
  const cleaned = text.replace(
    CITATION_PATTERN,
    (match, labelPmid, urlPmid) => {
      if (labelPmid === urlPmid && allowedPmids.has(labelPmid)) {
        return match;
      }
      strippedPmids.push(labelPmid);
      return `PMID ${labelPmid}`;
    },
  );
  return { text: cleaned, strippedPmids };
}

// A citation can be split across multiple stream chunks (e.g. "[PMID 123" in
// one delta, "45](https://...)" in the next), so we can't verify chunk by
// chunk. This buffers text until any open "[PMID" has a matching close paren,
// verifies the completed span, and only then yields it downstream.
export async function* verifyResearchCitationsInStream<
  TOOLS extends ToolSet = ToolSet,
>(
  stream: AsyncIterable<TextStreamPart<TOOLS>>,
  allowedPmids: ReadonlySet<string>,
): AsyncGenerator<TextStreamPart<TOOLS>> {
  let pending = "";
  let lastTextPart: TextStreamPart<TOOLS> | null = null;

  const flush = function* () {
    if (!pending || !lastTextPart) return;
    yield {
      ...lastTextPart,
      text: stripUnverifiedCitations(pending, allowedPmids).text,
    } as TextStreamPart<TOOLS>;
    pending = "";
  };

  for await (const part of stream) {
    if (part.type !== "text-delta") {
      yield* flush();
      yield part;
      continue;
    }

    pending += part.text;
    lastTextPart = part;

    const openIndex = pending.lastIndexOf("[PMID");
    const isSafeToFlush =
      openIndex === -1 || pending.indexOf(")", openIndex) !== -1;
    if (isSafeToFlush) {
      yield* flush();
    }
  }

  yield* flush();
}
