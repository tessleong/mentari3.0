import { generateText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translatePlainEnglish } from "./plain-english-translation";

const mocks = vi.hoisted(() => ({
  loadEncounterSegments: vi.fn(),
  buildThematicEvidenceQuery: vi.fn(),
  retrieveSummaryMedicalEvidence: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("./encounter-retrieval", () => ({
  loadEncounterSegments: mocks.loadEncounterSegments,
}));

vi.mock("./summary-evidence", () => ({
  buildThematicEvidenceQuery: mocks.buildThematicEvidenceQuery,
  retrieveSummaryMedicalEvidence: mocks.retrieveSummaryMedicalEvidence,
}));

const model = "test-model" as unknown as Parameters<
  typeof translatePlainEnglish
>[1];

function evidenceSource(pmid: string, title = `Article ${pmid}`) {
  return {
    pmid,
    title,
    abstractText: "Abstract text.",
    journal: "Journal",
    publicationYear: 2024,
    studyDesign: "review" as const,
    sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  };
}

describe("translatePlainEnglish", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    mocks.loadEncounterSegments.mockReset();
    mocks.buildThematicEvidenceQuery.mockReset();
    mocks.retrieveSummaryMedicalEvidence.mockReset();
    mocks.buildThematicEvidenceQuery.mockResolvedValue(null);
    mocks.retrieveSummaryMedicalEvidence.mockResolvedValue([]);
  });

  it("returns an empty list without calling the model when there is no transcript", async () => {
    mocks.loadEncounterSegments.mockResolvedValue([]);

    const result = await translatePlainEnglish("session-1", model);

    expect(result).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
    expect(mocks.buildThematicEvidenceQuery).not.toHaveBeenCalled();
  });

  it("flags a segment with jargon, leaving an ordinary segment with no entry at all", async () => {
    mocks.loadEncounterSegments.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "We'll start with a d-dimer to rule out a PE.",
      },
      {
        segmentId: "seg-2",
        speaker: "Me",
        startMs: 1000,
        endMs: 2000,
        text: "Okay, sounds good.",
      },
    ]);
    // The model only replies for the jargon-containing line — this is the
    // expected, common shape of a real reply, not a partial/failed one.
    vi.mocked(generateText).mockResolvedValue({
      text: "[SEG_seg-1] A blood test that checks for a clotting protein, used to help rule out a blood clot.",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await translatePlainEnglish("session-1", model);

    expect(result).toEqual([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "We'll start with a d-dimer to rule out a PE.",
        plainEnglish:
          "A blood test that checks for a clotting protein, used to help rule out a blood clot.",
        citedPmids: [],
      },
      {
        segmentId: "seg-2",
        speaker: "Me",
        startMs: 1000,
        endMs: 2000,
        text: "Okay, sounds good.",
        plainEnglish: null,
        citedPmids: [],
      },
    ]);

    const promptArg = vi.mocked(generateText).mock.calls[0]![0]
      .prompt as string;
    expect(promptArg).toContain(
      "[SEG_seg-1] Dr. Chau: We'll start with a d-dimer to rule out a PE.",
    );
    expect(promptArg).toContain("[SEG_seg-2] Me: Okay, sounds good.");
  });

  it("leaves a segment's translation null when the model does not flag it, not just when it mislabels one", async () => {
    mocks.loadEncounterSegments.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "First line.",
      },
      {
        segmentId: "seg-2",
        speaker: "Me",
        startMs: 1000,
        endMs: 2000,
        text: "Second line.",
      },
    ]);
    // Model only answered the first line.
    vi.mocked(generateText).mockResolvedValue({
      text: "[SEG_seg-1] Plain definition of the first line's term.",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await translatePlainEnglish("session-1", model);

    expect(result[0]?.plainEnglish).toBe(
      "Plain definition of the first line's term.",
    );
    expect(result[1]?.plainEnglish).toBeNull();
    expect(result[1]?.citedPmids).toEqual([]);
  });

  it("extracts a verified citation into citedPmids and strips its markup from the clean display text", async () => {
    mocks.loadEncounterSegments.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "We suspect stress-related mucosal damage.",
      },
    ]);
    mocks.buildThematicEvidenceQuery.mockResolvedValue(
      '"stress-related mucosal damage"[Title/Abstract]',
    );
    mocks.retrieveSummaryMedicalEvidence.mockResolvedValue([
      evidenceSource("123", "Stress ulcer prophylaxis review"),
    ]);
    vi.mocked(generateText).mockResolvedValue({
      text: "[SEG_seg-1] Damage to the stomach lining that can happen during severe illness. [PMID 123](https://pubmed.ncbi.nlm.nih.gov/123/)",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await translatePlainEnglish("session-1", model);

    expect(result[0]?.citedPmids).toEqual(["123"]);
    expect(result[0]?.plainEnglish).toBe(
      "Damage to the stomach lining that can happen during severe illness.",
    );
    expect(result[0]?.plainEnglish).not.toContain("[PMID");
  });

  it("strips a hallucinated citation before parsing, so it never reaches citedPmids", async () => {
    mocks.loadEncounterSegments.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "We suspect stress-related mucosal damage.",
      },
    ]);
    mocks.buildThematicEvidenceQuery.mockResolvedValue(
      '"stress-related mucosal damage"[Title/Abstract]',
    );
    // Only PMID 123 was actually retrieved — the model cites 999 instead.
    mocks.retrieveSummaryMedicalEvidence.mockResolvedValue([
      evidenceSource("123"),
    ]);
    vi.mocked(generateText).mockResolvedValue({
      text: "[SEG_seg-1] Damage to the stomach lining. [PMID 999](https://pubmed.ncbi.nlm.nih.gov/999/)",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await translatePlainEnglish("session-1", model);

    expect(result[0]?.citedPmids).toEqual([]);
    expect(result[0]?.plainEnglish).not.toContain("[PMID");
    expect(result[0]?.plainEnglish).not.toContain("999");
  });

  it("still returns translations with empty citedPmids when evidence retrieval fails", async () => {
    mocks.loadEncounterSegments.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "We suspect stress-related mucosal damage.",
      },
    ]);
    mocks.buildThematicEvidenceQuery.mockRejectedValue(
      new Error("model unavailable"),
    );
    vi.mocked(generateText).mockResolvedValue({
      text: "[SEG_seg-1] Damage to the stomach lining that can happen during severe illness.",
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await translatePlainEnglish("session-1", model);

    expect(result[0]?.plainEnglish).toBe(
      "Damage to the stomach lining that can happen during severe illness.",
    );
    expect(result[0]?.citedPmids).toEqual([]);
  });
});
