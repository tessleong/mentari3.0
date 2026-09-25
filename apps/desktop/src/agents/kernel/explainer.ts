import type { AgentPolicy, Budget, ToolResult } from "./types";

export const LOOKUP_TOOL = "lookup_term";

/** Past this, a sentence stops being a plain-language explanation. */
const MAX_WORDS_PER_SENTENCE = 22;
/** Swapping one long word for another is the classic non-explanation. */
const MAX_LONG_WORD_RATIO = 0.25;
const LONG_WORD_LENGTH = 12;
const NUMBER = /\d+(?:\.\d+)?/g;

export type ConceptStatus = "pending" | "passed" | "decomposed" | "failed";

export type Concept = {
  id: string;
  term: string;
  depth: number;
  parentId: string | null;
  status: ConceptStatus;
  text?: string;
  definition?: string;
  issues: string[];
};

export type ExplainerState = {
  source: string;
  concepts: Concept[];
  maxDepth: number;
  rounds: number;
};

export type ExplainerThought = {
  conceptId: string;
  text: string;
  /** Simpler pieces to fall back on when the explanation does not pass. */
  subConcepts: string[];
  /** The model's own claim. It can fail a leaf but never pass one alone. */
  meaningPreserved: boolean;
};

const defaultBudget: Budget = {
  maxRounds: 12,
  maxWallClockMs: 90_000,
  maxTokens: 40_000,
};

/** Words per sentence and long-word density, both computed here rather than
 * asked of a model, so "explain it simply" is enforced instead of requested. */
export function isReadable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const sentences = trimmed.split(/[.!?]+/).filter((part) => part.trim());
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const wordsPerSentence = words.length / Math.max(1, sentences.length);
  const long = words.filter(
    (word) => word.replace(/[^A-Za-z-]/g, "").length > LONG_WORD_LENGTH,
  ).length;
  return (
    wordsPerSentence <= MAX_WORDS_PER_SENTENCE &&
    long / words.length <= MAX_LONG_WORD_RATIO
  );
}

/** Figures that appear in an explanation but nowhere in the passage it came
 * from. Simplifying must not invent numbers. */
export function findNewClaims(source: string, text: string): string[] {
  const known = new Set(source.match(NUMBER) ?? []);
  const invented: string[] = [];
  for (const figure of text.match(NUMBER) ?? [])
    if (!known.has(figure) && !invented.includes(figure)) invented.push(figure);
  return invented;
}

/**
 * Depth-first decomposition behind a rubric gate.
 *
 * A concept passes only when all three checks agree: it reads plainly
 * (deterministic), it invents no figures (deterministic), and the model judges
 * meaning preserved. The first two are code, so a confident model cannot talk
 * its way past them.
 *
 * A concept that fails is broken into simpler pieces rather than reworded —
 * rewording the same idea is what produces explanations that sound clearer
 * without being clearer.
 */
export function createExplainerPolicy({
  explain,
  maxDepth = 2,
  budget = defaultBudget,
}: {
  explain: (
    concept: Concept,
    state: ExplainerState,
    signal: AbortSignal,
  ) => Promise<ExplainerThought>;
  maxDepth?: number;
  budget?: Budget;
}): AgentPolicy<ExplainerState, ExplainerThought> {
  return {
    role: "explainer",
    budget,

    init: (goal) => ({
      source: goal,
      maxDepth,
      rounds: 0,
      concepts: [
        {
          id: "c0",
          term: goal,
          depth: 0,
          parentId: null,
          status: "pending",
          issues: [],
        },
      ],
    }),

    plan: async (state, signal) => {
      const target = deepestPending(state);
      if (!target)
        return {
          conceptId: "",
          text: "",
          subConcepts: [],
          meaningPreserved: true,
        };
      return explain(target, state, signal);
    },

    act: (state, thought) => {
      const concept = state.concepts.find((c) => c.id === thought.conceptId);
      // Ground the term once; the definition informs later rounds if this
      // concept has to be broken down further.
      if (!concept || concept.definition) return [];
      return [
        {
          tool: LOOKUP_TOOL,
          input: concept.term,
          requiresNetwork: true,
          containsPhi: false,
        },
      ];
    },

    observe: (state, results, thought) => {
      const rounds = state.rounds + 1;
      const index = state.concepts.findIndex((c) => c.id === thought.conceptId);
      if (index < 0) return { ...state, rounds };

      const target = state.concepts[index]!;
      const issues = gradeExplanation(state.source, thought);
      const definition = readDefinition(results) ?? target.definition;

      const concepts = [...state.concepts];
      if (issues.length === 0) {
        concepts[index] = {
          ...target,
          status: "passed",
          text: thought.text,
          definition,
          issues: [],
        };
        return { ...state, concepts, rounds };
      }

      const canDecompose =
        target.depth < state.maxDepth && thought.subConcepts.length > 0;
      concepts[index] = {
        ...target,
        status: canDecompose ? "decomposed" : "failed",
        text: thought.text,
        definition,
        issues,
      };
      if (canDecompose)
        concepts.push(
          ...thought.subConcepts.map((term, order) => ({
            id: `${target.id}.${order}`,
            term,
            depth: target.depth + 1,
            parentId: target.id,
            status: "pending" as const,
            issues: [],
          })),
        );
      return { ...state, concepts, rounds };
    },

    critique: async (state) => {
      const pending = state.concepts.filter((c) => c.status === "pending");
      const unresolved = state.concepts.filter((c) => c.status === "failed");
      return {
        satisfied: pending.length === 0,
        openQuestions: unresolved.map(
          (concept) => `${concept.term}: ${concept.issues.join(" ")}`,
        ),
      };
    },

    replanWithoutNetwork: () => [],

    describeThought: (thought) =>
      thought.conceptId ? `Explaining ${thought.conceptId}` : "Nothing pending",
  };
}

function deepestPending(state: ExplainerState): Concept | undefined {
  let best: Concept | undefined;
  for (const concept of state.concepts) {
    if (concept.status !== "pending") continue;
    if (!best || concept.depth > best.depth) best = concept;
  }
  return best;
}

function gradeExplanation(source: string, thought: ExplainerThought): string[] {
  const issues: string[] = [];
  if (!isReadable(thought.text)) issues.push("Too dense to read plainly.");
  const invented = findNewClaims(source, thought.text);
  if (invented.length > 0)
    issues.push(
      `Introduces figures absent from the source: ${invented.join(", ")}.`,
    );
  if (!thought.meaningPreserved)
    issues.push("Meaning drifted from the source.");
  return issues;
}

function readDefinition(results: ToolResult[]): string | undefined {
  for (const result of results) {
    if (!result.ok) continue;
    if (typeof result.output === "string" && result.output.trim())
      return result.output;
  }
  return undefined;
}
