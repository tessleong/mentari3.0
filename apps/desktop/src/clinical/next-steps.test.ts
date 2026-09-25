import { describe, expect, it } from "vitest";

import type { EncounterSegment } from "./encounter-retrieval";
import { extractNextSteps } from "./next-steps";

function segment(overrides: Partial<EncounterSegment> = {}): EncounterSegment {
  return {
    segmentId: "seg-1",
    speaker: "Doctor",
    startMs: 0,
    endMs: 1000,
    text: "",
    ...overrides,
  };
}

describe("extractNextSteps", () => {
  it("flags an imaging next step", () => {
    const steps = extractNextSteps([
      segment({ text: "I'd like to repeat the CT in about six months." }),
    ]);

    expect(steps).toEqual([
      expect.objectContaining({
        category: "imaging",
        description: "I'd like to repeat the CT in about six months.",
        sourceSegmentId: "seg-1",
        speaker: "Doctor",
      }),
    ]);
  });

  it("flags a labs next step", () => {
    const steps = extractNextSteps([
      segment({ text: "We may start with a D-dimer depending on your risk." }),
    ]);

    expect(steps[0]!.category).toBe("labs");
  });

  it("flags a follow-up next step", () => {
    const steps = extractNextSteps([
      segment({ text: "Let's schedule a follow-up in six months." }),
    ]);

    expect(steps[0]!.category).toBe("follow_up");
  });

  it("flags a medication-change next step", () => {
    const steps = extractNextSteps([
      segment({ text: "Continue current medication." }),
    ]);

    expect(steps[0]!.category).toBe("medication_change");
  });

  it("flags a referral next step", () => {
    const steps = extractNextSteps([
      segment({ text: "I'm referring you to a cardiologist." }),
    ]);

    expect(steps[0]!.category).toBe("referral");
  });

  it("flags a warning-sign next step", () => {
    const steps = extractNextSteps([
      segment({
        text: "Go to the ER if you develop sudden chest pain or shortness of breath.",
      }),
    ]);

    expect(steps[0]!.category).toBe("warning_sign");
  });

  it("preserves provenance across multiple sentences and segments", () => {
    const steps = extractNextSteps([
      segment({
        segmentId: "seg-1",
        speaker: "Patient",
        startMs: 0,
        endMs: 5000,
        text: "The pain started Monday. Nothing else to report.",
      }),
      segment({
        segmentId: "seg-2",
        speaker: "Doctor",
        startMs: 5000,
        endMs: 12_000,
        text: "Let's order a D-dimer. I'd also like to see you again in two weeks.",
      }),
    ]);

    expect(steps).toEqual([
      expect.objectContaining({
        category: "labs",
        description: "Let's order a D-dimer.",
        sourceSegmentId: "seg-2",
        speaker: "Doctor",
        startMs: 5000,
        endMs: 12_000,
      }),
      expect.objectContaining({
        category: "follow_up",
        description: "I'd also like to see you again in two weeks.",
        sourceSegmentId: "seg-2",
      }),
    ]);
  });

  it("does not flag ordinary conversation with no next-step language", () => {
    const steps = extractNextSteps([
      segment({ text: "How has your week been? That's good to hear." }),
    ]);

    expect(steps).toEqual([]);
  });

  it("returns an empty list for an empty transcript", () => {
    expect(extractNextSteps([])).toEqual([]);
  });
});
