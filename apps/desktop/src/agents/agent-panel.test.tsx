import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./personality", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./personality")>()),
  PersonalityAvatar: () => <span data-testid="avatar" />,
}));

import { AgentPanel, AgentPanelHost } from "./agent-panel";
import { emptyRun, useAgentPanels } from "./panels";

beforeEach(() => {
  localStorage.clear();
  useAgentPanels.setState({ order: [], runs: {}, controls: {} });
});
afterEach(cleanup);

const drag = (role: string, dx: number, dy: number) => {
  const header = screen.getByTestId(`agent-panel-header-${role}`);
  fireEvent.mouseDown(header, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.mouseMove(window, { clientX: dx, clientY: dy });
  fireEvent.mouseUp(window);
};

describe("AgentPanel", () => {
  it("names the agent it belongs to", () => {
    useAgentPanels.getState().open("research");
    render(<AgentPanel role="research" />);

    expect(screen.getByRole("dialog", { name: "Research Agent" })).toBeTruthy();
  });

  it("can be dragged anywhere by its header", () => {
    useAgentPanels.getState().open("research");
    render(<AgentPanel role="research" />);

    drag("research", 120, 64);

    expect(screen.getByTestId("agent-panel-research").style.transform).toBe(
      "translate(120px, 64px)",
    );
  });

  it("remembers where it was dragged to", () => {
    useAgentPanels.getState().open("research");
    const first = render(<AgentPanel role="research" />);
    drag("research", 40, 20);
    first.unmount();

    render(<AgentPanel role="research" />);

    expect(screen.getByTestId("agent-panel-research").style.transform).toBe(
      "translate(40px, 20px)",
    );
  });

  it("keeps each agent's position separate", () => {
    const { open } = useAgentPanels.getState();
    open("research");
    open("explainer");
    render(<AgentPanelHost />);

    drag("research", 90, 90);

    expect(screen.getByTestId("agent-panel-explainer").style.transform).toBe(
      "translate(0px, 0px)",
    );
  });

  it("brings a panel back when it has been dragged out of reach", () => {
    useAgentPanels.getState().open("research");
    render(<AgentPanel role="research" />);
    drag("research", 4000, 4000);

    fireEvent.click(screen.getByLabelText("Reset position"));

    expect(screen.getByTestId("agent-panel-research").style.transform).toBe(
      "translate(0px, 0px)",
    );
  });

  it("raises the panel that was pressed above the others", () => {
    const { open } = useAgentPanels.getState();
    open("research");
    open("explainer");
    render(<AgentPanelHost />);

    fireEvent.mouseDown(screen.getByTestId("agent-panel-research"));

    expect(useAgentPanels.getState().order).toEqual(["explainer", "research"]);
    const research = screen.getByTestId("agent-panel-research");
    const explainer = screen.getByTestId("agent-panel-explainer");
    expect(Number(research.style.zIndex)).toBeGreaterThan(
      Number(explainer.style.zIndex),
    );
  });

  it("closes without closing its neighbours", () => {
    const { open } = useAgentPanels.getState();
    open("research");
    open("explainer");
    render(<AgentPanelHost />);

    fireEvent.click(screen.getAllByLabelText("Close agent")[0]!);

    expect(useAgentPanels.getState().order).toEqual(["explainer"]);
  });

  it("streams the reasoning steps rather than only the answer", () => {
    useAgentPanels.getState().open("research");
    useAgentPanels.getState().setRun("research", {
      ...emptyRun(),
      steps: [
        { kind: "think", round: 1, summary: "Searching: sepsis", at: 0 },
        { kind: "observe", round: 1, summary: "3 ok", at: 0 },
      ],
    });
    render(<AgentPanel role="research" />);

    const log = screen.getByRole("list", { name: "Reasoning steps" });
    expect(log.textContent).toContain("Searching: sepsis");
    expect(log.textContent).toContain("3 ok");
  });

  it("offers to keep going when a run pauses on its budget", () => {
    const keepGoing = vi.fn();
    useAgentPanels.getState().open("research");
    useAgentPanels.getState().setControls("research", { keepGoing });
    useAgentPanels.getState().setRun("research", {
      ...emptyRun(),
      outcome: "budget_paused",
      openQuestions: ["what refutes this?"],
    });
    render(<AgentPanel role="research" />);

    expect(screen.getByText("what refutes this?")).toBeTruthy();
    fireEvent.click(screen.getByText("Keep going"));

    expect(keepGoing).toHaveBeenCalled();
  });

  it("shows nothing until a panel is opened", () => {
    render(<AgentPanelHost />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
