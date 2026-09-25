import { useEffect, useState } from "react";

import { sonnerToast } from "@anlg/ui/components/ui/toast";

import { getEnhancerService } from "~/services/enhancer";
import { type Tab, useTabs } from "~/store/zustand/tabs";

// Generation that fails keeps retrying in the background (see the enhancer
// service's pending-job resume loop), and each retry re-emits
// "auto-enhance-started" for the same note. Without this, every retry would
// yank the user back to the summary view even after they deliberately
// switched away — summary generation should propagate quietly in the
// background, not fight the user's navigation. Track per note (not per
// session) so a genuinely new summary still gets its one reveal.
const autoRevealedNoteIds = new Set<string>();

export function useAutoEnhance(tab: Extract<Tab, { type: "sessions" }>) {
  const sessionId = tab.id;
  const [skipReason, setSkipReason] = useState<string | null>(null);

  useEffect(() => {
    const service = getEnhancerService();
    if (!service) return;
    return service.on((event) => {
      if (event.sessionId !== sessionId) return;
      if (event.type === "auto-enhance-skipped") {
        setSkipReason(event.reason);
        if (event.reasonCode === "transcript_too_short") {
          sonnerToast.warning("Summary wasn't generated", {
            id: `auto-summary-too-short-${sessionId}`,
            description: event.reason,
          });
        }
      }
      if (event.type === "auto-enhance-started") {
        if (autoRevealedNoteIds.has(event.noteId)) return;
        autoRevealedNoteIds.add(event.noteId);

        const tabsState = useTabs.getState();
        const sessionTab = tabsState.tabs.find(
          (t): t is Extract<Tab, { type: "sessions" }> =>
            t.type === "sessions" && t.id === sessionId,
        );
        if (sessionTab) {
          tabsState.updateSessionTabState(sessionTab, {
            ...sessionTab.state,
            view: { type: "enhanced", id: event.noteId },
          });
        }
      }
      if (event.type === "auto-enhance-no-model") {
        setSkipReason("No AI model configured");
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (skipReason) {
      const timer = setTimeout(() => setSkipReason(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [skipReason]);

  return { skipReason };
}
