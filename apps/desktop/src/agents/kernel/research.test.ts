import { describe, expect, it, vi } from "vitest";

import { runAgent } from "./kernel";
import { createResearchPolicy, DISCONFIRM_PREFIX } from "./research";
import type { EvidenceItem } from "./research";
import type { ToolCall, ToolResult } from "./types";

const article = (
  id: string,
  stance: EvidenceItem["stance"] = "supports",
): EvidenceItem => ({
  id,
  title: `Article ${id}`,
  excerpt: `Excerpt ${id}`,
  url: `https://example.test/${id}`,
  stance,
});

const anyThought = { queries: [], leading: "" };

const resultsFor = (calls: ToolCall[], items: EvidenceItem[]): ToolResult[] =>
  calls.map((call) => ({ tool: call.tool, call, ok: true, output: items }));

describe("research policy", () => {
  it("always issues a disconfirming query, even when the planner proposes none", () => {
    const policy = createResearchPolicy({
      proposeQueries: async () => ({
        queries: ["statin efficacy"],
        leading: "statins help",
      }),
    });
    const state = policy.init("statins reduce mortality");

    const calls = policy.act(state, {
      queries: ["statin efficacy"],
      leading: "statins help",
    });

    const disconfirming = calls.filter((call) =>
      String(call.input).startsWith(DISCONFIRM_PREFIX),
    );
    expect(disconfirming).toHaveLength(1);
  });

  it("does not re-explore a query it has already run", () => {
    const policy = createResearchPolicy({
      proposeQueries: async () => ({ queries: [], leading: "" }),
    });
    let state = policy.init("a claim");
    const first = policy.act(state, { queries: ["alpha"], leading: "x" });
    state = policy.observe(
      state,
      resultsFor(first, [article("1")]),
      anyThought,
    );

    const second = policy.act(state, {
      queries: ["alpha", "beta"],
      leading: "x",
    });

    const inputs = second.map((call) => String(call.input));
    expect(inputs).not.toContain("alpha");
    expect(inputs).toContain("beta");
  });

  it("dedupes evidence by id across rounds", () => {
    const policy = createResearchPolicy({
      proposeQueries: async () => ({ queries: [], leading: "" }),
    });
    let state = policy.init("a claim");
    const calls = policy.act(state, { queries: ["alpha"], leading: "x" });

    state = policy.observe(
      state,
      resultsFor(calls, [article("1"), article("2")]),
      anyThought,
    );
    state = policy.observe(
      state,
      resultsFor(calls, [article("2"), article("3")]),
      anyThought,
    );

    expect(state.evidence.map((item) => item.id).sort()).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("is not satisfied while a contradiction is unresolved", async () => {
    const policy = createResearchPolicy({
      proposeQueries: async () => ({ queries: [], leading: "" }),
    });
    let state = policy.init("a claim");
    const calls = policy.act(state, { queries: ["alpha"], leading: "x" });
    state = policy.observe(
      state,
      resultsFor(calls, [article("1", "supports"), article("2", "refutes")]),
      anyThought,
    );

    const critique = await policy.critique(state, new AbortController().signal);

    expect(critique.satisfied).toBe(false);
    expect(critique.openQuestions.join(" ")).toMatch(/contradict/i);
  });

  it("is satisfied once a round adds nothing new and nothing contradicts", async () => {
    const policy = createResearchPolicy({
      proposeQueries: async () => ({ queries: [], leading: "" }),
    });
    let state = policy.init("a claim");
    const first = policy.act(state, { queries: ["alpha"], leading: "x" });
    state = policy.observe(
      state,
      resultsFor(first, [article("1")]),
      anyThought,
    );
    // A second round that surfaces only what is already known = saturation.
    const second = policy.act(state, { queries: ["beta"], leading: "x" });
    state = policy.observe(
      state,
      resultsFor(second, [article("1")]),
      anyThought,
    );

    const critique = await policy.critique(state, new AbortController().signal);

    expect(critique.satisfied).toBe(true);
  });

  it("falls back to local evidence when the router blocks network calls", () => {
    const policy = createResearchPolicy({
      proposeQueries: async () => ({ queries: [], leading: "" }),
    });
    const state = policy.init("a claim");
    const blocked: ToolCall[] = [
      {
        tool: "search_evidence",
        input: "alpha",
        requiresNetwork: true,
        containsPhi: true,
      },
    ];

    const local = policy.replanWithoutNetwork?.(state, blocked) ?? [];

    expect(local).toHaveLength(1);
    expect(local[0]?.requiresNetwork).toBe(false);
  });

  it("runs end to end through the kernel and stops on saturation", async () => {
    const proposeQueries = vi.fn(async () => ({
      queries: ["alpha"],
      leading: "x",
    }));
    const policy = createResearchPolicy({ proposeQueries });

    const run = await runAgent({
      policy,
      goal: "a claim",
      runTools: async (calls) => resultsFor(calls, [article("1")]),
    });

    expect(run.outcome).toBe("satisfied");
    expect(proposeQueries).toHaveBeenCalled();
    expect(run.state.evidence).toHaveLength(1);
  });
});
