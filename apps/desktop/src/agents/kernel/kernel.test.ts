import { describe, expect, it, vi } from "vitest";

import { runAgent } from "./kernel";
import type { AgentPolicy, Budget, ToolCall, ToolResult } from "./types";

const budget: Budget = {
  maxRounds: 12,
  maxWallClockMs: 90_000,
  maxTokens: 40_000,
};

type State = { goal: string; seen: string[]; rounds: number };

/** A policy whose satisfaction is driven by the test, not by a model. */
function makePolicy(
  overrides: Partial<AgentPolicy<State, string>> & {
    satisfiedAfter?: number;
    openQuestions?: string[];
    tokensPerRound?: number;
  } = {},
): AgentPolicy<State, string> {
  const {
    satisfiedAfter = 1,
    openQuestions = [],
    tokensPerRound = 0,
    ...rest
  } = overrides;
  return {
    role: "test",
    budget,
    init: (goal) => ({ goal, seen: [], rounds: 0 }),
    plan: async (state) => `query-${state.rounds + 1}`,
    act: (_state, thought) => [
      {
        tool: "search",
        input: thought,
        requiresNetwork: true,
        containsPhi: false,
      },
    ],
    observe: (state, results) => ({
      ...state,
      rounds: state.rounds + 1,
      seen: [...state.seen, ...results.map((r) => r.tool)],
    }),
    critique: async (state) => ({
      satisfied: state.rounds >= satisfiedAfter,
      openQuestions: state.rounds >= satisfiedAfter ? [] : openQuestions,
      tokensUsed: tokensPerRound,
    }),
    ...rest,
  };
}

const okRunner = async (calls: ToolCall[]): Promise<ToolResult[]> =>
  calls.map((call) => ({ tool: call.tool, ok: true, output: call.input }));

describe("runAgent", () => {
  it("exits as soon as the policy's critique is satisfied", async () => {
    const run = await runAgent({
      policy: makePolicy({ satisfiedAfter: 1 }),
      goal: "a claim",
      runTools: okRunner,
    });

    expect(run.outcome).toBe("satisfied");
    expect(run.usage.rounds).toBe(1);
  });

  it("keeps looping until the critique is satisfied", async () => {
    const run = await runAgent({
      policy: makePolicy({ satisfiedAfter: 4 }),
      goal: "a claim",
      runTools: okRunner,
    });

    expect(run.outcome).toBe("satisfied");
    expect(run.usage.rounds).toBe(4);
  });

  it("emits think, act, observe and critique in order for each round", async () => {
    const steps: string[] = [];
    await runAgent({
      policy: makePolicy({ satisfiedAfter: 2 }),
      goal: "a claim",
      runTools: okRunner,
      onStep: (step) => steps.push(`${step.round}:${step.kind}`),
    });

    expect(steps).toEqual([
      "1:think",
      "1:act",
      "1:observe",
      "1:critique",
      "2:think",
      "2:act",
      "2:observe",
      "2:critique",
    ]);
  });

  describe("budget backstop", () => {
    it("pauses rather than discarding work when the round cap is hit", async () => {
      const run = await runAgent({
        policy: {
          ...makePolicy({
            satisfiedAfter: 99,
            openQuestions: ["what refutes this?"],
          }),
          budget: { ...budget, maxRounds: 3 },
        },
        goal: "a claim",
        runTools: okRunner,
      });

      expect(run.outcome).toBe("budget_paused");
      expect(run.usage.rounds).toBe(3);
      // The partial state survives so the panel can show findings so far.
      expect(run.state.seen).toHaveLength(3);
      expect(run.openQuestions).toEqual(["what refutes this?"]);
    });

    it("pauses when the wall clock cap is hit", async () => {
      let clock = 0;
      const run = await runAgent({
        policy: {
          ...makePolicy({ satisfiedAfter: 99 }),
          budget: { ...budget, maxWallClockMs: 50 },
        },
        goal: "a claim",
        runTools: okRunner,
        now: () => (clock += 30),
      });

      expect(run.outcome).toBe("budget_paused");
      expect(run.usage.rounds).toBeLessThan(12);
    });

    it("pauses when the token cap is hit", async () => {
      const run = await runAgent({
        policy: {
          ...makePolicy({ satisfiedAfter: 99, tokensPerRound: 400 }),
          budget: { ...budget, maxTokens: 1000 },
        },
        goal: "a claim",
        runTools: okRunner,
      });

      expect(run.outcome).toBe("budget_paused");
      expect(run.usage.tokens).toBeGreaterThanOrEqual(1000);
    });

    it("resumes a paused run without repeating completed rounds", async () => {
      const policy = {
        ...makePolicy({ satisfiedAfter: 5 }),
        budget: { ...budget, maxRounds: 2 },
      };
      const paused = await runAgent({
        policy,
        goal: "a claim",
        runTools: okRunner,
      });
      expect(paused.outcome).toBe("budget_paused");

      const resumed = await runAgent({
        policy: { ...policy, budget: { ...budget, maxRounds: 6 } },
        goal: "a claim",
        runTools: okRunner,
        initialState: paused.state,
        initialUsage: paused.usage,
      });

      expect(resumed.outcome).toBe("satisfied");
      expect(resumed.state.rounds).toBe(5);
    });
  });

  describe("PHI routing", () => {
    it("replans onto local tools when the router blocks a call", async () => {
      const replanWithoutNetwork = vi.fn((): ToolCall[] => [
        {
          tool: "local",
          input: "cached",
          requiresNetwork: false,
          containsPhi: true,
        },
      ]);
      const runTools = vi.fn(
        async (calls: ToolCall[]): Promise<ToolResult[]> =>
          calls.map((call) =>
            call.requiresNetwork
              ? { tool: call.tool, ok: false, blocked: true }
              : { tool: call.tool, ok: true, output: call.input },
          ),
      );

      const run = await runAgent({
        policy: { ...makePolicy({ satisfiedAfter: 1 }), replanWithoutNetwork },
        goal: "a claim",
        runTools,
      });

      expect(replanWithoutNetwork).toHaveBeenCalledTimes(1);
      // The blocked call is not a failure: the local result reaches observe.
      expect(run.state.seen).toContain("local");
      expect(run.outcome).toBe("satisfied");
    });

    it("does not fail the run when a block cannot be replanned", async () => {
      const run = await runAgent({
        policy: makePolicy({ satisfiedAfter: 1 }),
        goal: "a claim",
        runTools: async (calls) =>
          calls.map((call) => ({ tool: call.tool, ok: false, blocked: true })),
      });

      expect(run.outcome).toBe("satisfied");
    });
  });

  it("reports aborted without losing the state gathered so far", async () => {
    const controller = new AbortController();
    const run = await runAgent({
      policy: makePolicy({ satisfiedAfter: 99 }),
      goal: "a claim",
      runTools: async (calls) => {
        controller.abort();
        return okRunner(calls);
      },
      signal: controller.signal,
    });

    expect(run.outcome).toBe("aborted");
    expect(run.state.rounds).toBeGreaterThanOrEqual(0);
  });

  it("reports a failing policy as failed rather than throwing", async () => {
    const run = await runAgent({
      policy: {
        ...makePolicy(),
        plan: async () => {
          throw new Error("model unavailable");
        },
      },
      goal: "a claim",
      runTools: okRunner,
    });

    expect(run.outcome).toBe("failed");
    expect(run.error).toContain("model unavailable");
  });
});
