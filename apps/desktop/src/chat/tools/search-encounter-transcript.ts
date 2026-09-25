import { tool } from "ai";
import { z } from "zod";

import type { ToolDependencies } from "./types";

import { retrieveEncounterSegments } from "~/clinical/encounter-retrieval";

export const buildSearchEncounterTranscriptTool = (
  deps: Pick<ToolDependencies, "getSessionId">,
) =>
  tool({
    description:
      "Search THIS encounter's own transcript for what was actually said, with exact speaker and timestamp. Use this before answering any question about what the patient or clinician said in this specific session — do not answer from memory or paraphrase. Cite the returned segment's speaker and timestamp. This does not search other sessions or medical literature.",
    inputSchema: z.object({
      session_id: z
        .string()
        .optional()
        .describe(
          "The session/encounter id to search within. Defaults to the current session.",
        ),
      query: z
        .string()
        .min(2)
        .describe(
          "What to search for in the transcript, e.g. 'when did the pain start'",
        ),
      limit: z.number().int().min(1).max(12).optional(),
    }),
    execute: async ({
      session_id,
      query,
      limit,
    }: {
      session_id?: string;
      query: string;
      limit?: number;
    }) => {
      const sessionId = session_id ?? deps.getSessionId();
      if (!sessionId) {
        return {
          session_id: null,
          query,
          results: [],
          message: "No active session selected. Provide session_id explicitly.",
        };
      }

      const results = await retrieveEncounterSegments(
        sessionId,
        query,
        limit ?? 8,
      );
      return {
        session_id: sessionId,
        query,
        results: results.map((result) => ({
          segment_id: result.segmentId,
          speaker: result.speaker,
          start_ms: result.startMs,
          end_ms: result.endMs,
          text: result.text,
          score: result.score,
          source_type: result.sourceType,
        })),
      };
    },
  });
