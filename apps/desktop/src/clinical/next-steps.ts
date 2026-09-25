import type { EncounterSegment } from "./encounter-retrieval";

export type NextStepCategory =
  | "medication_change"
  | "labs"
  | "imaging"
  | "referral"
  | "follow_up"
  | "warning_sign";

export type NextStep = {
  category: NextStepCategory;
  description: string;
  sourceSegmentId: string;
  speaker: string;
  startMs: number;
  endMs: number;
};

type CategoryMatcher = {
  category: NextStepCategory;
  matches: (sentence: string) => boolean;
};

const IMAGING_NOUN = /\b(ct|mri|x-?ray|ultrasound|scan|imaging)\b/i;
const IMAGING_VERB = /\b(repeat|order|schedule|get|do|start|recommend(ed)?)\b/i;
const LABS_NOUN = /\b(blood ?work|labs?|d-?dimer|blood test)\b/i;
const LABS_VERB = /\b(order|get|draw|repeat|check|start|recommend(ed)?)\b/i;

// Deliberately heuristic (regex over transcript sentences), not clinical
// NLP: flags plausible next-step sentences with full provenance so a
// clinician or patient can verify against the source, rather than
// asserting these as confirmed instructions. See docs/PATIENT_SIDE_
// CLINICAL_ENCOUNTER_PRODUCT_PLAN.md — a real NLP extractor is future work.
const CATEGORY_MATCHERS: CategoryMatcher[] = [
  {
    category: "warning_sign",
    matches: (sentence) =>
      /\b(go to the (er|emergency room)|seek (urgent|emergency) care|call (us|me|the office) if|come back (in|right away) if|return (to the er|right away) if)\b/i.test(
        sentence,
      ),
  },
  {
    category: "referral",
    matches: (sentence) =>
      /\b(refer(ring)? you to|send(ing)? you to (a|an)|see a specialist|going to refer you)\b/i.test(
        sentence,
      ),
  },
  {
    category: "imaging",
    matches: (sentence) =>
      IMAGING_VERB.test(sentence) && IMAGING_NOUN.test(sentence),
  },
  {
    category: "labs",
    matches: (sentence) => LABS_VERB.test(sentence) && LABS_NOUN.test(sentence),
  },
  {
    category: "medication_change",
    matches: (sentence) =>
      /\b(start(ing)? taking|stop(ping)? taking|continue (taking|your|current)|increase (the|your) dose|decrease (the|your) dose|switch(ing)? (you )?to)\b/i.test(
        sentence,
      ),
  },
  {
    category: "follow_up",
    matches: (sentence) =>
      /\b(follow(\s|-)?up|come back in|see you (again )?in|I'?d like to see you)\b/i.test(
        sentence,
      ),
  },
];

export function extractNextSteps(segments: EncounterSegment[]): NextStep[] {
  return segments.flatMap((segment) => {
    const sentences = splitSentences(segment.text);
    return sentences.flatMap((sentence) => {
      const category = CATEGORY_MATCHERS.find(({ matches }) =>
        matches(sentence),
      )?.category;
      if (!category) return [];

      return [
        {
          category,
          description: sentence.trim(),
          sourceSegmentId: segment.segmentId,
          speaker: segment.speaker,
          startMs: segment.startMs,
          endMs: segment.endMs,
        },
      ];
    });
  });
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
