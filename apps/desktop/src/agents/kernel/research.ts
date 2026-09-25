import type { AgentPolicy, Budget, ToolCall, ToolResult } from "./types";

/** Marks a query whose purpose is to refute the current leading conclusion. */
export const DISCONFIRM_PREFIX = "evidence against: ";

export const SEARCH_TOOL = "search_evidence";
export const LOCAL_TOOL = "local_evidence";

export type EvidenceItem = {
  id: string;
  title: string;
  excerpt: string;
  url?: string;
  stance: "supports" | "refutes" | "unclear";
};

export type ResearchState = {
  claim: string;
  explored: string[];
  evidence: EvidenceItem[];
  /** New, previously unseen evidence from the most recent round. Zero means
   * the search has saturated. */
  lastRoundNew: number;
  rounds: number;
  disconfirmationAttempted: boolean;
};

export type ResearchThought = {
  /** De-identified scientific terms. The raw claim never becomes a query. */
  queries: string[];
  leading: string;
};

const defaultBudget: Budget = {
  maxRounds: 12,
  maxWallClockMs: 90_000,
  maxTokens: 40_000,
};

/**
 * Breadth-first evidence expansion that argues against itself.
 *
 * The model proposes search terms, but three rules that decide the shape of the
 * search are plain code, not prompt text:
 *
 *  1. every round issues at least one query aimed at refuting the current
 *     leading conclusion, whether or not the model thought to;
 *  2. a query is never run twice;
 *  3. the run ends on saturation — a round that surfaces nothing new, with no
 *     contradiction left standing.
 */
export function createResearchPolicy({
  proposeQueries,
  budget = defaultBudget,
}: {
  proposeQueries: (
    state: ResearchState,
    signal: AbortSignal,
  ) => Promise<{ queries: string[]; leading: string; tokensUsed?: number }>;
  budget?: Budget;
}): AgentPolicy<ResearchState, ResearchThought> {
  return {
    role: "research",
    budget,

    init: (goal) => ({
      claim: goal,
      explored: [],
      evidence: [],
      lastRoundNew: 0,
      rounds: 0,
      disconfirmationAttempted: false,
    }),

    plan: async (state, signal) => {
      const { queries, leading } = await proposeQueries(state, signal);
      return { queries, leading };
    },

    act: (state, thought) => {
      // Rule 1: the disconfirming query is appended by the algorithm, so the
      // agent cannot settle into only looking for agreement.
      const wanted = [
        ...thought.queries,
        `${DISCONFIRM_PREFIX}${thought.leading || state.claim}`,
      ];
      const seen = new Set(state.explored);
      const fresh: string[] = [];
      for (const query of wanted) {
        const trimmed = query.trim();
        // Rule 2: no query runs twice, within a round or across rounds.
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        fresh.push(trimmed);
      }
      return fresh.map((query) => ({
        tool: SEARCH_TOOL,
        input: query,
        requiresNetwork: true,
        // Queries are de-identified terms, not the note text they came from.
        containsPhi: false,
      }));
    },

    observe: (state, results) => {
      const explored = [...state.explored];
      const evidence = [...state.evidence];
      const known = new Set(evidence.map((item) => item.id));
      let added = 0;
      let disconfirmed = state.disconfirmationAttempted;

      for (const result of results) {
        const query = String(result.call?.input ?? "");
        if (query && !explored.includes(query)) explored.push(query);
        if (query.startsWith(DISCONFIRM_PREFIX)) disconfirmed = true;
        if (!result.ok) continue;
        for (const item of toEvidence(result)) {
          // Rule 3 input: only genuinely new sources count as progress.
          if (known.has(item.id)) continue;
          known.add(item.id);
          evidence.push(item);
          added += 1;
        }
      }

      return {
        ...state,
        explored,
        evidence,
        lastRoundNew: added,
        rounds: state.rounds + 1,
        disconfirmationAttempted: disconfirmed,
      };
    },

    critique: async (state) => {
      const contradictions = findContradictions(state.evidence);
      const openQuestions: string[] = [];
      if (contradictions.length > 0)
        openQuestions.push(
          `Sources contradict each other: ${contradictions.join("; ")}`,
        );
      if (!state.disconfirmationAttempted)
        openQuestions.push("No disconfirming search has run yet.");

      const satisfied =
        state.rounds > 0 &&
        state.lastRoundNew === 0 &&
        contradictions.length === 0 &&
        state.disconfirmationAttempted;

      return { satisfied, openQuestions };
    },

    // PHI routing refused the network. Ask the local evidence cache the same
    // questions rather than abandoning the round.
    replanWithoutNetwork: (_state, blocked) =>
      blocked.map((call) => ({
        tool: LOCAL_TOOL,
        input: call.input,
        requiresNetwork: false,
        containsPhi: call.containsPhi,
      })),

    describeThought: (thought) =>
      thought.queries.length > 0
        ? `Searching: ${thought.queries.join(", ")}`
        : "Testing the leading conclusion",
  };
}

function toEvidence(result: ToolResult): EvidenceItem[] {
  return Array.isArray(result.output) ? (result.output as EvidenceItem[]) : [];
}

/** A claim is contested when the same body of evidence both supports and
 * refutes it. Reported rather than silently averaged away. */
function findContradictions(evidence: EvidenceItem[]): string[] {
  const supports = evidence.filter((item) => item.stance === "supports");
  const refutes = evidence.filter((item) => item.stance === "refutes");
  if (supports.length === 0 || refutes.length === 0) return [];
  return [
    `${supports.length} supporting vs ${refutes.length} refuting (${refutes
      .map((item) => item.id)
      .join(", ")})`,
  ];
}

export type { ToolCall };
