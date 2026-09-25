import { tool } from "ai";
import { z } from "zod";

import type { ToolDependencies } from "./types";

import { explainMedicalTerm } from "~/clinical/patient-explain";

export const buildExplainMedicalTermTool = (
  deps: Pick<ToolDependencies, "getSessionId">,
) =>
  tool({
    description:
      "Look up a medical term or question for a patient asking about their own visit. Returns two separate evidence channels: exactly what was said during THIS visit (encounter_sources) and what trusted medical literature says about the term generally (medical_sources). Use both when explaining a term. Never state or imply a diagnosis — only report what was discussed, considered, or documented, and cite the returned sources.",
    inputSchema: z.object({
      session_id: z
        .string()
        .optional()
        .describe("The visit/session id. Defaults to the current session."),
      term: z
        .string()
        .min(2)
        .describe(
          "The medical term or question to explain, e.g. 'D-dimer' or 'why did my doctor mention birth control'",
        ),
    }),
    execute: async ({
      session_id,
      term,
    }: {
      session_id?: string;
      term: string;
    }) => {
      const sessionId = session_id ?? deps.getSessionId();
      if (!sessionId) {
        return {
          term,
          encounter_sources: [],
          medical_sources: [],
          message: "No active visit selected. Provide session_id explicitly.",
        };
      }

      const explanation = await explainMedicalTerm(sessionId, term);
      return {
        term: explanation.term,
        encounter_sources: explanation.encounterSources.map((source) => ({
          segment_id: source.segmentId,
          speaker: source.speaker,
          start_ms: source.startMs,
          end_ms: source.endMs,
          text: source.text,
        })),
        medical_sources: explanation.medicalSources.map((source) => ({
          pmid: source.pmid,
          doi: source.doi,
          title: source.title,
          journal: source.journal,
          publication_year: source.publicationYear,
          excerpt: source.excerpt,
          source_url: source.sourceUrl,
          source_id: source.sourceId,
          source_label: source.sourceLabel,
          study_design: source.studyDesign,
        })),
      };
    },
  });
