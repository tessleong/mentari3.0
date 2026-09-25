import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { md2json } from "@anlg/editor/markdown";

import { SummaryCitationHoverLayer } from "./summary-citation-hover";

const mocks = vi.hoisted(() => ({
  fetchClinicalEvidenceByPmids: vi.fn(),
}));

vi.mock("~/clinical/repository", () => ({
  fetchClinicalEvidenceByPmids: mocks.fetchClinicalEvidenceByPmids,
}));

function contentWithCitation(pmid: string): string {
  return JSON.stringify(
    md2json(
      `Per [PMID ${pmid}](https://pubmed.ncbi.nlm.nih.gov/${pmid}/), rest.`,
    ),
  );
}

function renderLayer(content: string) {
  const dom = document.createElement("div");
  dom.innerHTML = `
    <p>Per <a href="https://pubmed.ncbi.nlm.nih.gov/123/">PMID 123</a>, rest.</p>
    <p>See <a href="https://example.com/unrelated">this link</a> too.</p>
  `;
  document.body.appendChild(dom);
  const view = { dom } as unknown as EditorView;

  const queryClient = new QueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <SummaryCitationHoverLayer content={content} view={view} />
    </QueryClientProvider>,
  );

  return { ...result, dom };
}

describe("SummaryCitationHoverLayer", () => {
  afterEach(() => {
    cleanup();
    mocks.fetchClinicalEvidenceByPmids.mockReset();
    vi.useRealTimers();
  });

  it("resolves the note's cited sources up front, without waiting for a hover", () => {
    mocks.fetchClinicalEvidenceByPmids.mockResolvedValue([]);
    renderLayer(contentWithCitation("123"));

    expect(mocks.fetchClinicalEvidenceByPmids).toHaveBeenCalledWith(["123"]);
  });

  it("does not open for a link that isn't a verified citation", () => {
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dom } = renderLayer(contentWithCitation("123"));

    fireEvent.mouseOver(dom.querySelectorAll("a")[1]!);
    vi.advanceTimersByTime(400);

    expect(
      screen.queryByText(/Managing hypertension in primary care/),
    ).toBeNull();
  });

  it("shows the cited article after the hover delay", async () => {
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dom } = renderLayer(contentWithCitation("123"));

    fireEvent.mouseOver(dom.querySelectorAll("a")[0]!);
    vi.advanceTimersByTime(400);

    await waitFor(() =>
      expect(mocks.fetchClinicalEvidenceByPmids).toHaveBeenCalledWith(["123"]),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Managing hypertension in primary care/),
      ).toBeTruthy(),
    );
    expect(screen.getByText(/BMJ/)).toBeTruthy();
    expect(
      screen.getByText(/Lifestyle changes reduce blood pressure/),
    ).toBeTruthy();
    expect(screen.getByText("Open source ↗")).toBeTruthy();
  });

  it("does not open until the hover delay has elapsed", () => {
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dom } = renderLayer(contentWithCitation("123"));

    fireEvent.mouseOver(dom.querySelectorAll("a")[0]!);
    vi.advanceTimersByTime(100);

    expect(
      screen.queryByText(/Managing hypertension in primary care/),
    ).toBeNull();
  });
});
