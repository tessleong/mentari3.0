import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { md2json } from "@anlg/editor/markdown";

import { useCitedSourcesForContent } from "./use-current-note-sources";

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

function renderHookWithClient<T>(callback: () => T) {
  const queryClient = new QueryClient();
  return renderHook(callback, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("useCitedSourcesForContent", () => {
  beforeEach(() => {
    mocks.fetchClinicalEvidenceByPmids.mockReset();
    mocks.fetchClinicalEvidenceByPmids.mockResolvedValue([]);
  });

  it("shows retrieved evidence even when nothing was cited inline", async () => {
    const { result } = renderHookWithClient(() =>
      useCitedSourcesForContent(JSON.stringify(md2json("No citations here.")), [
        {
          pmid: "456",
          title: "Evaluating headache in primary care",
          abstractText: "A review of common headache presentations.",
          journal: "JAMA",
          publicationYear: 2021,
          studyDesign: "review",
          sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/456/",
        },
      ]),
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.article.pmid).toBe("456");
    expect(result.current[0]?.article.title).toBe(
      "Evaluating headache in primary care",
    );
    expect(result.current[0]?.article.source_id).toBe("pubmed");
  });

  it("merges cited sources with retrieved evidence, without duplicating a pmid cited in both", async () => {
    mocks.fetchClinicalEvidenceByPmids.mockResolvedValue([
      {
        article: {
          id: "article-123",
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

    const { result } = renderHookWithClient(() =>
      useCitedSourcesForContent(contentWithCitation("123"), [
        {
          pmid: "123",
          title: "Duplicate of the cited source",
          abstractText: "Should not create a second entry.",
          journal: "BMJ",
          publicationYear: 2022,
          studyDesign: "review",
          sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/123/",
        },
        {
          pmid: "789",
          title: "Retrieved but never cited",
          abstractText: "Only surfaced via retrieval.",
          journal: "Lancet",
          publicationYear: 2020,
          studyDesign: "review",
          sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/789/",
        },
      ]),
    );

    await waitFor(() =>
      expect(
        result.current.find((source) => source.article.pmid === "123")?.article
          .title,
      ).toBe("Managing hypertension in primary care"),
    );
    const pmids = result.current.map((source) => source.article.pmid).sort();
    expect(pmids).toEqual(["123", "789"]);
  });

  it("returns nothing when there is neither a citation nor retrieved evidence", async () => {
    const { result } = renderHookWithClient(() =>
      useCitedSourcesForContent(JSON.stringify(md2json("No citations here."))),
    );

    await waitFor(() =>
      expect(mocks.fetchClinicalEvidenceByPmids).not.toHaveBeenCalled(),
    );
    expect(result.current).toEqual([]);
  });
});
