import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  proposeQueries: vi.fn(),
  explain: vi.fn(),
  extract: vi.fn(),
}));

vi.mock("./adapters", () => ({
  createProposeQueries: () => mocks.proposeQueries,
  createExplain: () => mocks.explain,
  createExtract: () => mocks.extract,
}));

import type { ToolCall, ToolResult } from "./kernel/types";
import { useAgentPanels } from "./panels";
import { buildPolicy, describeAnswer, startAgentRun } from "./runtime";

const model = {} as never;

const okRunner = async (calls: ToolCall[]): Promise<ToolResult[]> =>
  calls.map((call) => ({ tool: call.tool, call, ok: true, output: [] }));

beforeEach(() => {
  useAgentPanels.setState({ order: [], runs: {}, controls: {} });
  mocks.proposeQueries.mockReset();
  mocks.explain.mockReset();
  mocks.extract.mockReset();
  mocks.proposeQueries.mockResolvedValue({ queries: [], leading: "x" });
  mocks.explain.mockResolvedValue({
    conceptId: "c0",
    text: "Short and clear.",
    subConcepts: [],
    meaningPreserved: true,
  });
  mocks.extract.mockResolvedValue({ keywords: [], memories: [], todos: [] });
});

describe("buildPolicy", () => {
  it("gives each role its own policy", () => {
    expect(buildPolicy("research", model, () => "").role).toBe("research");
    expect(buildPolicy("explainer", model, () => "").role).toBe("explainer");
    expect(buildPolicy("scribe", model, () => "").role).toBe("scribe");
  });

  it("reads the transcript through the supplied reader for scribe", () => {
    const readTranscript = vi.fn(() => "transcript text");
    const policy = buildPolicy("scribe", model, readTranscript);

    void policy.plan(policy.init("session-1"), new AbortController().signal);

    expect(readTranscript).toHaveBeenCalledWith("session-1");
  });
});

describe("describeAnswer", () => {
  it("summarises research by what it verified and what still conflicts", () => {
    const answer = describeAnswer("research", {
      evidence: [
        { id: "1", title: "A", excerpt: "", stance: "supports" },
        { id: "2", title: "B", excerpt: "", stance: "refutes" },
      ],
    } as never);

    expect(answer).toMatch(/2 source/i);
    expect(answer).toMatch(/1 support/i);
    expect(answer).toMatch(/1 refut/i);
  });

  it("joins the explainer's passing leaves in order", () => {
    const answer = describeAnswer("explainer", {
      concepts: [
        { id: "c0", status: "decomposed", text: "ignored" },
        { id: "c0.0", status: "passed", text: "First part." },
        { id: "c0.1", status: "passed", text: "Second part." },
      ],
    } as never);

    expect(answer).toBe("First part.\n\nSecond part.");
  });

  it("reports the scribe's running memory", () => {
    const answer = describeAnswer("scribe", {
      memory: { keywords: ["sepsis"], memories: ["A fact."], todos: [] },
    } as never);

    expect(answer).toMatch(/A fact\./);
  });
});

describe("startAgentRun", () => {
  it("streams each step into the panel as it happens", async () => {
    await startAgentRun({
      role: "research",
      goal: "a claim",
      model,
      runTools: okRunner,
      readTranscript: () => "",
    });

    const steps = useAgentPanels.getState().runs.research?.steps ?? [];
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]?.kind).toBe("think");
  });

  it("records the outcome and the answer when it finishes", async () => {
    await startAgentRun({
      role: "research",
      goal: "a claim",
      model,
      runTools: okRunner,
      readTranscript: () => "",
    });

    const run = useAgentPanels.getState().runs.research;
    expect(run?.outcome).toBe("satisfied");
    expect(run?.answer).toBeTruthy();
  });

  it("registers controls so a paused run can be resumed or stopped", async () => {
    await startAgentRun({
      role: "research",
      goal: "a claim",
      model,
      runTools: okRunner,
      readTranscript: () => "",
    });

    const controls = useAgentPanels.getState().controls.research;
    expect(typeof controls?.keepGoing).toBe("function");
    expect(typeof controls?.stop).toBe("function");
  });

  it("surfaces open questions when the budget pauses the run", async () => {
    // Never satisfied: each round proposes an unseen query that finds an unseen
    // source, so the search keeps expanding and never saturates.
    let id = 0;
    mocks.proposeQueries.mockImplementation(async () => ({
      queries: [`query-${id}`],
      leading: "x",
    }));
    const run = await startAgentRun({
      role: "research",
      goal: "a claim",
      model,
      budget: { maxRounds: 2, maxWallClockMs: 60_000, maxTokens: 40_000 },
      runTools: async (calls) =>
        calls.map((call) => ({
          tool: call.tool,
          call,
          ok: true,
          output: [
            { id: `s${id++}`, title: "t", excerpt: "", stance: "supports" },
          ],
        })),
      readTranscript: () => "",
    });

    expect(run.outcome).toBe("budget_paused");
    expect(useAgentPanels.getState().runs.research?.outcome).toBe(
      "budget_paused",
    );
  });

  it("reports a failing model as a failed run rather than throwing", async () => {
    mocks.proposeQueries.mockRejectedValue(new Error("no model configured"));

    const run = await startAgentRun({
      role: "research",
      goal: "a claim",
      model,
      runTools: okRunner,
      readTranscript: () => "",
    });

    expect(run.outcome).toBe("failed");
    expect(useAgentPanels.getState().runs.research?.answer).toMatch(
      /no model configured/,
    );
  });

  it("stops a run when the panel's stop control is used", async () => {
    const controller = new AbortController();
    const run = await startAgentRun({
      role: "research",
      goal: "a claim",
      model,
      signal: controller.signal,
      runTools: async (calls) => {
        controller.abort();
        return okRunner(calls);
      },
      readTranscript: () => "",
    });

    expect(run.outcome).toBe("aborted");
  });
});
