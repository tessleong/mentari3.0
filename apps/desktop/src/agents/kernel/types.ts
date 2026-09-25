// The reasoning kernel deliberately keeps control flow in TypeScript. A policy
// may consult a language model inside `plan` or `critique`, but the model never
// decides whether the loop continues — `critique().satisfied` and the budget do.
// That split is what makes a run reproducible in tests with a fake model.

export type AgentStepKind = "think" | "act" | "observe" | "critique";

export type AgentStep = {
  kind: AgentStepKind;
  round: number;
  summary: string;
  at: number;
};

export type Budget = {
  maxRounds: number;
  maxWallClockMs: number;
  maxTokens: number;
};

export type BudgetUsage = {
  rounds: number;
  elapsedMs: number;
  tokens: number;
};

/** A unit of work the policy wants performed. `act` returns these; it never
 * performs I/O itself, so policies stay synchronous and testable. */
export type ToolCall = {
  tool: string;
  input: unknown;
  /** Leaves the machine. Drives the PHI routing decision in the real runner. */
  requiresNetwork: boolean;
  /** Derived from note or transcript text rather than a public source. */
  containsPhi: boolean;
};

export type ToolResult = {
  tool: string;
  /** The call this answers. The kernel backfills it by index, so policies can
   * read back what they asked without threading calls through `observe`. */
  call?: ToolCall;
  ok: boolean;
  output?: unknown;
  error?: string;
  /** Refused by PHI routing rather than failed. Policies may replan locally. */
  blocked?: boolean;
};

export type Critique = {
  /** The only normal exit. Budgets are a backstop, not a stop condition. */
  satisfied: boolean;
  /** Surfaced verbatim when a run pauses, so a pause is never a silent drop. */
  openQuestions: string[];
  note?: string;
  tokensUsed?: number;
};

export type RunOutcome = "satisfied" | "budget_paused" | "aborted" | "failed";

export type AgentPolicy<TState, TThought> = {
  role: string;
  budget: Budget;
  init(goal: string): TState;
  plan(state: TState, signal: AbortSignal): Promise<TThought>;
  act(state: TState, thought: TThought): ToolCall[];
  /** Reconciles the plan with what actually came back. Receives the thought
   * so a policy can record what it decided, not just what the tools returned. */
  observe(state: TState, results: ToolResult[], thought: TThought): TState;
  critique(state: TState, signal: AbortSignal): Promise<Critique>;
  /** Called once per round when PHI routing blocks calls, so an agent degrades
   * to local sources instead of failing. Returning [] accepts the loss. */
  replanWithoutNetwork?(state: TState, blocked: ToolCall[]): ToolCall[];
  describeThought?(thought: TThought): string;
};

export type AgentRun<TState> = {
  outcome: RunOutcome;
  state: TState;
  steps: AgentStep[];
  usage: BudgetUsage;
  openQuestions: string[];
  error?: string;
};

export type ToolRunner = (
  calls: ToolCall[],
  signal: AbortSignal,
) => Promise<ToolResult[]>;
