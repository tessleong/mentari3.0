import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToolSearchEncounterTranscript } from "./search-encounter-transcript";

const basePart = {
  type: "tool-search_encounter_transcript",
  toolCallId: "tool-call-1",
  input: { query: "when did the pain start" },
} as const;

describe("ToolSearchEncounterTranscript", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a loading label while the search is running", () => {
    render(
      <ToolSearchEncounterTranscript
        part={{ ...basePart, state: "input-available" }}
      />,
    );

    expect(
      screen.getByText("Searching this encounter's transcript…"),
    ).not.toBeNull();
  });

  it("renders transcript segment cards with speaker and timestamp", () => {
    render(
      <ToolSearchEncounterTranscript
        part={{
          ...basePart,
          state: "output-available",
          output: {
            session_id: "session-1",
            query: "when did the pain start",
            results: [
              {
                segment_id: "seg-1",
                speaker: "Patient",
                start_ms: 742_000,
                end_ms: 748_500,
                text: "It started Monday morning.",
                score: 1,
                source_type: "transcript_direct",
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Found 1 transcript segment")).not.toBeNull();
    expect(screen.getByText("Patient")).not.toBeNull();
    expect(screen.getByText("12:22")).not.toBeNull();
    expect(screen.getByText("“It started Monday morning.”")).not.toBeNull();
  });

  it("shows a no-results message when the tool reports one", () => {
    render(
      <ToolSearchEncounterTranscript
        part={{
          ...basePart,
          state: "output-available",
          output: {
            session_id: null,
            query: "anything",
            message:
              "No active session selected. Provide session_id explicitly.",
            results: [],
          },
        }}
      />,
    );

    expect(screen.getByText("No matching transcript segments")).not.toBeNull();
    expect(
      screen.getByText(
        "No active session selected. Provide session_id explicitly.",
      ),
    ).not.toBeNull();
  });
});
