import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMinimumVisibleDuration } from "./use-minimum-visible-duration";

describe("useMinimumVisibleDuration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays visible for at least minMs even if the caller flips back to false immediately", () => {
    const { result, rerender } = renderHook(
      ({ want }) => useMinimumVisibleDuration(want, 500),
      { initialProps: { want: true } },
    );

    expect(result.current).toBe(true);

    rerender({ want: false });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it("hides immediately if it was never shown", () => {
    const { result } = renderHook(() => useMinimumVisibleDuration(false, 500));
    expect(result.current).toBe(false);
  });

  it("does not reset the timer if it flips true again while still within the minimum window", () => {
    const { result, rerender } = renderHook(
      ({ want }) => useMinimumVisibleDuration(want, 500),
      { initialProps: { want: true } },
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ want: false });
    rerender({ want: true });

    act(() => {
      vi.advanceTimersByTime(199);
    });
    rerender({ want: false });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it("stays visible the whole time if it keeps wanting to be shown past minMs", () => {
    const { result, rerender } = renderHook(
      ({ want }) => useMinimumVisibleDuration(want, 500),
      { initialProps: { want: true } },
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);

    rerender({ want: false });
    expect(result.current).toBe(false);
  });
});
