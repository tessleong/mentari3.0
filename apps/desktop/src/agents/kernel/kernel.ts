import type {
  AgentPolicy,
  AgentRun,
  AgentStep,
  AgentStepKind,
  BudgetUsage,
  ToolCall,
  ToolResult,
  ToolRunner,
} from "./types";

const emptyUsage = (): BudgetUsage => ({
  rounds: 0,
  elapsedMs: 0,
  tokens: 0,
});

/**
 * Runs one agent to a stopping point.
 *
 * The loop exits normally only when the policy's own critique reports
 * satisfaction. The budget is a backstop: hitting it pauses the run and hands
 * back the state and open questions gathered so far, so a pause can be resumed
 * by passing `initialState`/`initialUsage` back in with a larger budget. No
 * outcome discards work.
 *
 * `runTools` must return one result per call, in order.
 */
export async function runAgent<TState, TThought>({
  policy,
  goal,
  runTools,
  signal,
  onStep,
  now = () => Date.now(),
  initialState,
  initialUsage,
}: {
  policy: AgentPolicy<TState, TThought>;
  goal: string;
  runTools: ToolRunner;
  signal?: AbortSignal;
  onStep?: (step: AgentStep) => void;
  now?: () => number;
  initialState?: TState;
  initialUsage?: BudgetUsage;
}): Promise<AgentRun<TState>> {
  const abort = signal ?? new AbortController().signal;
  const startedAt = now();
  const carried = initialUsage ?? emptyUsage();
  const usage: BudgetUsage = { ...carried };

  let state = initialState ?? policy.init(goal);
  const steps: AgentStep[] = [];
  let openQuestions: string[] = [];

  const emit = (kind: AgentStepKind, round: number, summary: string) => {
    const step: AgentStep = { kind, round, summary, at: now() };
    steps.push(step);
    onStep?.(step);
  };

  const settle = (
    outcome: AgentRun<TState>["outcome"],
    error?: string,
  ): AgentRun<TState> => ({
    outcome,
    state,
    steps,
    usage,
    openQuestions,
    error,
  });

  try {
    for (;;) {
      if (abort.aborted) return settle("aborted");
      const round = usage.rounds + 1;

      const thought = await policy.plan(state, abort);
      emit(
        "think",
        round,
        policy.describeThought?.(thought) ?? `Round ${round}`,
      );
      if (abort.aborted) return settle("aborted");

      const calls = policy.act(state, thought);
      emit("act", round, summariseCalls(calls));

      let results = withCalls(await runTools(calls, abort), calls);
      if (abort.aborted) return settle("aborted");

      // A PHI-blocked call is a routing decision, not an error. Give the policy
      // one chance per round to reach the same goal with local sources.
      const blocked = calls.filter((_, index) => results[index]?.blocked);
      if (blocked.length > 0 && policy.replanWithoutNetwork) {
        const local = policy.replanWithoutNetwork(state, blocked);
        if (local.length > 0) {
          emit("act", round, `${blocked.length} blocked, replanning locally`);
          results = [
            ...results,
            ...withCalls(await runTools(local, abort), local),
          ];
          if (abort.aborted) return settle("aborted");
        }
      }

      state = policy.observe(state, results, thought);
      emit("observe", round, summariseResults(results));

      const critique = await policy.critique(state, abort);
      if (abort.aborted) return settle("aborted");

      usage.rounds = round;
      usage.tokens += critique.tokensUsed ?? 0;
      usage.elapsedMs = carried.elapsedMs + (now() - startedAt);
      openQuestions = critique.openQuestions;
      emit("critique", round, critique.note ?? describeCritique(critique));

      if (critique.satisfied) return settle("satisfied");
      if (
        usage.rounds >= policy.budget.maxRounds ||
        usage.tokens >= policy.budget.maxTokens ||
        usage.elapsedMs >= policy.budget.maxWallClockMs
      )
        return settle("budget_paused");
    }
  } catch (error) {
    return settle(
      "failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Results come back positionally; attach each call so policies can read it. */
function withCalls(results: ToolResult[], calls: ToolCall[]): ToolResult[] {
  return results.map((result, index) =>
    result.call ? result : { ...result, call: calls[index] },
  );
}

function summariseCalls(calls: ToolCall[]) {
  if (calls.length === 0) return "No tool calls";
  return calls.map((call) => call.tool).join(", ");
}

function summariseResults(results: ToolResult[]) {
  const ok = results.filter((result) => result.ok).length;
  const blocked = results.filter((result) => result.blocked).length;
  const failed = results.length - ok - blocked;
  const parts = [`${ok} ok`];
  if (blocked > 0) parts.push(`${blocked} blocked`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(", ");
}

function describeCritique(critique: {
  satisfied: boolean;
  openQuestions: string[];
}) {
  if (critique.satisfied) return "Goal met";
  const count = critique.openQuestions.length;
  return count > 0 ? `${count} open question(s)` : "Not yet satisfied";
}
