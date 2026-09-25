import { tool } from "ai";
import { z } from "zod";

import type { ToolDependencies } from "./types";

import { usePendingEditStore } from "~/chat/tools/pending-edit-store";
import { resolveSummaryTarget } from "~/chat/tools/resolve-summary-target";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import {
  applySessionProposal,
  declineSessionProposal,
  persistChatSessionProposal,
} from "~/session/queries";

export const buildEditSummaryTool = (
  deps: Pick<
    ToolDependencies,
    "getSessionId" | "getEnhancedNoteId" | "openEditTab"
  >,
) =>
  tool({
    description:
      "Propose a complete replacement for an existing session summary and open a diff review where the user can apply or cancel it. Use this for broad rewrites such as refocusing, shortening, or restructuring a summary. The content must be the full replacement markdown, not instructions or a partial patch.",
    inputSchema: z.object({
      sessionId: z
        .string()
        .optional()
        .describe("The session ID to edit. Defaults to the current session."),
      enhancedNoteId: z
        .string()
        .optional()
        .describe(
          "The specific summary ID (enhanced note ID) to edit. Defaults to the active summary in the session tab when possible.",
        ),
      content: z
        .string()
        .describe("The complete replacement summary in markdown format"),
    }),
    execute: async (
      params: {
        sessionId?: string;
        enhancedNoteId?: string;
        content: string;
      },
      { toolCallId },
    ) => {
      const activeSessionId = deps.getSessionId();
      const sessionId = params.sessionId ?? activeSessionId;

      if (!sessionId) {
        return {
          status: "error",
          message:
            "No active session selected. Provide sessionId explicitly when calling edit_summary.",
        };
      }

      const snapshot = await loadSessionContentSnapshot(sessionId);
      const notes = snapshot?.enhancedNotes ?? [];

      const resolved = resolveSummaryTarget({
        notes,
        requestedEnhancedNoteId: params.enhancedNoteId,
        activeEnhancedNoteId: deps.getEnhancedNoteId(),
      });

      if (resolved.status === "error") {
        return resolved;
      }

      const { enhancedNoteId, currentContent } = resolved;

      try {
        await persistChatSessionProposal({
          id: toolCallId,
          sessionId,
          kind: "summary_replace",
          targetId: enhancedNoteId,
          currentMarkdown: currentContent,
          proposedMarkdown: params.content,
        });
      } catch {
        return {
          status: "error",
          message: "Failed to save the proposed summary edit.",
        };
      }

      const approved = await new Promise<boolean>((resolve) => {
        usePendingEditStore.getState().addEdit({
          requestId: toolCallId,
          sessionId,
          target: { kind: "summary", enhancedNoteId },
          currentContent,
          proposedContent: params.content,
          source: "chat",
          resolve,
        });
        deps.openEditTab(toolCallId);
      });

      if (!approved) {
        await declineSessionProposal(toolCallId);
        return { status: "declined" };
      }

      try {
        await applySessionProposal(toolCallId);
      } catch {
        return {
          status: "error",
          message: "Failed to apply the summary edit.",
        };
      }

      return { status: "applied" };
    },
  });
