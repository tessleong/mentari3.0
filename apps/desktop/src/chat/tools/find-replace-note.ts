import { tool } from "ai";
import { z } from "zod";

import type { ToolDependencies } from "./types";

import { usePendingEditStore } from "~/chat/tools/pending-edit-store";
import { resolveSummaryTarget } from "~/chat/tools/resolve-summary-target";
import {
  replaceBoundedExact,
  replaceExact,
} from "~/chat/tools/session-correction";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import {
  applySessionProposal,
  declineSessionProposal,
  persistChatSessionProposal,
} from "~/session/queries";

type FindReplaceTarget = "memo" | "summary";

export const buildFindReplaceNoteTool = (
  deps: Pick<
    ToolDependencies,
    "getSessionId" | "getEnhancedNoteId" | "openEditTab"
  >,
) =>
  tool({
    description:
      "Find every occurrence of exact text in a session memo or summary and propose a replacement, opening a diff review where the user can apply or cancel it. Use this for literal find-and-replace requests (for example, swapping a term or abbreviation everywhere it appears) rather than rewriting content by hand. For narrow corrections of mistranscribed wording, prefer apply_session_correction instead, which applies immediately.",
    inputSchema: z.object({
      sessionId: z
        .string()
        .optional()
        .describe("The session ID to edit. Defaults to the current session."),
      target: z
        .enum(["memo", "summary"])
        .describe("Whether to search the session memo or an existing summary."),
      enhancedNoteId: z
        .string()
        .optional()
        .describe(
          "The specific summary ID (enhanced note ID) to search when target is summary. Defaults to the active summary in the session tab when possible.",
        ),
      find: z.string().min(1).describe("Exact text to find."),
      replace: z.string().describe("Replacement text."),
      matchWholeWord: z
        .boolean()
        .default(true)
        .describe(
          "When true, only match find as a whole word or phrase (not inside a larger word). Set to false to match any occurrence, including inside other words.",
        ),
    }),
    execute: async (
      params: {
        sessionId?: string;
        target: FindReplaceTarget;
        enhancedNoteId?: string;
        find: string;
        replace: string;
        matchWholeWord?: boolean;
      },
      { toolCallId },
    ) => {
      const sessionId = params.sessionId ?? deps.getSessionId();

      if (!sessionId) {
        return {
          status: "error",
          message:
            "No active session selected. Provide sessionId explicitly when calling find_replace_note.",
        };
      }

      const snapshot = await loadSessionContentSnapshot(sessionId);
      if (!snapshot) {
        return { status: "error", message: "Session not found." };
      }

      const replaceFn =
        params.matchWholeWord === false ? replaceExact : replaceBoundedExact;

      let kind: "memo_replace" | "summary_replace";
      let targetId: string;
      let currentContent: string;
      let storeTarget:
        | { kind: "memo" }
        | { kind: "summary"; enhancedNoteId: string };

      if (params.target === "memo") {
        kind = "memo_replace";
        targetId = snapshot.rawNoteId || sessionId;
        currentContent = snapshot.rawMarkdown;
        storeTarget = { kind: "memo" };
      } else {
        const resolved = resolveSummaryTarget({
          notes: snapshot.enhancedNotes,
          requestedEnhancedNoteId: params.enhancedNoteId,
          activeEnhancedNoteId: deps.getEnhancedNoteId(),
        });

        if (resolved.status === "error") {
          return { ...resolved, target: params.target };
        }

        kind = "summary_replace";
        targetId = resolved.enhancedNoteId;
        currentContent = resolved.currentContent;
        storeTarget = {
          kind: "summary",
          enhancedNoteId: resolved.enhancedNoteId,
        };
      }

      const replaced = replaceFn(currentContent, params.find, params.replace);
      if (replaced.count === 0) {
        return {
          status: "not_found",
          target: params.target,
          message:
            "No exact match found. Read the note and call find_replace_note with the exact current text.",
        };
      }

      try {
        await persistChatSessionProposal({
          id: toolCallId,
          sessionId,
          kind,
          targetId,
          currentMarkdown: currentContent,
          proposedMarkdown: replaced.text,
        });
      } catch {
        return {
          status: "error",
          target: params.target,
          message: "Failed to save the proposed edit.",
        };
      }

      const approved = await new Promise<boolean>((resolve) => {
        usePendingEditStore.getState().addEdit({
          requestId: toolCallId,
          sessionId,
          target: storeTarget,
          currentContent,
          proposedContent: replaced.text,
          source: "chat",
          resolve,
        });
        deps.openEditTab(toolCallId);
      });

      if (!approved) {
        await declineSessionProposal(toolCallId);
        return { status: "declined", target: params.target };
      }

      try {
        await applySessionProposal(toolCallId);
      } catch {
        return {
          status: "error",
          target: params.target,
          message: "Failed to apply the edit.",
        };
      }

      return {
        status: "applied",
        target: params.target,
        replacements: replaced.count,
      };
    },
  });
