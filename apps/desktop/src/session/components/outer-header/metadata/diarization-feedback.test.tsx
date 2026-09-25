import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordDiarizationFeedback: vi.fn(),
  session: { expected_speaker_count: null as number | null },
  configValue: undefined as string | undefined,
}));

vi.mock("~/session/queries", () => ({
  DIARIZATION_FEEDBACK_REASONS: [
    "wrong_speaker",
    "missed_speaker",
    "transcript_words",
    "speaker_boundary",
    "overlapping_speech",
    "doctor_patient_label",
    "other",
  ],
  recordDiarizationFeedback: mocks.recordDiarizationFeedback,
  useSession: () => mocks.session,
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => mocks.configValue,
}));

import { DiarizationFeedback } from "./diarization-feedback";

describe("DiarizationFeedback", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.session = { expected_speaker_count: null };
    mocks.configValue = undefined;
  });

  it("records a positive rating and thanks the user", () => {
    render(<DiarizationFeedback sessionId="session-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Good transcription" }));

    expect(mocks.recordDiarizationFeedback).toHaveBeenCalledWith({
      sessionId: "session-1",
      rating: "positive",
      reason: undefined,
      provider: undefined,
      speakerMode: "auto",
    });
    expect(screen.getByText("Thanks for the feedback.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Good transcription" }),
    ).toBeNull();
  });

  it("opens a reason picker after a negative rating and records the chosen reason", () => {
    mocks.session = { expected_speaker_count: 3 };
    mocks.configValue = "soniqo";
    render(<DiarizationFeedback sessionId="session-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Something was wrong" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Wrong speaker" }));

    expect(mocks.recordDiarizationFeedback).toHaveBeenCalledWith({
      sessionId: "session-1",
      rating: "negative",
      reason: "wrong_speaker",
      provider: "soniqo",
      speakerMode: "exact_3",
    });
    expect(screen.getByText("Thanks for the feedback.")).toBeTruthy();
  });
});
