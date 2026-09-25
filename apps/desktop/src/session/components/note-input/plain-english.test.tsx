import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlainEnglishView } from "./plain-english";

import type { LLMConnectionStatus } from "~/ai/hooks";

const mocks = vi.hoisted(() => ({
  model: "test-model" as unknown,
  llmStatus: {
    status: "success",
    providerId: "anarlog",
    isHosted: true,
  } as LLMConnectionStatus,
  translatePlainEnglish: vi.fn(),
  fetchClinicalEvidenceByPmids: vi.fn(),
}));

vi.mock("~/ai/hooks", () => ({
  useLanguageModel: () => mocks.model,
  useLLMConnectionStatus: () => mocks.llmStatus,
}));

vi.mock("~/clinical/plain-english-translation", () => ({
  translatePlainEnglish: mocks.translatePlainEnglish,
}));

vi.mock("~/clinical/repository", () => ({
  fetchClinicalEvidenceByPmids: mocks.fetchClinicalEvidenceByPmids,
}));

vi.mock("~/session/components/note-input/enhanced/config-error", () => ({
  ConfigError: () => <div>Config error</div>,
}));

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlainEnglishView sessionId="session-1" />
    </QueryClientProvider>,
  );
}

describe("PlainEnglishView", () => {
  afterEach(() => {
    cleanup();
    mocks.model = "test-model";
    mocks.llmStatus = {
      status: "success",
      providerId: "anarlog",
      isHosted: true,
    };
    mocks.translatePlainEnglish.mockReset();
    mocks.fetchClinicalEvidenceByPmids.mockReset();
    mocks.fetchClinicalEvidenceByPmids.mockResolvedValue([]);
  });

  it("shows the config error state when no model is configured", () => {
    mocks.model = null;
    mocks.llmStatus = { status: "pending", reason: "missing_provider" };

    renderView();

    expect(screen.getByText("Config error")).not.toBeNull();
  });

  it("renders a flagged line's definition, and nothing at all under a line with nothing flagged", async () => {
    mocks.translatePlainEnglish.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "We'll start with a d-dimer.",
        plainEnglish: "A blood test that checks for a clotting protein.",
        citedPmids: [],
      },
      {
        segmentId: "seg-2",
        speaker: "Me",
        startMs: 60_000,
        endMs: 61_000,
        text: "Does that hurt?",
        plainEnglish: null,
        citedPmids: [],
      },
    ]);

    const { container } = renderView();

    expect(
      await screen.findByText(/We'll start with a d-dimer/),
    ).not.toBeNull();
    expect(
      screen.getByText("A blood test that checks for a clotting protein."),
    ).not.toBeNull();
    expect(screen.getByText("1:00")).not.toBeNull();
    expect(screen.getByText(/Does that hurt/)).not.toBeNull();
    // The second line has nothing flagged — no arrow icon, no definition
    // text, no leftover "no translation" placeholder should render for it.
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.queryByText(/No translation available/)).toBeNull();
    expect(mocks.translatePlainEnglish).toHaveBeenCalledWith(
      "session-1",
      "test-model",
      expect.anything(),
    );
  });

  it("renders a cited source link under a flagged line's definition", async () => {
    mocks.translatePlainEnglish.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Dr. Chau",
        startMs: 0,
        endMs: 1000,
        text: "We suspect stress-related mucosal damage.",
        plainEnglish: "Damage to the stomach lining during severe illness.",
        citedPmids: ["123"],
      },
    ]);
    mocks.fetchClinicalEvidenceByPmids.mockResolvedValue([
      {
        article: {
          id: "123",
          pmid: "123",
          pmcid: "",
          doi: "",
          title: "Stress ulcer prophylaxis review",
          abstract_text: "",
          journal: "Journal of Critical Care",
          publication_year: 2024,
          publication_types_json: "[]",
          mesh_terms_json: "[]",
          study_design: "review",
          retraction_status: "clear",
          source_url: "https://pubmed.ncbi.nlm.nih.gov/123/",
          fetched_at: "",
          source_id: "pubmed",
          external_id: "123",
        },
        excerpt: "",
      },
    ]);

    renderView();

    const link = await screen.findByRole("link", {
      name: "Stress ulcer prophylaxis review",
    });
    expect(link.getAttribute("href")).toBe(
      "https://pubmed.ncbi.nlm.nih.gov/123/",
    );
    expect(mocks.fetchClinicalEvidenceByPmids).toHaveBeenCalledWith(["123"]);
  });

  it("shows an empty state when there is no transcript", async () => {
    mocks.translatePlainEnglish.mockResolvedValue([]);

    renderView();

    await waitFor(() =>
      expect(
        screen.getByText("No transcript to translate yet."),
      ).not.toBeNull(),
    );
  });

  it("shows a retryable error state when translation fails", async () => {
    mocks.translatePlainEnglish.mockRejectedValue(new Error("network down"));

    renderView();

    expect(await screen.findByText("network down")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
  });
});
