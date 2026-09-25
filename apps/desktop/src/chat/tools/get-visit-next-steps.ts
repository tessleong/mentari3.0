import { tool } from "ai";
import { z } from "zod";

import type { ToolDependencies } from "./types";

import { loadEncounterSegments } from "~/clinical/encounter-retrieval";
import { extractNextSteps } from "~/clinical/next-steps";

export const buildGetVisitNextStepsTool = (
  deps: Pick<ToolDependencies, "getSessionId">,
) =>
  tool({
    description:
      "Find the explicit next steps discussed during this visit — medication changes, labs, imaging, referrals, follow-up appointments, and warning signs to watch for. Every item is a heuristic match against the actual transcript with full provenance (speaker, timestamp) — verify each against its source sentence before presenting it as a confirmed instruction, and never invent a next step that wasn't actually said.",
    inputSchema: z.object({
      session_id: z
        .string()
        .optional()
        .describe("The visit/session id. Defaults to the current session."),
    }),
    execute: async ({ session_id }: { session_id?: string }) => {
      const sessionId = session_id ?? deps.getSessionId();
      if (!sessionId) {
        return {
          session_id: null,
          steps: [],
          message: "No active visit selected. Provide session_id explicitly.",
        };
      }

      const segments = await loadEncounterSegments(sessionId);
      const steps = extractNextSteps(segments);
      return {
        session_id: sessionId,
        steps: steps.map((step) => ({
          category: step.category,
          description: step.description,
          segment_id: step.sourceSegmentId,
          speaker: step.speaker,
          start_ms: step.startMs,
          end_ms: step.endMs,
        })),
      };
    },
  });
