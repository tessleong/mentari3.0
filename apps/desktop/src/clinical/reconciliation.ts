export type ProvenanceKind =
  | "clinician_entered"
  | "transcript_direct"
  | "transcript_inferred"
  | "model_inferred"
  | "retrieved_evidence"
  | "external_record";

export type EncounterFact = {
  type: "medication" | "allergy" | "symptom_onset" | "cue";
  value: string;
  confidence: "verified" | "high" | "uncertain" | "conflicting";
  sourceKind: ProvenanceKind;
  sourceId: string;
  conflicts: EncounterConflict[];
};

export type EncounterConflict = {
  value: string;
  sourceKind: ProvenanceKind;
  sourceId: string;
  resolution: "clinician_override" | "needs_confirmation";
};

export function reconcileEncounterEvidence({
  transcript,
  cues,
}: {
  transcript: { id: string; text: string }[];
  cues: { id: string; text: string }[];
}): EncounterFact[] {
  const transcriptFacts = transcript.flatMap((turn) =>
    extractFacts(turn.text, "transcript_direct", turn.id),
  );
  const cueFacts = cues.flatMap((cue) =>
    extractFacts(cue.text, "clinician_entered", cue.id),
  );
  const grouped = new Map<string, EncounterFact[]>();
  for (const fact of [...transcriptFacts, ...cueFacts]) {
    const key = `${fact.type}:${fact.type === "medication" ? normalizeKey(fact.value.split(" ")[0] ?? fact.value) : normalizeKey(fact.value)}`;
    const list = grouped.get(key) ?? [];
    list.push(fact);
    grouped.set(key, list);
  }

  const facts = [...grouped.values()].map((values) => {
    const preferred =
      values.find((value) => value.sourceKind === "clinician_entered") ??
      values[0]!;
    const conflictingValues = [
      ...new Set(values.map((value) => value.value)),
    ].filter((value) => normalizeKey(value) !== normalizeKey(preferred.value));
    return {
      ...preferred,
      confidence:
        conflictingValues.length > 0
          ? "conflicting"
          : preferred.sourceKind === "clinician_entered"
            ? "verified"
            : "high",
      conflicts: conflictingValues.map((value) => {
        const conflict = values.find((candidate) => candidate.value === value)!;
        return {
          value,
          sourceKind: conflict.sourceKind,
          sourceId: conflict.sourceId,
          resolution:
            preferred.sourceKind === "clinician_entered"
              ? "clinician_override"
              : "needs_confirmation",
        };
      }),
    } satisfies EncounterFact;
  });

  return facts;
}

function extractFacts(
  text: string,
  sourceKind: ProvenanceKind,
  sourceId: string,
): EncounterFact[] {
  const facts: EncounterFact[] = [];
  for (const match of text.matchAll(
    /\b([a-z][a-z-]+)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b/gi,
  )) {
    facts.push({
      type: "medication",
      value: `${match[1]} ${match[2]} ${match[3]}`,
      confidence: "high",
      sourceKind,
      sourceId,
      conflicts: [],
    });
  }
  for (const match of text.matchAll(/\b([a-z][a-z -]+)\s+allergy\b/gi)) {
    facts.push({
      type: "allergy",
      value: match[1]!.trim(),
      confidence: "high",
      sourceKind,
      sourceId,
      conflicts: [],
    });
  }
  const onset = text.match(/\b(?:since|started)\s+([^,.]+)/i)?.[1]?.trim();
  if (onset) {
    facts.push({
      type: "symptom_onset",
      value: onset,
      confidence: "high",
      sourceKind,
      sourceId,
      conflicts: [],
    });
  }
  return facts;
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}
