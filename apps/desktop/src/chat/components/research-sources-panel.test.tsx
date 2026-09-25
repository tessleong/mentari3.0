import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { md2json } from "@anlg/editor/markdown";

import { ResearchSourcesPanel } from "./research-sources-panel";

const mocks = vi.hoisted(() => ({
  useEnhancedNote: vi.fn(),
  fetchClinicalEvidenceByPmids: vi.fn(),
  currentTab: {
    type: "sessions" as const,
    id: "session-1",
    state: { view: { type: "enhanced", id: "note-1" } },
  },
}));

vi.mock("~/session/queries", () => ({
  useEnhancedNote: mocks.useEnhancedNote,
}));

vi.mock("~/clinical/repository", () => ({
  fetchClinicalEvidenceByPmids: mocks.fetchClinicalEvidenceByPmids,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: unknown) => unknown) =>
    selector({ currentTab: mocks.currentTab }),
}));

function renderPanel(sessionId = "session-1") {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ResearchSourcesPanel sessionId={sessionId} />
    </QueryClientProvider>,
  );
}

function proseMirrorContent(markdown: string): string {
  return JSON.stringify(md2json(markdown));
}

describe("ResearchSourcesPanel", () => {
  beforeEach(() => {
    mocks.fetchClinicalEvidenceByPmids.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when the summary has no citations", async () => {
    mocks.useEnhancedNote.mockReturnValue({
      content: proseMirrorContent("No citations here."),
    });

    const { container } = renderPanel();

    await waitFor(() => {
      expect(container.querySelector("[data-research-sources-panel]")).toBe(
        null,
      );
    });
    expect(mocks.fetchClinicalEvidenceByPmids).not.toHaveBeenCalled();
  });

  it("shows the cited sources with title, journal, and excerpt", async () => {
    mocks.useEnhancedNote.mockReturnValue({
      content: proseMirrorContent(
        "Per [PMID 123](https://pubmed.ncbi.nlm.nih.gov/123/), rest.",
      ),
    });
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

    renderPanel();

    expect(
      await screen.findByText(/Managing hypertension in primary care/),
    ).not.toBeNull();
    expect(screen.getByText(/BMJ/)).not.toBeNull();
    expect(
      screen.getByText(/Lifestyle changes reduce blood pressure/),
    ).not.toBeNull();
    expect(mocks.fetchClinicalEvidenceByPmids).toHaveBeenCalledWith(["123"]);
  });
});
