import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  values: {
    floating_bar_opacity: 0.78,
    live_caption_opacity: 0.3,
  } as Record<string, number>,
  setFloatingBarOpacity: vi.fn(),
  setLiveCaptionOpacity: vi.fn(),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) => mocks.values[key],
}));

vi.mock("~/settings/queries", () => ({
  useSetSettingValue: (key: string) =>
    key === "floating_bar_opacity"
      ? mocks.setFloatingBarOpacity
      : mocks.setLiveCaptionOpacity,
}));

import { FloatingOverlaySettingsView } from "./floating-overlay-settings";

describe("FloatingOverlaySettingsView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.values = { floating_bar_opacity: 0.78, live_caption_opacity: 0.3 };
  });

  it("shows the current opacity percentages", () => {
    render(<FloatingOverlaySettingsView />);

    expect(screen.getByText("78%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
  });

  it("persists a changed floating bar opacity", () => {
    render(<FloatingOverlaySettingsView />);

    fireEvent.change(
      screen.getByRole("slider", { name: "Floating bar opacity" }),
      { target: { value: "0.5" } },
    );

    expect(mocks.setFloatingBarOpacity).toHaveBeenCalledWith(0.5);
    expect(mocks.setLiveCaptionOpacity).not.toHaveBeenCalled();
  });

  it("persists a changed live transcript opacity", () => {
    render(<FloatingOverlaySettingsView />);

    fireEvent.change(
      screen.getByRole("slider", { name: "Live transcript opacity" }),
      { target: { value: "0.9" } },
    );

    expect(mocks.setLiveCaptionOpacity).toHaveBeenCalledWith(0.9);
    expect(mocks.setFloatingBarOpacity).not.toHaveBeenCalled();
  });
});
