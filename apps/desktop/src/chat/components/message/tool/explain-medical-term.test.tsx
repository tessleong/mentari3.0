import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToolExplainMedicalTerm } from "./explain-medical-term";

const basePart = {
  type: "tool-explain_medical_term",
  toolCallId: "tool-call-1",
  input: { term: "D-dimer" },
} as const;

describe("ToolExplainMedicalTerm", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a loading label while looking up the term", () => {
    render(
      <ToolExplainMedicalTerm
        part={{ ...basePart, state: "input-available" }}
      />,
    );

    expect(screen.getByText("Looking into this…")).not.toBeNull();
  });

  it("renders both the visit context and medical sources for the term", () => {
    render(
      <ToolExplainMedicalTerm
        part={{
          ...basePart,
          state: "output-available",
          output: {
            term: "D-dimer",
            encounter_sources: [
              {
                segment_id: "seg-1",
                speaker: "Doctor",
                start_ms: 862_000,
                end_ms: 868_000,
                text: "We may start with a D-dimer depending on your risk.",
              },
            ],
            medical_sources: [
              {
                pmid: "12345678",
                doi: "10.1000/example",
                title: "Age-adjusted D-dimer cutoffs for PE exclusion",
                journal: "NEJM",
                publication_year: 2023,
                excerpt: "Age-adjusted cutoffs reduced unnecessary imaging.",
                source_url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText('About "D-dimer"')).not.toBeNull();
    expect(screen.getByText("From your visit")).not.toBeNull();
    expect(screen.getByText("Doctor")).not.toBeNull();
    expect(screen.getByText("14:22")).not.toBeNull();
    expect(
      screen.getByText("“We may start with a D-dimer depending on your risk.”"),
    ).not.toBeNull();

    expect(screen.getByText("Medical sources")).not.toBeNull();
    expect(
      screen.getByText("Age-adjusted D-dimer cutoffs for PE exclusion"),
    ).not.toBeNull();
    expect(screen.getByText(/PMID 12345678/)).not.toBeNull();
  });

  it("shows a message when neither the visit nor the literature mentions the term", () => {
    render(
      <ToolExplainMedicalTerm
        part={{
          ...basePart,
          state: "output-available",
          output: {
            term: "xenomorphism",
            message: "No active visit selected. Provide session_id explicitly.",
            encounter_sources: [],
            medical_sources: [],
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        "No active visit selected. Provide session_id explicitly.",
      ),
    ).not.toBeNull();
  });
});
