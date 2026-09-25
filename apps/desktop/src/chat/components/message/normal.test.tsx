import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NormalMessage } from "./normal";

import type { AnlgUIMessage } from "~/chat/types";

afterEach(cleanup);

describe("NormalMessage", () => {
  it("renders a ```markdown fenced reply as formatted text, not a raw code block", () => {
    render(
      <NormalMessage
        message={
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "text",
                text: [
                  "```markdown",
                  "# Lecture Summary",
                  "",
                  "## Section",
                  "- a bullet point",
                  "```",
                ].join("\n"),
                state: "done",
              },
            ],
          } as AnlgUIMessage
        }
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Lecture Summary" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Section" }),
    ).not.toBeNull();
    expect(screen.getByText("a bullet point")).not.toBeNull();
    expect(screen.queryByText(/^#/)).toBeNull();
    expect(document.querySelector("pre")).toBeNull();
  });
});
