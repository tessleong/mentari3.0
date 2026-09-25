import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  expectedSpeakerCount: null as number | null,
  participantHumanIds: [] as string[],
}));

vi.mock("~/session/queries", () => ({
  useSession: () => ({ expected_speaker_count: mocks.expectedSpeakerCount }),
  useUpdateSession: () => mocks.updateSession,
}));

vi.mock("~/stt/queries", () => ({
  useSessionParticipantHumanIds: () => mocks.participantHumanIds,
}));

import { StartRecordingDialog } from "./start-recording-dialog";

function renderDialog(
  overrides: Partial<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  }> = {},
) {
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const result = render(
    <StartRecordingDialog
      sessionId="session-1"
      open={overrides.open ?? true}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />,
  );
  return { ...result, onOpenChange, onConfirm };
}

describe("StartRecordingDialog", () => {
  beforeEach(() => {
    mocks.expectedSpeakerCount = null;
    mocks.participantHumanIds = [];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not render its content when closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByText("How many speakers?")).toBeNull();
  });

  it("pre-fills the participant count as the default when nothing is set yet", () => {
    mocks.participantHumanIds = ["human-1", "human-2"];

    renderDialog();

    expect(mocks.updateSession).toHaveBeenCalledWith({
      expected_speaker_count: 2,
    });
  });

  it("does not override an already-set expected speaker count", () => {
    mocks.expectedSpeakerCount = 3;
    mocks.participantHumanIds = ["human-1", "human-2"];

    renderDialog();

    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("leaves Auto selected when there are no participants and nothing set", () => {
    renderDialog();

    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(
      screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("confirms with Start Recording, closing the dialog and calling onConfirm", () => {
    const { onOpenChange, onConfirm } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Start Recording" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without calling onConfirm", () => {
    const { onOpenChange, onConfirm } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("persists a picked speaker count via the shared picker", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("radio", { name: "3" }));

    expect(mocks.updateSession).toHaveBeenCalledWith({
      expected_speaker_count: 3,
    });
  });
});
