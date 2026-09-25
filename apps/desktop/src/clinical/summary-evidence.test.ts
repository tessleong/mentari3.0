import { generateText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendResearchEvidence,
  buildEvidenceQueryFromTerms,
  buildThematicEvidenceQuery,
  extractResearchTopicTerms,
} from "./summary-evidence";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

const model = "test-model" as unknown as Parameters<
  typeof extractResearchTopicTerms
>[1];

describe("extractResearchTopicTerms", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it("skips the model call entirely for content with no clinical vocabulary at all", async () => {
    const result = await extractResearchTopicTerms(
      "We reviewed the quarterly budget and scheduled next steps.",
      model,
    );

    expect(result).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("parses a comma-separated list of terms from the model reply", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "wearable sensor data quality, biometric signal filtering",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await extractResearchTopicTerms(
      "The patient reported a severe headache lasting three days.",
      model,
    );

    expect(result).toEqual([
      "wearable sensor data quality",
      "biometric signal filtering",
    ]);
  });

  it("returns null when the model reports no real topic", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "NONE",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await extractResearchTopicTerms(
      "The patient reported a severe headache lasting three days.",
      model,
    );

    expect(result).toBeNull();
  });

  it("caps at 3 terms even when the model returns more", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "term one, term two, term three, term four",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await extractResearchTopicTerms(
      "The patient reported a severe headache lasting three days.",
      model,
    );

    expect(result).toEqual(["term one", "term two", "term three"]);
  });
});

describe("buildEvidenceQueryFromTerms", () => {
  it("ANDs multiple terms together so results must relate to their combination, not any single one", () => {
    const query = buildEvidenceQueryFromTerms([
      "wearable sensor data quality",
      "biometric signal filtering",
    ]);

    expect(query).toBe(
      '("wearable sensor data quality"[Title/Abstract] AND "biometric signal filtering"[Title/Abstract]) AND (systematic review[pt] OR meta-analysis[pt] OR practice guideline[pt] OR randomized controlled trial[pt] OR review[pt])',
    );
  });

  it("builds a single clause for one term", () => {
    const query = buildEvidenceQueryFromTerms(["headache"]);

    expect(query).toBe(
      '("headache"[Title/Abstract]) AND (systematic review[pt] OR meta-analysis[pt] OR practice guideline[pt] OR randomized controlled trial[pt] OR review[pt])',
    );
  });

  // Regression note: the previous query builder ORed frequency-ranked
  // dictionary terms together, so an article matching even one incidental
  // keyword (e.g. "respiratory" mentioned in passing) qualified on its own
  // — this is why an unrelated device-data meeting returned citations about
  // ICU stress-ulcer prophylaxis and RSV pneumonia. That function no longer
  // exists; every query built here requires the AI-selected terms to
  // co-occur.
});

describe("buildThematicEvidenceQuery", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it("returns null without building a query when there is no real topic", async () => {
    const result = await buildThematicEvidenceQuery(
      "See you next Tuesday.",
      model,
    );

    expect(result).toBeNull();
  });

  it("builds an ANDed query from the extracted terms", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "headache",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await buildThematicEvidenceQuery(
      "The patient reported a severe headache.",
      model,
    );

    expect(result).toBe(
      '("headache"[Title/Abstract]) AND (systematic review[pt] OR meta-analysis[pt] OR practice guideline[pt] OR randomized controlled trial[pt] OR review[pt])',
    );
  });
});

describe("appendResearchEvidence", () => {
  it("adds citable PubMed URLs and strict provenance guidance", () => {
    const result = appendResearchEvidence("Visit prompt", [
      {
        pmid: "12345678",
        title: "Hypertension treatment review",
        abstractText: "A systematic review of treatment evidence.",
        journal: "Medical Journal",
        publicationYear: 2025,
        studyDesign: "systematic_review",
        sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      },
    ]);

    expect(result).toContain("Retrieved Research Evidence");
    expect(result).toContain("https://pubmed.ncbi.nlm.nih.gov/12345678/");
    expect(result).toContain("patient-specific facts");
    expect(result).toContain("never invent a citation");
  });
});
