import { create } from "zustand";

import type { AgentStep, RunOutcome } from "./kernel/types";
import type { AgentRole } from "./personality";

export type AgentPanelRun = {
  /** What the agent was asked to work on. */
  goal?: string;
  outcome: RunOutcome | "running";
  steps: AgentStep[];
  openQuestions: string[];
  answer?: string;
};

/** Wired up by whatever is driving the loop, so the panel itself stays a
 * presenter and never owns a run. */
export type AgentControls = {
  keepGoing?: () => void;
  stop?: () => void;
};

export const emptyRun = (): AgentPanelRun => ({
  outcome: "running",
  steps: [],
  openQuestions: [],
});

type PanelStore = {
  /** Front-to-back order; the last entry paints on top. */
  order: AgentRole[];
  runs: Partial<Record<AgentRole, AgentPanelRun>>;
  controls: Partial<Record<AgentRole, AgentControls>>;
  open: (role: AgentRole) => void;
  /** Opens a panel on a fresh run for a new goal, replacing whatever it held. */
  start: (role: AgentRole, goal: string) => void;
  close: (role: AgentRole) => void;
  raise: (role: AgentRole) => void;
  setRun: (role: AgentRole, run: AgentPanelRun) => void;
  appendStep: (role: AgentRole, step: AgentStep) => void;
  setControls: (role: AgentRole, controls: AgentControls) => void;
};

const toFront = (order: AgentRole[], role: AgentRole) => [
  ...order.filter((entry) => entry !== role),
  role,
];

export const useAgentPanels = create<PanelStore>((set) => ({
  order: [],
  runs: {},
  controls: {},

  open: (role) =>
    set((state) => ({
      order: toFront(state.order, role),
      // Re-opening a panel keeps whatever the agent already worked out.
      runs: state.runs[role]
        ? state.runs
        : { ...state.runs, [role]: emptyRun() },
    })),

  start: (role, goal) =>
    set((state) => ({
      order: toFront(state.order, role),
      runs: { ...state.runs, [role]: { ...emptyRun(), goal } },
    })),

  close: (role) =>
    set((state) => ({ order: state.order.filter((entry) => entry !== role) })),

  raise: (role) =>
    set((state) =>
      state.order[state.order.length - 1] === role
        ? state
        : { order: toFront(state.order, role) },
    ),

  setRun: (role, run) =>
    set((state) => ({ runs: { ...state.runs, [role]: run } })),

  appendStep: (role, step) =>
    set((state) => {
      const current = state.runs[role] ?? emptyRun();
      return {
        runs: {
          ...state.runs,
          [role]: { ...current, steps: [...current.steps, step] },
        },
      };
    }),

  setControls: (role, controls) =>
    set((state) => ({ controls: { ...state.controls, [role]: controls } })),
}));
