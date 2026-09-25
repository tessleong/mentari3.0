import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useListenerMock } = vi.hoisted(() => ({
  useListenerMock: vi.fn(),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: useListenerMock,
}));

import { TranscriptListeningState } from "./listening";

function mockAmplitude(mic: number, speaker: number) {
  useListenerMock.mockImplementation(
    (
      selector: (state: {
        live: { amplitude: { mic: number; speaker: number } };
      }) => unknown,
    ) => selector({ live: { amplitude: { mic, speaker } } }),
  );
}

describe("TranscriptListeningState", () => {
  afterEach(() => {
    cleanup();
    useListenerMock.mockReset();
  });

  it("shows the default message before any audio is detected", () => {
    mockAmplitude(0, 0);

    render(<TranscriptListeningState status="listening" />);

    expect(screen.getByText("Listening...")).not.toBeNull();
    expect(
      screen.getByText(
        "Transcript will appear here when the first segment arrives.",
      ),
    ).not.toBeNull();
    expect(screen.getByLabelText("No audio detected yet")).not.toBeNull();
  });

  it("confirms audio is being picked up once amplitude rises", () => {
    mockAmplitude(0.4, 0);

    render(<TranscriptListeningState status="listening" />);

    expect(
      screen.getByText(
        "Picking up audio — transcript will appear here shortly.",
      ),
    ).not.toBeNull();
    expect(screen.getByLabelText("Audio is being detected")).not.toBeNull();
  });

  it("shows a finalizing spinner instead of the amplitude bars", () => {
    mockAmplitude(0.4, 0);

    render(<TranscriptListeningState status="finalizing" />);

    expect(screen.getByText("Finalizing transcript...")).not.toBeNull();
    expect(screen.queryByLabelText("Audio is being detected")).toBeNull();
  });
});
