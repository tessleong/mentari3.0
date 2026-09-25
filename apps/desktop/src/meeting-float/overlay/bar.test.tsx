import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import chroma from "chroma-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FloatingBarState } from "@anlg/plugin-windows";

import { FloatingBarOverlay } from "./bar";

import { getSpeakerColorForLabel } from "~/shared/speaker-colors";

const mocks = vi.hoisted(() => ({
  windowShow: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  windowEmitNavigate: vi.fn().mockResolvedValue({ status: "ok", data: null }),
}));

vi.mock("@anlg/plugin-windows", () => ({
  commands: {
    windowShow: mocks.windowShow,
    windowEmitNavigate: mocks.windowEmitNavigate,
  },
}));

vi.mock("@anlg/ui/components/ui/dancing-sticks", () => ({
  DancingSticks: ({ amplitude }: { amplitude: number }) => (
    <span data-testid="waveform" data-amplitude={amplitude} />
  ),
}));

function state(overrides: Partial<FloatingBarState> = {}): FloatingBarState {
  return {
    amplitude: 0.4,
    title: "Weekly sync",
    durationSeconds: 90,
    status: "recording",
    colorScheme: "light",
    opacity: 0.78,
    liveCaptionOpacity: 0.3,
    liveCaptionWidth: 440,
    liveCaptionLineCount: 1,
    liveCaptionPosition: "topCenter",
    liveCaptionMinimized: true,
    liveCaptionToggleVisible: true,
    transcriptBubbles: [
      {
        id: "1",
        speakerLabel: "Ada",
        text: "Let's start.",
        isSelf: false,
        isFinal: true,
        startMs: 0,
        endMs: 1200,
        overlapsPrevious: false,
        overlapsNext: false,
      },
    ],
    ...overrides,
  };
}

describe("FloatingBarOverlay", () => {
  afterEach(() => {
    cleanup();
    mocks.windowShow.mockClear();
    mocks.windowEmitNavigate.mockClear();
  });

  it("stops listening from the compact bar", () => {
    const onStop = vi.fn();

    render(
      <FloatingBarOverlay
        state={state()}
        onStop={onStop}
        onToggleExpanded={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));

    expect(onStop).toHaveBeenCalledOnce();
    expect(screen.getByTestId("waveform")).toBeTruthy();
  });

  it("expands to the live transcript and can collapse again", () => {
    const onToggleExpanded = vi.fn();

    const view = render(
      <FloatingBarOverlay
        state={state()}
        onStop={vi.fn()}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Expand live transcript" }),
    );
    expect(onToggleExpanded).toHaveBeenCalledWith(true);

    view.rerender(
      <FloatingBarOverlay
        state={state({ liveCaptionMinimized: false })}
        onStop={vi.fn()}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    expect(screen.getByText("Weekly sync")).toBeTruthy();
    expect(screen.getByText("Let's start.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse live transcript" }),
    );
    expect(onToggleExpanded).toHaveBeenCalledWith(false);
  });

  it("colors each speaker's bubble and label with a distinct speaker color", () => {
    render(
      <FloatingBarOverlay
        state={state({ liveCaptionMinimized: false })}
        onStop={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    );

    const label = screen.getByText("Ada");
    const hexColor = getSpeakerColorForLabel("Ada", false, "light");
    const [r, g, b] = chroma(hexColor).rgb();

    expect(label.style.color).toBe(`rgb(${r}, ${g}, ${b})`);
    expect(screen.getByText("Let's start.").style.boxShadow).toContain(
      hexColor,
    );
  });

  it("opens main-window settings from the expanded panel's settings button", async () => {
    render(
      <FloatingBarOverlay
        state={state({ liveCaptionMinimized: false })}
        onStop={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    await waitFor(() => {
      expect(mocks.windowShow).toHaveBeenCalledWith({ type: "main" });
    });
    expect(mocks.windowEmitNavigate).toHaveBeenCalledWith(
      { type: "main" },
      { path: "/app/settings", search: null },
    );
  });

  it("does not show a settings button on the collapsed compact pill", () => {
    render(
      <FloatingBarOverlay
        state={state()}
        onStop={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Open settings" })).toBeNull();
  });

  it("shows the logo mark in the compact pill but not the expanded panel", () => {
    const view = render(
      <FloatingBarOverlay
        state={state()}
        onStop={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    );

    expect(screen.getByTestId("mentari-logo-mark")).toBeTruthy();

    view.rerender(
      <FloatingBarOverlay
        state={state({ liveCaptionMinimized: false })}
        onStop={vi.fn()}
        onToggleExpanded={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("mentari-logo-mark")).toBeNull();
  });
});
