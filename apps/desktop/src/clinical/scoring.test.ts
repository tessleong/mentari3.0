import { describe, expect, it } from "vitest";

import { rankEvidence, trainEvidenceWeights } from "./scoring";

describe("clinical evidence scoring", () => {
  it("ranks relevant high-level evidence above a case report", () => {
    const ranked = rankEvidence("hypertension treatment", [
      {
        id: "case",
        title: "Hypertension treatment in one patient",
        abstractText: "A single unusual case.",
        meshTerms: ["Hypertension"],
        publicationYear: 2026,
        studyDesign: "case_report",
        retractionStatus: "clear",
      },
      {
        id: "review",
        title: "Hypertension treatment systematic review",
        abstractText: "A synthesis of randomized trials.",
        meshTerms: ["Hypertension", "Therapeutics"],
        publicationYear: 2025,
        studyDesign: "systematic_review",
        retractionStatus: "clear",
      },
    ]);

    expect(ranked.map((result) => result.article.id)).toEqual([
      "review",
      "case",
    ]);
  });

  it("penalizes retracted evidence regardless of lexical match", () => {
    const ranked = rankEvidence("stroke prevention", [
      {
        id: "retracted",
        title: "Stroke prevention stroke prevention",
        abstractText: "stroke prevention",
        meshTerms: [],
        publicationYear: 2026,
        studyDesign: "randomized_controlled_trial",
        retractionStatus: "retracted",
      },
      {
        id: "clear",
        title: "Stroke prevention",
        abstractText: "A cohort study.",
        meshTerms: [],
        publicationYear: 2020,
        studyDesign: "observational_study",
        retractionStatus: "clear",
      },
    ]);

    expect(ranked[0]?.article.id).toBe("clear");
  });

  it("fits versionable weights from reviewed examples", () => {
    const weights = trainEvidenceWeights([
      {
        features: { lexical: 1, design: 1, recency: 1, retraction: 0 },
        relevance: 3,
      },
      {
        features: { lexical: 0.8, design: 0.9, recency: 0.5, retraction: 0 },
        relevance: 3,
      },
      {
        features: { lexical: 0.2, design: 0.2, recency: 0.8, retraction: 0 },
        relevance: 1,
      },
      {
        features: { lexical: 1, design: 0.9, recency: 1, retraction: 1 },
        relevance: 0,
      },
    ]);

    expect(weights.retraction).toBeLessThan(0);
    expect(weights.lexical).toBeGreaterThan(0);
  });
});
