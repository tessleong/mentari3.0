import type { AgentPolicy, Budget } from "./types";

export const PREFETCH_TOOL = "prefetch_evidence";

/** Below this, a delta is mid-sentence noise rather than a new fact. */
const MIN_DELTA = 80;
const MAX_KEYWORDS = 8;
const MAX_MEMORIES = 12;
const MAX_TODOS = 8;

/** Words that carry polarity rather than content. Stripping them leaves the
 * claim itself, so "reports chest pain" and "denies chest pain" compare equal
 * in substance and differ only in sign. */
const NEGATIONS = ["denies", "deny", "denied", "no", "not", "never", "without"];
const AFFIRMATIONS = [
  "reports",
  "report",
  "reported",
  "has",
  "states",
  "confirms",
  "endorses",
];

export type ScribeMemoryDraft = {
  keywords: string[];
  memories: string[];
  todos: string[];
};

export type ScribeRevision = { from: string; to: string };

export type ScribeState = {
  sessionId: string;
  consumedLength: number;
  memory: ScribeMemoryDraft;
  prefetched: string[];
  revisions: ScribeRevision[];
  rounds: number;
};

export type ScribeThought = {
  /** How far into the transcript this round read. */
  consumedTo: number;
  extracted: ScribeMemoryDraft;
};

const defaultBudget: Budget = {
  maxRounds: 12,
  maxWallClockMs: 60_000,
  maxTokens: 40_000,
};

/** The part of the transcript not yet read. Guards against a transcript that
 * shrank (a re-run or a cleared session) rather than grew. */
export function transcriptDelta(transcript: string, consumed: number): string {
  if (consumed >= transcript.length) return "";
  return transcript.slice(Math.max(0, consumed));
}

function core(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word && !NEGATIONS.includes(word) && !AFFIRMATIONS.includes(word),
    )
    .join(" ");
}

function isNegated(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/);
  return words.some((word) => NEGATIONS.includes(word));
}

function unique(values: string[], cap: number): string[] {
  const out: string[] = [];
  for (const value of values)
    if (value && !out.includes(value) && out.length < cap) out.push(value);
  return out;
}

/**
 * Folds a new extraction into the running draft.
 *
 * A statement whose substance matches one already held, but whose polarity has
 * flipped, replaces it and is recorded as a revision — a patient who first
 * reported chest pain and later denied it must not leave both facts standing.
 */
export function mergeMemory(
  prior: ScribeMemoryDraft,
  extracted: ScribeMemoryDraft,
): { memory: ScribeMemoryDraft; revisions: ScribeRevision[] } {
  const memories = [...prior.memories];
  const revisions: ScribeRevision[] = [];

  for (const incoming of extracted.memories) {
    if (!incoming.trim()) continue;
    const key = core(incoming);
    const index = memories.findIndex((held) => core(held) === key);
    if (index < 0) {
      memories.push(incoming);
      continue;
    }
    const held = memories[index]!;
    if (held === incoming) continue;
    if (isNegated(held) !== isNegated(incoming)) {
      memories[index] = incoming;
      revisions.push({ from: held, to: incoming });
    }
  }

  return {
    memory: {
      keywords: unique(
        [...prior.keywords, ...extracted.keywords],
        MAX_KEYWORDS,
      ),
      memories: memories.slice(0, MAX_MEMORIES),
      todos: unique([...prior.todos, ...extracted.todos], MAX_TODOS),
    },
    revisions,
  };
}

/**
 * Continuous consolidation over the live transcript.
 *
 * Reads only the delta since the last round rather than re-reading the whole
 * transcript, and warms the evidence cache for each new keyword so the research
 * agent has results waiting before the encounter ends. It is "satisfied" when
 * it has caught up, which is how it yields between transcript updates.
 */
export function createScribePolicy({
  readTranscript,
  extract,
  minDelta = MIN_DELTA,
  budget = defaultBudget,
}: {
  readTranscript: (sessionId: string) => string;
  extract: (
    delta: string,
    prior: ScribeMemoryDraft,
    signal: AbortSignal,
  ) => Promise<ScribeMemoryDraft>;
  minDelta?: number;
  budget?: Budget;
}): AgentPolicy<ScribeState, ScribeThought> {
  const blank = (): ScribeMemoryDraft => ({
    keywords: [],
    memories: [],
    todos: [],
  });

  return {
    role: "scribe",
    budget,

    init: (goal) => ({
      sessionId: goal,
      consumedLength: 0,
      memory: blank(),
      prefetched: [],
      revisions: [],
      rounds: 0,
    }),

    plan: async (state, signal) => {
      const transcript = readTranscript(state.sessionId);
      const delta = transcriptDelta(transcript, state.consumedLength);
      if (delta.length < minDelta)
        return { consumedTo: transcript.length, extracted: blank() };
      return {
        consumedTo: transcript.length,
        extracted: await extract(delta, state.memory, signal),
      };
    },

    // Warm the same cache the research agent reads, so its first round starts
    // with results already in hand.
    act: (state, thought) => {
      const chased = new Set(state.prefetched);
      return thought.extracted.keywords
        .filter((keyword) => keyword && !chased.has(keyword))
        .map((keyword) => ({
          tool: PREFETCH_TOOL,
          input: keyword,
          requiresNetwork: true,
          containsPhi: false,
        }));
    },

    observe: (state, _results, thought) => {
      const { memory, revisions } = mergeMemory(
        state.memory,
        thought.extracted,
      );
      return {
        ...state,
        memory,
        revisions: [...state.revisions, ...revisions],
        prefetched: unique(
          [...state.prefetched, ...thought.extracted.keywords],
          64,
        ),
        consumedLength: Math.max(state.consumedLength, thought.consumedTo),
        rounds: state.rounds + 1,
      };
    },

    critique: async (state) => {
      const remaining = transcriptDelta(
        readTranscript(state.sessionId),
        state.consumedLength,
      );
      return {
        satisfied: remaining.length < minDelta,
        openQuestions: state.revisions.map(
          (revision) => `Revised: "${revision.from}" became "${revision.to}"`,
        ),
      };
    },

    // Prefetching is an optimisation; losing it must not stall the scribe.
    replanWithoutNetwork: () => [],

    describeThought: (thought) =>
      thought.extracted.memories.length > 0
        ? `Consolidating ${thought.extracted.memories.length} fact(s)`
        : "Waiting for new transcript",
  };
}
