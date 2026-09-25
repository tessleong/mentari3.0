import { describe, expect, it, vi } from "vitest";

import { runAgent } from "./kernel";
import {
  createScribePolicy,
  mergeMemory,
  PREFETCH_TOOL,
  transcriptDelta,
} from "./scribe-policy";
import type { ScribeThought } from "./scribe-policy";
import type { ToolCall, ToolResult } from "./types";

const empty = { keywords: [], memories: [], todos: [] };

const okRunner = async (calls: ToolCall[]): Promise<ToolResult[]> =>
  calls.map((call) => ({ tool: call.tool, call, ok: true, output: null }));

const thought = (over: Partial<ScribeThought> = {}): ScribeThought => ({
  consumedTo: 0,
  extracted: empty,
  ...over,
});

describe("transcriptDelta", () => {
  it("returns only what has not been read yet", () => {
    expect(transcriptDelta("hello world", 6)).toBe("world");
  });

  it("is empty when the scribe has caught up", () => {
    expect(transcriptDelta("hello", 5)).toBe("");
  });

  it("survives a transcript that was replaced by a shorter one", () => {
    expect(transcriptDelta("short", 900)).toBe("");
  });
});

describe("mergeMemory", () => {
  it("does not repeat a fact it already holds", () => {
    const merged = mergeMemory(
      {
        keywords: ["sepsis"],
        memories: ["Patient reports chest pain."],
        todos: [],
      },
      {
        keywords: ["sepsis"],
        memories: ["Patient reports chest pain."],
        todos: [],
      },
    );

    expect(merged.memory.memories).toEqual(["Patient reports chest pain."]);
    expect(merged.memory.keywords).toEqual(["sepsis"]);
  });

  it("replaces a fact the transcript later negates", () => {
    const merged = mergeMemory(
      { ...empty, memories: ["Patient reports chest pain."] },
      { ...empty, memories: ["Patient denies chest pain."] },
    );

    expect(merged.memory.memories).toEqual(["Patient denies chest pain."]);
    expect(merged.revisions).toHaveLength(1);
  });

  it("keeps unrelated facts side by side", () => {
    const merged = mergeMemory(
      { ...empty, memories: ["Patient reports chest pain."] },
      { ...empty, memories: ["Patient takes metformin."] },
    );

    expect(merged.memory.memories).toHaveLength(2);
    expect(merged.revisions).toHaveLength(0);
  });
});

describe("scribe policy", () => {
  const transcript = "a".repeat(300);

  it("prefetches evidence for keywords it has not chased yet", () => {
    const policy = createScribePolicy({
      readTranscript: () => transcript,
      extract: vi.fn(),
    });
    let state = policy.init("session-1");

    const first = policy.act(
      state,
      thought({ extracted: { ...empty, keywords: ["sepsis", "lactate"] } }),
    );
    expect(first.map((call) => call.input)).toEqual(["sepsis", "lactate"]);
    expect(first.every((call) => call.tool === PREFETCH_TOOL)).toBe(true);

    state = policy.observe(
      state,
      [],
      thought({ extracted: { ...empty, keywords: ["sepsis", "lactate"] } }),
    );
    const second = policy.act(
      state,
      thought({ extracted: { ...empty, keywords: ["sepsis", "troponin"] } }),
    );

    // Already chased, so only the new keyword costs a request.
    expect(second.map((call) => call.input)).toEqual(["troponin"]);
  });

  it("yields once it has caught up with the transcript", async () => {
    const policy = createScribePolicy({
      readTranscript: () => transcript,
      extract: vi.fn(),
    });
    const signal = new AbortController().signal;
    let state = policy.init("session-1");

    expect((await policy.critique(state, signal)).satisfied).toBe(false);

    state = policy.observe(
      state,
      [],
      thought({ consumedTo: transcript.length }),
    );

    expect((await policy.critique(state, signal)).satisfied).toBe(true);
  });

  it("surfaces a revision as an open question", async () => {
    const policy = createScribePolicy({
      readTranscript: () => transcript,
      extract: vi.fn(),
    });
    let state = policy.init("session-1");
    state = policy.observe(
      state,
      [],
      thought({
        extracted: { ...empty, memories: ["Patient reports chest pain."] },
      }),
    );
    state = policy.observe(
      state,
      [],
      thought({
        consumedTo: transcript.length,
        extracted: { ...empty, memories: ["Patient denies chest pain."] },
      }),
    );

    const critique = await policy.critique(state, new AbortController().signal);

    expect(state.memory.memories).toEqual(["Patient denies chest pain."]);
    expect(critique.openQuestions.join(" ")).toMatch(/revis/i);
  });

  it("runs end to end and stops when caught up", async () => {
    const extract = vi.fn(async () => ({
      ...empty,
      keywords: ["sepsis"],
      memories: ["Patient reports chest pain."],
    }));
    const run = await runAgent({
      policy: createScribePolicy({ readTranscript: () => transcript, extract }),
      goal: "session-1",
      runTools: okRunner,
    });

    expect(run.outcome).toBe("satisfied");
    expect(run.state.memory.memories).toEqual(["Patient reports chest pain."]);
    expect(extract).toHaveBeenCalledTimes(1);
  });
});
