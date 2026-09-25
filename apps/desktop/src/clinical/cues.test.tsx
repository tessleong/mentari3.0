import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeTransaction: vi.fn().mockResolvedValue(undefined),
  recordClinicalAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
  useLiveQuery: () => ({ data: [] }),
}));

vi.mock("./audit", () => ({
  recordClinicalAuditEvent: mocks.recordClinicalAuditEvent,
}));

import { ClinicalCueComposer } from "./cues";

describe("ClinicalCueComposer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders expanded by default with the composer visible", () => {
    render(<ClinicalCueComposer sessionId="session-1" />);

    expect(screen.getByLabelText("Quick clinical cue")).not.toBeNull();
  });

  it("minimizes to a pill and can be reopened, persisting across remounts", () => {
    const { unmount } = render(<ClinicalCueComposer sessionId="session-1" />);

    fireEvent.click(screen.getByLabelText("Minimize quick cue or correction"));

    expect(screen.queryByLabelText("Quick clinical cue")).toBeNull();
    expect(
      screen.getByLabelText("Show quick cue or correction"),
    ).not.toBeNull();

    unmount();
    render(<ClinicalCueComposer sessionId="session-1" />);

    expect(screen.queryByLabelText("Quick clinical cue")).toBeNull();
    expect(
      screen.getByLabelText("Show quick cue or correction"),
    ).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Show quick cue or correction"));

    expect(screen.getByLabelText("Quick clinical cue")).not.toBeNull();
  });

  it("repositions on drag and persists the offset across remounts", () => {
    const { container, unmount } = render(
      <ClinicalCueComposer sessionId="session-1" />,
    );
    const panel = container.querySelector(
      "[class*='absolute'][class*='right-3']",
    ) as HTMLElement;
    const handle = panel.querySelector(".cursor-grab") as HTMLElement;

    expect(panel.style.transform).toBe("translate(0px, 0px)");

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 60, clientY: 70 });
    fireEvent.mouseUp(window);

    expect(panel.style.transform).toBe("translate(-40px, -30px)");

    unmount();
    const { container: nextContainer } = render(
      <ClinicalCueComposer sessionId="session-1" />,
    );
    const nextPanel = nextContainer.querySelector(
      "[class*='absolute'][class*='right-3']",
    ) as HTMLElement;
    expect(nextPanel.style.transform).toBe("translate(-40px, -30px)");
  });
});
