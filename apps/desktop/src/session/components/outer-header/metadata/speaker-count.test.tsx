import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  expectedSpeakerCount: null as number | null,
}));

vi.mock("~/session/queries", () => ({
  useSession: () => ({ expected_speaker_count: mocks.expectedSpeakerCount }),
  useUpdateSession: () => mocks.updateSession,
}));

import { SpeakerCountEditor } from "./speaker-count";

describe("SpeakerCountEditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.expectedSpeakerCount = null;
  });

  it("marks Auto selected when no count is set", () => {
    render(<SpeakerCountEditor sessionId="session-1" />);

    expect(
      screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "3" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("marks the stored count selected", () => {
    mocks.expectedSpeakerCount = 3;

    render(<SpeakerCountEditor sessionId="session-1" />);

    expect(
      screen.getByRole("radio", { name: "3" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("stores a chosen speaker count", () => {
    render(<SpeakerCountEditor sessionId="session-1" />);

    fireEvent.click(screen.getByRole("radio", { name: "4" }));

    expect(mocks.updateSession).toHaveBeenCalledWith({
      expected_speaker_count: 4,
    });
  });

  it("offers 1 for a single-speaker recording, e.g. a lecture or dictation", () => {
    render(<SpeakerCountEditor sessionId="session-1" />);

    fireEvent.click(screen.getByRole("radio", { name: "1" }));

    expect(mocks.updateSession).toHaveBeenCalledWith({
      expected_speaker_count: 1,
    });
  });

  it("clears back to Auto", () => {
    mocks.expectedSpeakerCount = 3;
    render(<SpeakerCountEditor sessionId="session-1" />);

    fireEvent.click(screen.getByRole("radio", { name: "Auto" }));

    expect(mocks.updateSession).toHaveBeenCalledWith({
      expected_speaker_count: null,
    });
  });

  it("reveals a numeric input for a custom count beyond the presets", () => {
    render(<SpeakerCountEditor sessionId="session-1" />);

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom expected speaker count"), {
      target: { value: "8" },
    });

    expect(mocks.updateSession).toHaveBeenCalledWith({
      expected_speaker_count: 8,
    });
  });

  it("shows Custom selected and pre-filled when the stored count exceeds the presets", () => {
    mocks.expectedSpeakerCount = 12;
    render(<SpeakerCountEditor sessionId="session-1" />);

    expect(
      screen
        .getByRole("radio", { name: "Custom" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByLabelText<HTMLInputElement>("Custom expected speaker count")
        .value,
    ).toBe("12");
  });

  it("does not persist an incomplete or invalid custom value while typing", () => {
    render(<SpeakerCountEditor sessionId="session-1" />);

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom expected speaker count"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Custom expected speaker count"), {
      target: { value: "0" },
    });

    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});
