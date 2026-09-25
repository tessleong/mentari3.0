import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { md2json } from "@anlg/editor/markdown";

import { SummaryResearchPanel } from "./summary-research-panel";

const mocks = vi.hoisted(() => ({
  fetchClinicalEvidenceByPmids: vi.fn(),
  useEnhancedNote: vi.fn(),
}));

vi.mock("~/clinical/repository", () => ({
  fetchClinicalEvidenceByPmids: mocks.fetchClinicalEvidenceByPmids,
}));

vi.mock("~/session/queries", () => ({
  useEnhancedNote: mocks.useEnhancedNote,
}));

function contentWithCitation(pmid: string): string {
  return JSON.stringify(
    md2json(
      `Per [PMID ${pmid}](https://pubmed.ncbi.nlm.nih.gov/${pmid}/), rest.`,
    ),
  );
}

function renderPanel(content: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SummaryResearchPanel content={content} enhancedNoteId="note-1" />
    </QueryClientProvider>,
  );
}

describe("SummaryResearchPanel", () => {
  afterEach(() => {
    cleanup();
    mocks.fetchClinicalEvidenceByPmids.mockReset();
    mocks.useEnhancedNote.mockReset();
  });

  it("renders nothing when the summary has no citations", async () => {
    mocks.useEnhancedNote.mockReturnValue({ researchEvidence: [] });
    const { container } = renderPanel(
      JSON.stringify(md2json("No citations here.")),
    );

    await waitFor(() => {
      expect(container.querySelector("[data-summary-research-panel]")).toBe(
        null,
      );
    });
    expect(mocks.fetchClinicalEvidenceByPmids).not.toHaveBeenCalled();
  });

  it("shows retrieved sources even when the model never cited them inline", async () => {
    mocks.useEnhancedNote.mockReturnValue({
      researchEvidence: [
        {
          pmid: "456",
          title: "Evaluating headache in primary care",
          abstractText: "A review of common headache presentations.",
          journal: "JAMA",
          publicationYear: 2021,
          studyDesign: "review",
          sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/456/",
        },
      ],
    });

    renderPanel(JSON.stringify(md2json("Discussed the patient's headache.")));

    expect(
      await screen.findByText(/Evaluating headache in primary care/),
    ).not.toBeNull();
  });

  it("shows a 'none found' state for clinical content with no citations, instead of hiding the panel", async () => {
    mocks.useEnhancedNote.mockReturnValue({ researchEvidence: [] });
    const { container } = renderPanel(
      JSON.stringify(md2json("Discussed the patient's headache and fever.")),
    );

    await waitFor(() => {
      expect(container.querySelector("[data-summary-research-panel]")).not.toBe(
        null,
      );
    });
    expect(
      screen.getByText("No cited sources found for this summary yet."),
    ).not.toBeNull();
  });

  it("shows the cited sources for this summary's content", async () => {
    mocks.useEnhancedNote.mockReturnValue({ researchEvidence: [] });
    mocks.fetchClinicalEvidenceByPmids.mockResolvedValue([
      {
        article: {
          id: "article-1",
          pmid: "123",
          title: "Managing hypertension in primary care",
          journal: "BMJ",
          publication_year: 2022,
          source_url: "https://pubmed.ncbi.nlm.nih.gov/123/",
          source_id: "pubmed",
        },
        excerpt: "Lifestyle changes reduce blood pressure.",
      },
    ]);

    renderPanel(contentWithCitation("123"));

    expect(
      await screen.findByText(/Managing hypertension in primary care/),
    ).not.toBeNull();
    expect(mocks.fetchClinicalEvidenceByPmids).toHaveBeenCalledWith(["123"]);
  });
});
