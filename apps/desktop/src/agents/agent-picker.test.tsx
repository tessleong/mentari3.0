import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./personality", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./personality")>()),
  PersonalityAvatar: () => <span data-testid="avatar" />,
}));

import { AgentPicker } from "./agent-picker";
import { useAgentPanels } from "./panels";

const selectText = (text: string) =>
  vi.spyOn(window, "getSelection").mockReturnValue({
    toString: () => text,
  } as unknown as Selection);

beforeEach(() => {
  useAgentPanels.setState({ order: [], runs: {}, controls: {} });
  vi.restoreAllMocks();
});
afterEach(cleanup);

describe("AgentPicker", () => {
  it("stays collapsed until asked, so it cannot cover the toolbar", () => {
    render(<AgentPicker />);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByLabelText("Ask an agent")).toBeTruthy();
  });

  it("lists every agent when opened", () => {
    render(<AgentPicker />);

    fireEvent.click(screen.getByLabelText("Ask an agent"));

    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items).toEqual([
      "Research Agent",
      "Explainer Agent",
      "Scribe Agent",
    ]);
  });

  it("opens the chosen agent on the highlighted passage", () => {
    selectText("  lactate predicts mortality  ");
    render(<AgentPicker />);

    fireEvent.click(screen.getByLabelText("Ask an agent"));
    fireEvent.click(screen.getByText("Research Agent"));

    expect(useAgentPanels.getState().order).toEqual(["research"]);
    expect(useAgentPanels.getState().runs.research?.goal).toBe(
      "lactate predicts mortality",
    );
  });

  it("closes itself once an agent is chosen", () => {
    selectText("a claim");
    render(<AgentPicker />);

    fireEvent.click(screen.getByLabelText("Ask an agent"));
    fireEvent.click(screen.getByText("Explainer Agent"));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(useAgentPanels.getState().order).toEqual(["explainer"]);
  });

  it("truncates a very long selection rather than sending all of it", () => {
    selectText("x".repeat(9000));
    render(<AgentPicker />);

    fireEvent.click(screen.getByLabelText("Ask an agent"));
    fireEvent.click(screen.getByText("Research Agent"));

    expect(useAgentPanels.getState().runs.research?.goal).toHaveLength(6000);
  });

  it("can be toggled shut again without choosing", () => {
    render(<AgentPicker />);
    const trigger = screen.getByLabelText("Ask an agent");

    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(useAgentPanels.getState().order).toEqual([]);
  });
});
