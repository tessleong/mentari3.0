import type { StudyDesign } from "./pubmed";

export type EvidenceWeights = {
  lexical: number;
  design: number;
  recency: number;
  retraction: number;
};

export const BASELINE_EVIDENCE_WEIGHTS: EvidenceWeights = {
  lexical: 0.54,
  design: 0.3,
  recency: 0.16,
  retraction: -1,
};

const DESIGN_PRIOR: Record<StudyDesign, number> = {
  systematic_review: 1,
  meta_analysis: 0.95,
  practice_guideline: 0.9,
  randomized_controlled_trial: 0.85,
  clinical_trial: 0.7,
  observational_study: 0.55,
  review: 0.45,
  case_report: 0.2,
  other: 0.3,
};

export function rankEvidence(
  query: string,
  articles: {
    id: string;
    title: string;
    abstractText: string;
    meshTerms: string[];
    publicationYear: number;
    studyDesign: StudyDesign;
    retractionStatus: string;
  }[],
  weights = BASELINE_EVIDENCE_WEIGHTS,
) {
  const queryTerms = [...tokenize(query)];
  const currentYear = new Date().getUTCFullYear();
  return articles
    .map((article) => {
      const documentTerms = tokenize(
        `${article.title} ${article.abstractText} ${article.meshTerms.join(" ")}`,
      );
      const lexical =
        queryTerms.length === 0
          ? 0
          : queryTerms.filter((term) => documentTerms.has(term)).length /
            new Set(queryTerms).size;
      const design = DESIGN_PRIOR[article.studyDesign];
      const recency =
        article.publicationYear > 0
          ? Math.exp(-Math.max(0, currentYear - article.publicationYear) / 12)
          : 0;
      const retraction = article.retractionStatus === "clear" ? 0 : 1;
      const score =
        lexical * weights.lexical +
        design * weights.design +
        recency * weights.recency +
        retraction * weights.retraction;
      return {
        article,
        score,
        explanation: { lexical, design, recency, retraction, weights },
      };
    })
    .filter((result) => result.explanation.lexical > 0)
    .sort(
      (a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id),
    );
}

export function trainEvidenceWeights(
  examples: {
    features: Omit<EvidenceWeights, "retraction"> & { retraction: number };
    relevance: number;
  }[],
  iterations = 400,
): EvidenceWeights {
  if (examples.length < 4) {
    throw new Error(
      "At least four reviewed examples are required to train a checkpoint",
    );
  }
  const weights: EvidenceWeights = { ...BASELINE_EVIDENCE_WEIGHTS };
  const learningRate = 0.08;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const example of examples) {
      const target = example.relevance / 3;
      const prediction = sigmoid(dot(weights, example.features));
      const error = target - prediction;
      weights.lexical += learningRate * error * example.features.lexical;
      weights.design += learningRate * error * example.features.design;
      weights.recency += learningRate * error * example.features.recency;
      weights.retraction += learningRate * error * example.features.retraction;
    }
  }
  return weights;
}

function dot(left: EvidenceWeights, right: EvidenceWeights): number {
  return (
    left.lexical * right.lexical +
    left.design * right.design +
    left.recency * right.recency +
    left.retraction * right.retraction
  );
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2),
  );
}
