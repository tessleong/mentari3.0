import { retrieveEncounterSegments } from "./encounter-retrieval";
import type { StudyDesign } from "./pubmed";
import { searchClinicalEvidence } from "./repository";
import { sourceDisplayLabel } from "./sources";

export type PatientEncounterSource = {
  segmentId: string;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type PatientMedicalSource = {
  pmid: string;
  doi: string;
  title: string;
  journal: string;
  publicationYear: number;
  excerpt: string;
  sourceUrl: string;
  sourceId: string;
  sourceLabel: string;
  studyDesign: StudyDesign;
};

export type PatientTermExplanation = {
  term: string;
  encounterSources: PatientEncounterSource[];
  medicalSources: PatientMedicalSource[];
};

/**
 * Dual-provenance lookup for a term or question the patient wants
 * explained: what was actually said during this visit, plus what trusted
 * medical literature says. This is retrieval only — it does not generate
 * the plain-English explanation itself and never asserts a diagnosis.
 */
export async function explainMedicalTerm(
  sessionId: string,
  term: string,
  limits: { encounter?: number; medical?: number } = {},
): Promise<PatientTermExplanation> {
  const [encounterResults, medicalResults] = await Promise.all([
    retrieveEncounterSegments(sessionId, term, limits.encounter ?? 5),
    searchClinicalEvidence(term, limits.medical ?? 5),
  ]);

  return {
    term,
    encounterSources: encounterResults.map((result) => ({
      segmentId: result.segmentId,
      speaker: result.speaker,
      startMs: result.startMs,
      endMs: result.endMs,
      text: result.text,
    })),
    medicalSources: medicalResults.map((result) => ({
      pmid: result.article.pmid,
      doi: result.article.doi,
      title: result.article.title,
      journal: result.article.journal,
      publicationYear: result.article.publication_year,
      excerpt: result.evidenceExcerpt,
      sourceUrl: result.article.source_url,
      sourceId: result.article.source_id,
      sourceLabel: sourceDisplayLabel(result.article.source_id),
      studyDesign: result.article.study_design,
    })),
  };
}
