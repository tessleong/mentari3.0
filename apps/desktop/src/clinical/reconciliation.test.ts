import { describe, expect, it } from "vitest";

import { reconcileEncounterEvidence } from "./reconciliation";

describe("encounter reconciliation", () => {
  it("preserves transcript history but gives an explicit clinician correction priority", () => {
    const facts = reconcileEncounterEvidence({
      transcript: [{ id: "turn-1", text: "Patient takes metoprolol 50 mg." }],
      cues: [{ id: "cue-1", text: "metoprolol 25 mg, not 50 mg" }],
    });
    const medicationFacts = facts.filter((fact) => fact.type === "medication");

    expect(
      medicationFacts.some((fact) => fact.sourceKind === "clinician_entered"),
    ).toBe(true);
    expect(medicationFacts.some((fact) => fact.conflicts.length > 0)).toBe(
      true,
    );
    expect(
      medicationFacts
        .flatMap((fact) => fact.conflicts)
        .map((conflict) => conflict.value),
    ).toContain("metoprolol 50 mg");
  });

  it("marks a transcript-only fact high confidence without claiming verification", () => {
    const [fact] = reconcileEncounterEvidence({
      transcript: [{ id: "turn-1", text: "Penicillin allergy." }],
      cues: [],
    });
    expect(fact?.confidence).toBe("high");
    expect(fact?.sourceKind).toBe("transcript_direct");
  });
});
