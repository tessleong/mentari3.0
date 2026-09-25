import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToolGetVisitNextSteps } from "./get-visit-next-steps";

const basePart = {
  type: "tool-get_visit_next_steps",
  toolCallId: "tool-call-1",
  input: {},
} as const;

describe("ToolGetVisitNextSteps", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a loading label while scanning the visit", () => {
    render(
      <ToolGetVisitNextSteps
        part={{ ...basePart, state: "input-available" }}
      />,
    );

    expect(screen.getByText("Finding next steps…")).not.toBeNull();
  });

  it("renders each next step with its category, speaker, timestamp, and text", () => {
    render(
      <ToolGetVisitNextSteps
        part={{
          ...basePart,
          state: "output-available",
          output: {
            session_id: "session-1",
            steps: [
              {
                category: "labs",
                description: "Let's order a D-dimer.",
                segment_id: "seg-2",
                speaker: "Doctor",
                start_ms: 5000,
                end_ms: 12_000,
              },
              {
                category: "warning_sign",
                description:
                  "Go to the ER if you develop sudden chest pain or shortness of breath.",
                segment_id: "seg-4",
                speaker: "Doctor",
                start_ms: 20_000,
                end_ms: 25_000,
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Found 2 next steps")).not.toBeNull();
    expect(screen.getByText("Labs")).not.toBeNull();
    expect(screen.getByText("Let's order a D-dimer.")).not.toBeNull();
    expect(screen.getByText("Warning sign")).not.toBeNull();
    expect(
      screen.getByText(
        "Go to the ER if you develop sudden chest pain or shortness of breath.",
      ),
    ).not.toBeNull();
    expect(screen.getByText("0:05")).not.toBeNull();
  });

  it("shows a message when no next steps are found", () => {
    render(
      <ToolGetVisitNextSteps
        part={{
          ...basePart,
          state: "output-available",
          output: {
            session_id: null,
            steps: [],
            message: "No active visit selected. Provide session_id explicitly.",
          },
        }}
      />,
    );

    expect(screen.getByText("No next steps found")).not.toBeNull();
    expect(
      screen.getByText(
        "No active visit selected. Provide session_id explicitly.",
      ),
    ).not.toBeNull();
  });
});
