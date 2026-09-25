import { describe, expect, it } from "vitest";

import {
  extractCitedPmids,
  stripCitationMarkup,
  stripUnverifiedCitations,
  verifyResearchCitationsInStream,
} from "./citation-verification";

describe("extractCitedPmids", () => {
  it("extracts pmids in first-seen order, de-duplicated", () => {
    const text =
      "First [PMID 1](https://pubmed.ncbi.nlm.nih.gov/1/), then " +
      "[PMID 2](https://pubmed.ncbi.nlm.nih.gov/2/), and again " +
      "[PMID 1](https://pubmed.ncbi.nlm.nih.gov/1/).";

    expect(extractCitedPmids(text)).toEqual(["1", "2"]);
  });

  it("ignores a citation whose label and url pmids disagree", () => {
    const text = "Per [PMID 123](https://pubmed.ncbi.nlm.nih.gov/999/), rest.";

    expect(extractCitedPmids(text)).toEqual([]);
  });

  it("returns an empty list for text with no citations", () => {
    expect(extractCitedPmids("No citations here.")).toEqual([]);
  });
});

describe("stripCitationMarkup", () => {
  it("removes a citation at the end of a sentence", () => {
    const text =
      "Elevated troponin. [PMID 123](https://pubmed.ncbi.nlm.nih.gov/123/)";
    expect(stripCitationMarkup(text)).toBe("Elevated troponin.");
  });

  it("removes a citation in the middle of a sentence without leaving a double space", () => {
    const text =
      "A protein [PMID 123](https://pubmed.ncbi.nlm.nih.gov/123/) that helps clotting.";
    expect(stripCitationMarkup(text)).toBe("A protein that helps clotting.");
  });

  it("removes multiple citations", () => {
    const text =
      "See [PMID 1](https://pubmed.ncbi.nlm.nih.gov/1/) and [PMID 2](https://pubmed.ncbi.nlm.nih.gov/2/) for more.";
    expect(stripCitationMarkup(text)).toBe("See and for more.");
  });

  it("returns text with no citation unchanged", () => {
    expect(stripCitationMarkup("A protein that helps clotting.")).toBe(
      "A protein that helps clotting.",
    );
  });
});

describe("stripUnverifiedCitations", () => {
  it("leaves a citation whose PMID was actually retrieved untouched", () => {
    const text = "Per [PMID 123](https://pubmed.ncbi.nlm.nih.gov/123/), rest.";
    const result = stripUnverifiedCitations(text, new Set(["123"]));

    expect(result.text).toBe(text);
    expect(result.strippedPmids).toEqual([]);
  });

  it("strips a citation whose PMID was never retrieved", () => {
    const text = "Per [PMID 999](https://pubmed.ncbi.nlm.nih.gov/999/), rest.";
    const result = stripUnverifiedCitations(text, new Set(["123"]));

    expect(result.text).toBe("Per PMID 999, rest.");
    expect(result.strippedPmids).toEqual(["999"]);
  });

  it("strips a citation when no evidence was retrieved at all", () => {
    const text = "Per [PMID 999](https://pubmed.ncbi.nlm.nih.gov/999/), rest.";
    const result = stripUnverifiedCitations(text, new Set());

    expect(result.text).toBe("Per PMID 999, rest.");
    expect(result.strippedPmids).toEqual(["999"]);
  });

  it("strips a citation whose label and URL PMIDs disagree, even if one matches", () => {
    const text = "Per [PMID 123](https://pubmed.ncbi.nlm.nih.gov/999/), rest.";
    const result = stripUnverifiedCitations(text, new Set(["123", "999"]));

    expect(result.text).toBe("Per PMID 123, rest.");
    expect(result.strippedPmids).toEqual(["123"]);
  });

  it("handles a mix of verified and fabricated citations in the same text", () => {
    const text =
      "First [PMID 1](https://pubmed.ncbi.nlm.nih.gov/1/) then [PMID 2](https://pubmed.ncbi.nlm.nih.gov/2/).";
    const result = stripUnverifiedCitations(text, new Set(["1"]));

    expect(result.text).toBe(
      "First [PMID 1](https://pubmed.ncbi.nlm.nih.gov/1/) then PMID 2.",
    );
    expect(result.strippedPmids).toEqual(["2"]);
  });

  it("leaves text with no citations unchanged", () => {
    const result = stripUnverifiedCitations("No citations here.", new Set());
    expect(result.text).toBe("No citations here.");
    expect(result.strippedPmids).toEqual([]);
  });
});

describe("verifyResearchCitationsInStream", () => {
  async function collect(
    parts: Array<{ type: string; text?: string }>,
    allowedPmids: ReadonlySet<string>,
  ) {
    async function* source() {
      for (const part of parts) yield part as any;
    }
    const out: string[] = [];
    for await (const part of verifyResearchCitationsInStream(
      source(),
      allowedPmids,
    )) {
      if (part.type === "text-delta") out.push((part as any).text);
    }
    return out.join("");
  }

  it("passes through verified citations split across chunks", async () => {
    const result = await collect(
      [
        { type: "text-delta", text: "See [PMID 12" },
        {
          type: "text-delta",
          text: "3](https://pubmed.ncbi.nlm.nih.gov/123/).",
        },
      ],
      new Set(["123"]),
    );
    expect(result).toBe(
      "See [PMID 123](https://pubmed.ncbi.nlm.nih.gov/123/).",
    );
  });

  it("strips a fabricated citation split across chunks", async () => {
    const result = await collect(
      [
        { type: "text-delta", text: "See [PMID 99" },
        {
          type: "text-delta",
          text: "9](https://pubmed.ncbi.nlm.nih.gov/999/).",
        },
      ],
      new Set(["123"]),
    );
    expect(result).toBe("See PMID 999.");
  });

  it("does not touch non-text-delta parts", async () => {
    const parts: Array<{ type: string; text?: string }> = [
      { type: "text-delta", text: "Before " },
      { type: "tool-call" },
      { type: "text-delta", text: "after." },
    ];
    async function* source() {
      for (const part of parts) yield part as any;
    }
    const seen: string[] = [];
    for await (const part of verifyResearchCitationsInStream(
      source(),
      new Set(),
    )) {
      seen.push(part.type);
    }
    expect(seen).toEqual(["text-delta", "tool-call", "text-delta"]);
  });
});
