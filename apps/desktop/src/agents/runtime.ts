import type { LanguageModelV3 } from "@ai-sdk/provider";

import { createExplain, createExtract, createProposeQueries } from "./adapters";
import { createExplainerPolicy, type ExplainerState } from "./kernel/explainer";
import { runAgent } from "./kernel/kernel";
import { createResearchPolicy, type ResearchState } from "./kernel/research";
import { createScribePolicy, type ScribeState } from "./kernel/scribe-policy";
import type { AgentPolicy, AgentRun, Budget, ToolRunner } from "./kernel/types";
import { useAgentPanels } from "./panels";
import type { AgentRole } from "./personality";

/** Builds the policy for one role, wiring its model-backed step to an adapter.
 * The adapters are the only place a model is called. */
export function buildPolicy(
  role: AgentRole,
  model: LanguageModelV3,
  readTranscript: (sessionId: string) => string,
  budget?: Budget,
  // The three policies have different state and thought types by design, so the
  // caller erases them here rather than forcing one shape onto all three.
): AgentPolicy<never, never> {
  const policy =
    role === "research"
      ? createResearchPolicy({
          proposeQueries: createProposeQueries(model),
          ...(budget ? { budget } : {}),
        })
      : role === "explainer"
        ? createExplainerPolicy({
            explain: createExplain(model),
            ...(budget ? { budget } : {}),
          })
        : createScribePolicy({
            readTranscript,
            extract: createExtract(model),
            ...(budget ? { budget } : {}),
          });
  return policy as unknown as AgentPolicy<never, never>;
}

/** Turns a finished run's state into the prose the panel shows. Each role
 * reports what it actually established, not a generic summary. */
export function describeAnswer(role: AgentRole, state: unknown): string {
  if (role === "research") {
    const { evidence } = state as ResearchState;
    if (evidence.length === 0)
      return "No matching publications found. Try a more specific scientific term.";
    const supports = evidence.filter(
      (item) => item.stance === "supports",
    ).length;
    const refutes = evidence.filter((item) => item.stance === "refutes").length;
    const parts = [`${evidence.length} source(s) verified`];
    if (supports > 0) parts.push(`${supports} supporting`);
    if (refutes > 0) parts.push(`${refutes} refuting`);
    return parts.join(", ");
  }

  if (role === "explainer") {
    const { concepts } = state as ExplainerState;
    const passed = concepts
      .filter((concept) => concept.status === "passed" && concept.text)
      .map((concept) => concept.text);
    return passed.length > 0
      ? passed.join("\n\n")
      : "Could not explain this passage plainly yet.";
  }

  const { memory } = state as ScribeState;
  const lines = [
    ...memory.memories,
    ...memory.todos.map((todo) => `To do: ${todo}`),
  ];
  return lines.length > 0 ? lines.join("\n") : "Nothing captured yet.";
}

/**
 * Runs one agent and reports its progress into the panel store.
 *
 * Everything the run depends on is injected, so the whole loop is exercised in
 * tests with a fake model and fake tools. The panel is updated as steps happen
 * rather than only at the end, which is what makes the reasoning visible.
 */
export async function startAgentRun({
  role,
  goal,
  model,
  runTools,
  readTranscript,
  budget,
  signal,
}: {
  role: AgentRole;
  goal: string;
  model: LanguageModelV3;
  runTools: ToolRunner;
  readTranscript: (sessionId: string) => string;
  budget?: Budget;
  signal?: AbortSignal;
}): Promise<AgentRun<unknown>> {
  const panels = useAgentPanels.getState();
  const controller = new AbortController();
  // The panel's Stop button and any caller-supplied signal both end the run.
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  panels.setControls(role, {
    stop: () => controller.abort(),
    keepGoing: () => {
      void startAgentRun({
        role,
        goal,
        model,
        runTools,
        readTranscript,
        // Resuming means giving the same agent more room, not a fresh start.
        budget: widen(budget),
      });
    },
  });

  const run = await runAgent({
    policy: buildPolicy(role, model, readTranscript, budget),
    goal,
    runTools,
    signal: controller.signal,
    onStep: (step) => useAgentPanels.getState().appendStep(role, step),
  });

  const current = useAgentPanels.getState().runs[role];
  useAgentPanels.getState().setRun(role, {
    goal,
    outcome: run.outcome,
    steps: current?.steps ?? run.steps,
    openQuestions: run.openQuestions,
    answer:
      run.outcome === "failed"
        ? (run.error ?? "The agent could not finish.")
        : describeAnswer(role, run.state),
  });

  return run;
}

const DEFAULT_BUDGET: Budget = {
  maxRounds: 12,
  maxWallClockMs: 90_000,
  maxTokens: 40_000,
};

function widen(budget: Budget | undefined): Budget {
  const base = budget ?? DEFAULT_BUDGET;
  return {
    maxRounds: base.maxRounds * 2,
    maxWallClockMs: base.maxWallClockMs * 2,
    maxTokens: base.maxTokens * 2,
  };
}
