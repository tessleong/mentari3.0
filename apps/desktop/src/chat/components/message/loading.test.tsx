import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { avatarFallbackGradient } from "@anlg/ui/lib/avatar";

// JSDOM's CSSOM serializer normalizes `rgb(r, g, b)` differently from the
// raw string the gradient function produces (comma placement), so compare
// with commas stripped rather than exact string equality.
function normalizeGradient(value: string): string {
  return value.replace(/,/g, "");
}

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) => mocks.config[key],
  useConfigValues: () => ({}),
}));

import { LoadingMessage } from "./loading";

describe("LoadingMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.config = {};
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows an agent avatar matching the seed chosen in Appearance settings, not a generic or app-icon avatar", () => {
    mocks.config.agent_avatar_seed = "mentari-agent-9";
    const { container } = render(<LoadingMessage />);

    const avatar = container.querySelector('span[aria-hidden="true"]');
    expect(avatar).not.toBeNull();
    expect(normalizeGradient((avatar as HTMLElement).style.background)).toBe(
      normalizeGradient(avatarFallbackGradient("mentari-agent-9")),
    );
    expect(container.querySelector("img[src*='/assets/app-icons']")).toBeNull();
  });

  it("falls back to the default agent avatar seed for an unrecognized stored value", () => {
    mocks.config.agent_avatar_seed = "not-a-real-seed";
    const { container } = render(<LoadingMessage />);

    const avatar = container.querySelector('span[aria-hidden="true"]');
    expect(normalizeGradient((avatar as HTMLElement).style.background)).toBe(
      normalizeGradient(avatarFallbackGradient("mentari-agent-21")),
    );
  });

  it("starts with 'Thinking...' and shuffles to a different status message over time", () => {
    render(<LoadingMessage />);

    expect(screen.getByText("Thinking...")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(2200);
    });

    expect(screen.queryByText("Thinking...")).toBeNull();
  });

  it("cycles back to the first message after visiting the whole pool", () => {
    render(<LoadingMessage />);

    act(() => {
      vi.advanceTimersByTime(2200 * 6);
    });

    expect(screen.getByText("Thinking...")).not.toBeNull();
  });
});
