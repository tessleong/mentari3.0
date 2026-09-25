import { Waveform } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";

import { cn } from "@anlg/utils";

import { Transcript } from "~/session/components/note-input/transcript";
import { useListener } from "~/stt/contexts";

/**
 * Granola-style live transcript toggle: a small waveform button next to the
 * chat trigger that shows/hides a compact transcript panel without
 * navigating away from whatever view (notes, raw) the user is currently on.
 * Only shown while this session is actively recording — before or after
 * that, the transcript is already reachable from the view switcher.
 */
export function LiveTranscriptToggle({ sessionId }: { sessionId: string }) {
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isLive = sessionMode === "active" || sessionMode === "finalizing";

  if (!isLive) {
    return null;
  }

  return (
    <div className="relative flex items-center">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn([
              "border-border/70 bg-card/98 absolute right-0 bottom-full mb-3",
              // The placeholder states this can render (listening, batch
              // fallback, empty) are min-h-[400px] internally, sized for a
              // full-page view — give the panel enough room that they don't
              // overflow their own floor and look clipped in a "compact" box.
              "flex h-[30rem] max-h-[calc(100vh-6rem)] min-h-72 w-80 max-w-[calc(100vw-2rem)] min-w-72 resize flex-col overflow-hidden rounded-3xl border shadow-xl",
            ])}
          >
            <div className="border-border/60 flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="bg-primary size-2 rounded-full shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" />
                <p className="text-sm font-medium">Live transcript</p>
              </div>
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Close
              </button>
            </div>
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
            >
              <Transcript sessionId={sessionId} scrollRef={scrollRef} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        data-tauri-drag-region="false"
        aria-label={open ? "Hide live transcript" : "Show live transcript"}
        aria-pressed={open}
        onClick={() => setOpen((value) => !value)}
        className={cn([
          "border-border bg-card flex size-9 items-center justify-center rounded-full border shadow-sm",
          "hover:border-primary/30 hover:bg-accent text-foreground transition-colors",
          open && "border-primary bg-primary text-primary-foreground",
        ])}
      >
        <Waveform className="size-4" weight="bold" />
      </button>
    </div>
  );
}
