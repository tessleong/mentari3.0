import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyRun, useAgentPanels } from "./panels";

beforeEach(() => {
  useAgentPanels.setState({ order: [], runs: {}, controls: {} });
});

describe("agent panel store", () => {
  it("opens a panel and gives it a blank run", () => {
    useAgentPanels.getState().open("research");

    expect(useAgentPanels.getState().order).toEqual(["research"]);
    expect(useAgentPanels.getState().runs.research).toEqual(emptyRun());
  });

  it("keeps the existing run when a panel is reopened", () => {
    const { open, setRun, close } = useAgentPanels.getState();
    open("research");
    setRun("research", { ...emptyRun(), answer: "already found" });
    close("research");

    useAgentPanels.getState().open("research");

    expect(useAgentPanels.getState().runs.research?.answer).toBe(
      "already found",
    );
  });

  it("raises a panel to the front without duplicating it", () => {
    const { open } = useAgentPanels.getState();
    open("research");
    open("explainer");

    useAgentPanels.getState().raise("research");

    expect(useAgentPanels.getState().order).toEqual(["explainer", "research"]);
  });

  it("closes a panel without disturbing the others", () => {
    const { open } = useAgentPanels.getState();
    open("research");
    open("explainer");

    useAgentPanels.getState().close("research");

    expect(useAgentPanels.getState().order).toEqual(["explainer"]);
  });

  it("appends streamed steps in order", () => {
    useAgentPanels.getState().open("research");
    const step = (round: number) =>
      ({ kind: "think", round, summary: `r${round}`, at: 0 }) as const;

    useAgentPanels.getState().appendStep("research", step(1));
    useAgentPanels.getState().appendStep("research", step(2));

    expect(
      useAgentPanels.getState().runs.research?.steps.map((s) => s.round),
    ).toEqual([1, 2]);
  });

  it("holds the controls the runtime registers", () => {
    const keepGoing = vi.fn();
    useAgentPanels.getState().setControls("research", { keepGoing });

    useAgentPanels.getState().controls.research?.keepGoing?.();

    expect(keepGoing).toHaveBeenCalled();
  });
});

describe("starting an agent on a selection", () => {
  it("opens the panel on a fresh run for the new goal", () => {
    useAgentPanels.getState().start("research", "lactate predicts mortality");

    expect(useAgentPanels.getState().order).toEqual(["research"]);
    expect(useAgentPanels.getState().runs.research?.goal).toBe(
      "lactate predicts mortality",
    );
  });

  it("replaces a previous run rather than appending to it", () => {
    const { start, setRun } = useAgentPanels.getState();
    start("research", "first claim");
    setRun("research", {
      ...useAgentPanels.getState().runs.research!,
      answer: "old answer",
    });

    useAgentPanels.getState().start("research", "second claim");

    const run = useAgentPanels.getState().runs.research;
    expect(run?.goal).toBe("second claim");
    expect(run?.answer).toBeUndefined();
  });

  it("brings an already-open panel to the front", () => {
    const { open } = useAgentPanels.getState();
    open("research");
    open("explainer");

    useAgentPanels.getState().start("research", "a claim");

    expect(useAgentPanels.getState().order).toEqual(["explainer", "research"]);
  });
});
