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

import { SummaryLineHoverLayer } from "./summary-line-hover";

const mocks = vi.hoisted(() => ({
  retrieveEncounterSegments: vi.fn(),
}));

vi.mock("~/clinical/encounter-retrieval", () => ({
  retrieveEncounterSegments: mocks.retrieveEncounterSegments,
}));

function renderLayer() {
  const dom = document.createElement("div");
  dom.innerHTML = `
    <h1>Session title</h1>
    <p>Bipolar: two fibers, highly polarized; classic example in the retina</p>
    <p>Empty below</p>
  `;
  document.body.appendChild(dom);
  const view = { dom } as unknown as EditorView;

  const queryClient = new QueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <SummaryLineHoverLayer sessionId="session-1" view={view} />
    </QueryClientProvider>,
  );

  return { ...result, dom };
}

function selectTextIn(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function clearSelection() {
  window.getSelection()?.removeAllRanges();
}

describe("SummaryLineHoverLayer", () => {
  afterEach(() => {
    cleanup();
    mocks.retrieveEncounterSegments.mockReset();
    clearSelection();
  });

  it("does not look anything up before any text is selected", () => {
    const { dom } = renderLayer();

    fireEvent.mouseUp(dom.querySelectorAll("p")[0]!);

    expect(mocks.retrieveEncounterSegments).not.toHaveBeenCalled();
  });

  it("does not trigger on a plain click with no selection", () => {
    const { dom } = renderLayer();

    fireEvent.click(dom.querySelectorAll("p")[0]!);
    fireEvent.mouseUp(dom.querySelectorAll("p")[0]!);

    expect(mocks.retrieveEncounterSegments).not.toHaveBeenCalled();
  });

  it("looks up matching transcript quotes for the selected phrase", async () => {
    mocks.retrieveEncounterSegments.mockResolvedValue([
      {
        segmentId: "seg-1",
        speaker: "Instructor",
        startMs: 0,
        endMs: 1000,
        text: "Some neurons are bipolar.",
        score: 1,
        sourceType: "transcript_direct",
      },
    ]);
    const { dom } = renderLayer();
    const paragraph = dom.querySelectorAll("p")[0]!;

    selectTextIn(paragraph);
    fireEvent.mouseUp(paragraph);

    await waitFor(() =>
      expect(mocks.retrieveEncounterSegments).toHaveBeenCalledWith(
        "session-1",
        "Bipolar: two fibers, highly polarized; classic example in the retina",
        4,
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/Some neurons are bipolar/)).toBeTruthy(),
    );
    expect(screen.getByText("Claim context")).toBeTruthy();
    expect(screen.getByText("Exact transcript evidence")).toBeTruthy();
    expect(screen.getByText("Ask about this claim")).toBeTruthy();
  });

  it("shows an honest empty state when nothing matches", async () => {
    mocks.retrieveEncounterSegments.mockResolvedValue([]);
    const { dom } = renderLayer();
    const paragraph = dom.querySelectorAll("p")[1]!;

    selectTextIn(paragraph);
    fireEvent.mouseUp(paragraph);

    await waitFor(() =>
      expect(
        screen.getByText("Not directly quoted in this transcript."),
      ).toBeTruthy(),
    );
  });

  it("ignores a trivially short selection", () => {
    const { dom } = renderLayer();
    const paragraph = dom.querySelectorAll("p")[0]!;

    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(paragraph.firstChild!, 2);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(paragraph);

    expect(mocks.retrieveEncounterSegments).not.toHaveBeenCalled();
  });
});
