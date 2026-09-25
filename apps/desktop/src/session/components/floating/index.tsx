import { AnimatePresence, motion } from "motion/react";

import { cn } from "@anlg/utils";

import { LiveTranscriptToggle } from "./live-transcript";
import { setSessionFabSelectionHost } from "./selection-slot";

import { ChatCTA } from "~/shared/chat-cta";
import type { EditorView, Tab } from "~/store/zustand/tabs/schema";

export function FloatingActionButton({
  tab,
}: {
  allowListening?: boolean;
  audioExists?: boolean;
  currentView: EditorView;
  skipReason?: string | null;
  tab: Extract<Tab, { type: "sessions" }>;
}) {
  return (
    <div
      className={cn([
        "pointer-events-none absolute right-4 bottom-3 z-30 flex max-w-[calc(100%-2rem)] flex-col-reverse items-end",
      ])}
    >
      <div className="peer/session-fab pointer-events-auto relative flex items-end gap-2">
        <LiveTranscriptToggle sessionId={tab.id} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key="chat"
            aria-hidden={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="visible relative max-w-full transition-transform duration-200 ease-out"
          >
            <ChatCTA />
          </motion.div>
        </AnimatePresence>
      </div>
      <div
        ref={setSessionFabSelectionHost}
        data-session-fab-selection
        className={cn([
          "pointer-events-auto z-10 mb-2",
          "origin-bottom transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "translate-y-8 dark:translate-y-7",
          "peer-focus-within/session-fab:translate-y-0 peer-hover/session-fab:translate-y-0",
          "dark:peer-focus-within/session-fab:translate-y-0 dark:peer-hover/session-fab:translate-y-0",
        ])}
      />
    </div>
  );
}
