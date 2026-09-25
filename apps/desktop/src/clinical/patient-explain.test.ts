import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieveEncounterSegments: vi.fn(),
  searchClinicalEvidence: vi.fn(),
}));

vi.mock("./encounter-retrieval", () => ({
  retrieveEncounterSegments: mocks.retrieveEncounterSegments,
}));

vi.mock("./repository", () => ({
  searchClinicalEvidence: mocks.searchClinicalEvidence,
}));

import { explainMedicalTerm } from "./patient-explain";

describe("explainMedicalTerm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("combines encounter and medical evidence for the same term", async () => {
    mocks.retrieveEncounterSegments.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Doctor",
        startMs: 862_000,
        endMs: 868_000,
        text: "We may start with a D-dimer depending on your risk.",
        score: 0.9,
        sourceType: "transcript_direct",
      },
    ]);
    mocks.searchClinicalEvidence.mockResolvedValue([
      {
        article: {
          id: "article-1",
          pmid: "12345678",
          pmcid: "",
          doi: "10.1000/example",
          title: "Age-adjusted D-dimer cutoffs for PE exclusion",
          abstract_text: "...",
          journal: "NEJM",
          publication_year: 2023,
          publication_types_json: "[]",
          mesh_terms_json: "[]",
          study_design: "randomized_controlled_trial",
          retraction_status: "clear",
          source_url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
          fetched_at: "2026-01-01T00:00:00.000Z",
        },
        score: 0.8,
        explanation: { lexical: 0.5, design: 0.3, recency: 0.1, retraction: 0 },
        evidenceExcerpt: "Age-adjusted cutoffs reduced unnecessary imaging.",
        queryId: "query-1",
      },
    ]);

    const result = await explainMedicalTerm("session-1", "D-dimer");

    expect(mocks.retrieveEncounterSegments).toHaveBeenCalledWith(
      "session-1",
      "D-dimer",
      5,
    );
    expect(mocks.searchClinicalEvidence).toHaveBeenCalledWith("D-dimer", 5);

    expect(result).toEqual({
      term: "D-dimer",
      encounterSources: [
        {
          segmentId: "seg-1",
          speaker: "Doctor",
          startMs: 862_000,
          endMs: 868_000,
          text: "We may start with a D-dimer depending on your risk.",
        },
      ],
      medicalSources: [
        {
          pmid: "12345678",
          doi: "10.1000/example",
          title: "Age-adjusted D-dimer cutoffs for PE exclusion",
          journal: "NEJM",
          publicationYear: 2023,
          excerpt: "Age-adjusted cutoffs reduced unnecessary imaging.",
          sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
          studyDesign: "randomized_controlled_trial",
        },
      ],
    });
  });

  it("returns empty source lists when neither the visit nor the literature mentions the term", async () => {
    mocks.retrieveEncounterSegments.mockResolvedValue([]);
    mocks.searchClinicalEvidence.mockResolvedValue([]);

    const result = await explainMedicalTerm("session-1", "xenomorphism");

    expect(result.encounterSources).toEqual([]);
    expect(result.medicalSources).toEqual([]);
  });

  it("respects custom per-source limits", async () => {
    mocks.retrieveEncounterSegments.mockResolvedValue([]);
    mocks.searchClinicalEvidence.mockResolvedValue([]);

    await explainMedicalTerm("session-1", "D-dimer", {
      encounter: 2,
      medical: 3,
    });

    expect(mocks.retrieveEncounterSegments).toHaveBeenCalledWith(
      "session-1",
      "D-dimer",
      2,
    );
    expect(mocks.searchClinicalEvidence).toHaveBeenCalledWith("D-dimer", 3);
  });
});
