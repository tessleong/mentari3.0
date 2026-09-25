import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WordSpan } from "./word-span";

import type { SegmentWord } from "~/stt/live-segment";

vi.mock("./medical-term-hover", () => ({
  MedicalTermHoverCard: ({
    sessionId,
    term,
    children,
  }: {
    sessionId: string;
    term: string;
    children: React.ReactNode;
  }) => (
    <span data-medical-term-hover data-session-id={sessionId} data-term={term}>
      {children}
    </span>
  ),
}));

function makeWord(overrides: Partial<SegmentWord> = {}): SegmentWord {
  return {
    id: "word-1",
    text: "hello",
    start_ms: 0,
    end_ms: 500,
    is_final: true,
    ...overrides,
  } as SegmentWord;
}

describe("WordSpan", () => {
  afterEach(cleanup);

  it("wraps a recognized medical term in the hover card when a sessionId is present", () => {
    render(
      <WordSpan
        word={makeWord({ text: "hypertension" })}
        displayText="hypertension"
        audioExists={false}
        onClickWord={vi.fn()}
        sessionId="session-1"
      />,
    );

    const wrapper = screen
      .getByText("hypertension")
      .closest("[data-medical-term-hover]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("data-session-id")).toBe("session-1");
    expect(wrapper?.getAttribute("data-term")).toBe("hypertension");
  });

  it("does not wrap an ordinary word", () => {
    render(
      <WordSpan
        word={makeWord({ text: "appointment" })}
        displayText="appointment"
        audioExists={false}
        onClickWord={vi.fn()}
        sessionId="session-1"
      />,
    );

    expect(document.querySelector("[data-medical-term-hover]")).toBeNull();
  });

  it("does not wrap a medical term when no sessionId is available", () => {
    render(
      <WordSpan
        word={makeWord({ text: "hypertension" })}
        displayText="hypertension"
        audioExists={false}
        onClickWord={vi.fn()}
      />,
    );

    expect(document.querySelector("[data-medical-term-hover]")).toBeNull();
  });
});
