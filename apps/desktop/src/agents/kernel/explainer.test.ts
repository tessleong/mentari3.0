import { describe, expect, it, vi } from "vitest";

import { createExplainerPolicy, findNewClaims, isReadable } from "./explainer";
import type { Concept, ExplainerThought } from "./explainer";
import { runAgent } from "./kernel";
import type { ToolCall, ToolResult } from "./types";

const noResults = async (calls: ToolCall[]): Promise<ToolResult[]> =>
  calls.map((call) => ({ tool: call.tool, call, ok: true, output: null }));

const thought = (over: Partial<ExplainerThought> = {}): ExplainerThought => ({
  conceptId: "c0",
  text: "Short and clear.",
  subConcepts: [],
  meaningPreserved: true,
  ...over,
});

describe("readability check", () => {
  it("rejects sentences that run too long", () => {
    const long = `${Array.from({ length: 40 }, () => "word").join(" ")}.`;
    expect(isReadable(long)).toBe(false);
  });

  it("accepts short plain sentences", () => {
    expect(isReadable("Potassium leaves the cell. Sodium stays outside.")).toBe(
      true,
    );
  });
});

describe("new-claim check", () => {
  it("flags a number the source never contained", () => {
    expect(
      findNewClaims("aspirin reduces risk", "aspirin cuts risk by 40%"),
    ).toEqual(["40"]);
  });

  it("passes when every figure traces back to the source", () => {
    expect(findNewClaims("risk fell by 40%", "risk fell about 40%")).toEqual(
      [],
    );
  });
});

describe("explainer policy", () => {
  const policy = (explain = vi.fn(async () => thought())) =>
    createExplainerPolicy({ explain });

  it("decomposes a failing concept instead of rewording it", () => {
    const p = policy();
    let state = p.init("ion selectivity");

    state = p.observe(
      state,
      [],
      thought({
        // Unreadable, so the rubric must fail regardless of the model's claim.
        text: `${Array.from({ length: 40 }, () => "word").join(" ")}.`,
        subConcepts: ["coordination geometry", "hydration shell"],
        meaningPreserved: true,
      }),
    );

    const root = state.concepts.find((c) => c.id === "c0");
    expect(root?.status).toBe("decomposed");
    const children = state.concepts.filter((c) => c.parentId === "c0");
    expect(children.map((c) => c.term)).toEqual([
      "coordination geometry",
      "hydration shell",
    ]);
    expect(children.every((c) => c.status === "pending")).toBe(true);
  });

  it("lets the deterministic checks veto a model that claims success", () => {
    const p = policy();
    let state = p.init("aspirin lowers risk");

    state = p.observe(
      state,
      [],
      thought({
        text: "Aspirin lowers risk by 40%.",
        meaningPreserved: true,
        subConcepts: ["aspirin"],
      }),
    );

    const root = state.concepts.find((c) => c.id === "c0");
    expect(root?.status).not.toBe("passed");
    expect(root?.issues.join(" ")).toMatch(/40/);
  });

  it("marks a concept failed rather than decomposing past the depth cap", () => {
    const p = createExplainerPolicy({ explain: vi.fn(), maxDepth: 0 });
    let state = p.init("ion selectivity");

    state = p.observe(
      state,
      [],
      thought({
        text: `${Array.from({ length: 40 }, () => "word").join(" ")}.`,
        subConcepts: ["something"],
      }),
    );

    const root = state.concepts.find((c) => c.id === "c0");
    expect(root?.status).toBe("failed");
    expect(state.concepts.filter((c) => c.parentId === "c0")).toHaveLength(0);
  });

  it("works depth-first on the deepest pending concept", async () => {
    const seen: Concept[] = [];
    const p = createExplainerPolicy({
      explain: async (concept) => {
        seen.push(concept);
        return thought();
      },
    });
    let state = p.init("root");
    state = p.observe(
      state,
      [],
      thought({ text: "x".repeat(400), subConcepts: ["child"] }),
    );

    await p.plan(state, new AbortController().signal);

    expect(seen[0]?.term).toBe("child");
    expect(seen[0]?.depth).toBe(1);
  });

  it("is satisfied only once nothing is pending", async () => {
    const p = policy();
    const signal = new AbortController().signal;
    let state = p.init("potassium channel");
    expect((await p.critique(state, signal)).satisfied).toBe(false);

    state = p.observe(state, [], thought({ text: "Clear and short." }));

    expect(state.concepts.find((c) => c.id === "c0")?.status).toBe("passed");
    expect((await p.critique(state, signal)).satisfied).toBe(true);
  });

  it("reports unresolved concepts as open questions", async () => {
    const p = createExplainerPolicy({ explain: vi.fn(), maxDepth: 0 });
    let state = p.init("ion selectivity");
    state = p.observe(
      state,
      [],
      thought({ text: "risk fell by 40%", subConcepts: [] }),
    );

    const critique = await p.critique(state, new AbortController().signal);

    expect(critique.satisfied).toBe(true);
    expect(critique.openQuestions.join(" ")).toMatch(/40/);
  });

  it("runs end to end and stops when every leaf passes", async () => {
    const run = await runAgent({
      policy: createExplainerPolicy({
        explain: async (concept) =>
          thought({ conceptId: concept.id, text: "Clear and short." }),
      }),
      goal: "potassium selectivity",
      runTools: noResults,
    });

    expect(run.outcome).toBe("satisfied");
    expect(run.state.concepts.every((c) => c.status === "passed")).toBe(true);
  });
});
