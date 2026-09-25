import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  model: { modelId: "test" },
  generateText: vi.fn(),
  prefetchQuery: vi.fn(),
  live: { sessionId: "note-a" },
  liveSegments: [] as { text: string }[],
}));
vi.mock("~/ai/hooks/useLLMConnection", () => ({
  useLanguageModel: () => mocks.model,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ prefetchQuery: mocks.prefetchQuery }),
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("~/clinical/repository", () => ({ searchClinicalEvidence: vi.fn() }));
vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: { getState: () => mocks },
}));

import { ScribeRuntime, useScribe } from "./scribe";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.live.sessionId = "note-a";
  mocks.liveSegments = [
    {
      text: "The speaker discussed hypertension and said they will schedule a follow-up appointment next Tuesday.",
    },
  ];
  mocks.generateText.mockResolvedValue({
    text: JSON.stringify({
      keywords: ["hypertension"],
      memories: ["The speaker discussed hypertension."],
      todos: ["Schedule a follow-up appointment next Tuesday."],
    }),
  });
  mocks.prefetchQuery.mockResolvedValue(undefined);
  useScribe.setState({ activeSessionId: null, memory: {}, status: "Paused" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("does not process a transcript until Scribe is started", async () => {
  render(<ScribeRuntime />);
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.generateText).not.toHaveBeenCalled();
});

it("updates draft memory before recording ends and prepares research only once", async () => {
  useScribe.getState().start("note-a");
  render(<ScribeRuntime />);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(useScribe.getState().memory["note-a"].keywords).toEqual([
    "hypertension",
  ]);
  expect(mocks.prefetchQuery).toHaveBeenCalledOnce();
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.generateText).toHaveBeenCalledOnce();
});

it("never reads another session's live transcript", async () => {
  useScribe.getState().start("note-b");
  render(<ScribeRuntime />);
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.generateText).not.toHaveBeenCalled();
});

it("pausing aborts generation and ignores a late response", async () => {
  let resolve!: (value: { text: string }) => void;
  mocks.generateText.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  useScribe.getState().start("note-a");
  render(<ScribeRuntime />);
  await act(async () => useScribe.getState().stop());
  expect(mocks.generateText.mock.calls[0][0].abortSignal.aborted).toBe(true);
  await act(async () =>
    resolve({
      text: JSON.stringify({ keywords: [], memories: ["late"], todos: [] }),
    }),
  );
  expect(useScribe.getState().memory).toEqual({});
});

it("rejects malformed model output without creating memories or repeated retries", async () => {
  mocks.generateText.mockResolvedValue({ text: "not JSON" });
  useScribe.getState().start("note-a");
  render(<ScribeRuntime />);
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(useScribe.getState().activeSessionId).toBeNull();
  expect(useScribe.getState().memory).toEqual({});
  expect(mocks.generateText).toHaveBeenCalledOnce();
});
