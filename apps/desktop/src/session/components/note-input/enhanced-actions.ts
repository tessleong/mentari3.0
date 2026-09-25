import { useCallback } from "react";

import { commands as analyticsCommands } from "@anlg/plugin-analytics";
import { sonnerToast } from "@anlg/ui/components/ui/toast";

import { useAITaskTask, useLLMConnectionStatus } from "~/ai/hooks";
import { useLanguageModel } from "~/ai/hooks";
import {
  isMainAITaskHostWindow,
  requestMainAITaskCancel,
  requestMainEnhance,
} from "~/ai/task-window-sync";
import { getEligibility } from "~/services/enhancer/eligibility";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import { useEnhancedNote } from "~/session/queries";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";
import { useTabs } from "~/store/zustand/tabs";

export function useEnhancedNoteActions({
  enhancedNoteId,
  sessionId,
}: {
  enhancedNoteId: string | null;
  sessionId: string;
}) {
  const model = useLanguageModel("enhance");
  const llmStatus = useLLMConnectionStatus();
  const openNew = useTabs((state) => state.openNew);
  const taskId = enhancedNoteId
    ? createTaskId(enhancedNoteId, "enhance")
    : null;

  const noteTemplateId =
    useEnhancedNote(enhancedNoteId ?? "")?.templateId || undefined;

  const enhanceTask = useAITaskTask(taskId, "enhance");

  const onRegenerate = useCallback(
    async (templateId: string | null, oneOffInstruction?: string) => {
      if (!enhancedNoteId) {
        return;
      }

      if (!model) {
        const needsBaaApproval =
          llmStatus.status === "error" &&
          llmStatus.reason === "baa_not_approved";
        sonnerToast.error(
          needsBaaApproval
            ? "This provider needs BAA approval before it can be used."
            : "Set up Intelligence in Settings before regenerating this summary.",
          {
            action: {
              label: needsBaaApproval
                ? "Review privacy settings"
                : "Open settings",
              onClick: () =>
                openNew({
                  type: "settings",
                  state: { tab: needsBaaApproval ? "privacy" : "intelligence" },
                }),
            },
          },
        );
        return;
      }

      const snapshot = await loadSessionContentSnapshot(sessionId);
      if (snapshot) {
        const eligibility = getEligibility(snapshot.transcripts);
        if (
          !eligibility.eligible &&
          eligibility.code === "transcript_too_short"
        ) {
          sonnerToast.warning("Summary wasn't generated", {
            id: `auto-summary-too-short-${sessionId}`,
            description: eligibility.reason,
          });
          return;
        }
      }

      if (!isMainAITaskHostWindow()) {
        void requestMainEnhance(sessionId, {
          templateId: templateId ?? noteTemplateId,
          targetNoteId: enhancedNoteId,
        });
        return;
      }

      void analyticsCommands.event({
        event: "note_enhanced",
        is_auto: false,
      });

      await enhanceTask.start({
        model,
        args: {
          sessionId,
          enhancedNoteId,
          templateId: templateId ?? noteTemplateId,
          oneOffInstruction,
        },
      });
    },
    [
      enhancedNoteId,
      model,
      llmStatus,
      openNew,
      enhanceTask.start,
      sessionId,
      noteTemplateId,
    ],
  );

  const onCancel = useCallback(() => {
    if (!taskId) {
      return;
    }

    if (!isMainAITaskHostWindow()) {
      void requestMainAITaskCancel(taskId);
      return;
    }

    enhanceTask.cancel();
  }, [enhanceTask.cancel, taskId]);

  return {
    isGenerating: enhanceTask.isGenerating,
    isError: enhanceTask.isError,
    error: enhanceTask.error,
    onRegenerate,
    onCancel,
  };
}
