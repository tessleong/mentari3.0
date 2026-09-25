import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listener: undefined as ((event: any) => void) | undefined,
  on: vi.fn(),
  toastWarning: vi.fn(),
  tabsGetState: vi.fn(),
}));

vi.mock("@anlg/ui/components/ui/toast", () => ({
  sonnerToast: { warning: mocks.toastWarning },
}));

vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => ({ on: mocks.on }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: mocks.tabsGetState },
}));

import { useAutoEnhance } from "./useAutoEnhance";

describe("useAutoEnhance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listener = undefined;
    mocks.on.mockImplementation((listener) => {
      mocks.listener = listener;
      return vi.fn();
    });
  });

  it("navigates to a freshly auto-enhanced note", () => {
    const updateSessionTabState = vi.fn();
    const sessionTab = { type: "sessions", id: "session-2", state: {} };
    mocks.tabsGetState.mockReturnValue({
      tabs: [sessionTab],
      updateSessionTabState,
    });

    renderHook(() =>
      useAutoEnhance({ type: "sessions", id: "session-2" } as any),
    );

    act(() => {
      mocks.listener?.({
        type: "auto-enhance-started",
        sessionId: "session-2",
        noteId: "note-fresh",
      });
    });

    expect(updateSessionTabState).toHaveBeenCalledWith(sessionTab, {
      view: { type: "enhanced", id: "note-fresh" },
    });
  });

  it("does not re-navigate when a retry re-fires auto-enhance-started for the same note", () => {
    // Generation that fails keeps retrying in the background, and each retry
    // re-emits this event. It must not keep yanking the user back to the
    // summary view after they've deliberately switched away.
    const updateSessionTabState = vi.fn();
    const sessionTab = { type: "sessions", id: "session-3", state: {} };
    mocks.tabsGetState.mockReturnValue({
      tabs: [sessionTab],
      updateSessionTabState,
    });

    renderHook(() =>
      useAutoEnhance({ type: "sessions", id: "session-3" } as any),
    );

    act(() => {
      mocks.listener?.({
        type: "auto-enhance-started",
        sessionId: "session-3",
        noteId: "note-retried",
      });
      mocks.listener?.({
        type: "auto-enhance-started",
        sessionId: "session-3",
        noteId: "note-retried",
      });
    });

    expect(updateSessionTabState).toHaveBeenCalledTimes(1);
  });

  it("shows why an automatic summary was skipped for a short transcript", () => {
    renderHook(() =>
      useAutoEnhance({ type: "sessions", id: "session-1" } as any),
    );

    act(() => {
      mocks.listener?.({
        type: "auto-enhance-skipped",
        sessionId: "session-1",
        reason:
          "Transcript too short to summarize (120/160 characters minimum)",
        reasonCode: "transcript_too_short",
      });
    });

    expect(mocks.toastWarning).toHaveBeenCalledWith(
      "Summary wasn't generated",
      {
        id: "auto-summary-too-short-session-1",
        description:
          "Transcript too short to summarize (120/160 characters minimum)",
      },
    );
  });
});
