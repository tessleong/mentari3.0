import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveTranscriptToggle } from "./live-transcript";

const mocks = vi.hoisted(() => ({
  sessionMode: "active" as string,
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      getSessionMode: () => mocks.sessionMode,
    }),
}));

vi.mock("~/session/components/note-input/transcript", () => ({
  Transcript: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="transcript-panel">transcript for {sessionId}</div>
  ),
}));

describe("LiveTranscriptToggle", () => {
  beforeEach(() => {
    mocks.sessionMode = "active";
  });

  afterEach(cleanup);

  it("renders nothing when the session is not actively recording", () => {
    mocks.sessionMode = "inactive";
    const { container } = render(
      <LiveTranscriptToggle sessionId="session-1" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows the toggle while recording, closed by default", () => {
    render(<LiveTranscriptToggle sessionId="session-1" />);

    expect(
      screen.getByRole("button", { name: "Show live transcript" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("transcript-panel")).toBeNull();
  });

  it("opens the live transcript panel on click and can close it again", async () => {
    render(<LiveTranscriptToggle sessionId="session-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Show live transcript" }),
    );

    expect(screen.getByTestId("transcript-panel").textContent).toBe(
      "transcript for session-1",
    );
    expect(
      screen.getByRole("button", { name: "Hide live transcript" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByTestId("transcript-panel")).toBeNull(),
    );
  });

  it("also shows the toggle while the transcript is finalizing", () => {
    mocks.sessionMode = "finalizing";
    render(<LiveTranscriptToggle sessionId="session-1" />);

    expect(
      screen.getByRole("button", { name: "Show live transcript" }),
    ).toBeTruthy();
  });
});
