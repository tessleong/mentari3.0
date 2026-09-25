import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeTransaction: vi.fn(
    (_statements: Array<{ sql: string; params: unknown[] }>) =>
      Promise.resolve([1]),
  ),
}));

vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
}));

import { recordDiarizationFeedback } from "./diarization-feedback";

describe("recordDiarizationFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a positive rating with no reason", async () => {
    await recordDiarizationFeedback({
      sessionId: "session-1",
      rating: "positive",
    });

    const statement = mocks.executeTransaction.mock.calls[0][0][0];
    expect(statement.sql).toContain("INSERT INTO diarization_feedback");
    expect(statement.params).toEqual([
      expect.any(String),
      "session-1",
      "",
      "",
      "",
      "positive",
      "",
    ]);
  });

  it("inserts a negative rating with a reason, provider, and speaker mode", async () => {
    await recordDiarizationFeedback({
      sessionId: "session-1",
      rating: "negative",
      reason: "wrong_speaker",
      provider: "soniqo",
      modelVersion: "community1-v1",
      speakerMode: "exact_2",
    });

    const statement = mocks.executeTransaction.mock.calls[0][0][0];
    expect(statement.params).toEqual([
      expect.any(String),
      "session-1",
      "soniqo",
      "community1-v1",
      "exact_2",
      "negative",
      "wrong_speaker",
    ]);
  });
});
