import { ChatCircleDots, Copy } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { EditorView } from "prosemirror-view";
import { useEffect, useRef, useState, type RefObject } from "react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@anlg/ui/components/ui/popover";

import { AgentCompanions } from "~/agents/companions";
import { requestChatPrompt } from "~/chat/state/prompt-request";
import { retrieveEncounterSegments } from "~/clinical/encounter-retrieval";
import { copyTextToClipboard } from "~/session/components/note-input/header-shared";
import { useTabs } from "~/store/zustand/tabs";

const RESULT_LIMIT = 4;

// Excludes h1: ensureFirstLineTitle always makes the first node a level-1
// heading used as the document title, not summary content to cite.
const HOVERABLE_BLOCK_SELECTOR = "p, li, h2, h3, h4, h5, h6, blockquote";

/**
 * Overlays the enhanced-note editor with a select-to-cite affordance:
 * selecting a word or phrase in any summary line looks up matching
 * transcript segments so patients can see exactly what was said, not just
 * the AI's paraphrase. Deliberately requires a selection rather than a
 * hover, since the note is editable — a plain click still just places the
 * cursor, and hovering every line while reading would open a popup
 * constantly. Positions via Radix's virtualRef against the selected
 * ProseMirror block's DOM node directly, so it needs no new editor plugin
 * state or decorations.
 */
export function SummaryLineHoverLayer({
  sessionId,
  view,
}: {
  sessionId: string;
  view: EditorView | null;
}) {
  const [selectedBlock, setSelectedBlock] = useState<HTMLElement | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [open, setOpen] = useState(false);
  const virtualRef = useRef<HTMLElement | null>(null);
  virtualRef.current = selectedBlock;

  useEffect(() => {
    if (!view) return;
    const dom = view.dom;

    const closestBlock = (node: Node | null): HTMLElement | null => {
      const element =
        node instanceof Element
          ? node
          : node instanceof Text
            ? node.parentElement
            : null;
      if (!element) return null;
      const block = element.closest(HOVERABLE_BLOCK_SELECTOR);
      return block instanceof HTMLElement && dom.contains(block) ? block : null;
    };

    const handleMouseUp = () => {
      const selection = window.getSelection();
      const selected = selection?.toString().trim() ?? "";
      if (!selection || selection.isCollapsed || selected.length < 3) return;

      const range = selection.getRangeAt(0);
      const block = closestBlock(range.commonAncestorContainer);
      if (!block) return;

      setSelectedText(selected);
      setSelectedBlock(block);
      setOpen(true);
    };

    dom.addEventListener("mouseup", handleMouseUp);
    return () => {
      dom.removeEventListener("mouseup", handleMouseUp);
    };
  }, [view]);

  const lineText = selectedText;

  const query = useQuery({
    queryKey: ["summary-line-transcript-quotes", sessionId, lineText],
    queryFn: () => retrieveEncounterSegments(sessionId, lineText, RESULT_LIMIT),
    enabled: open && lineText.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleInterrogate = () => {
    if (!lineText) return;
    requestChatPrompt(
      `Investigate this summary claim: “${lineText}”\n\nExplain its specific context, then support or correct it using exact quotes and speaker timestamps from this session's transcript.`,
    );
    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Radix's virtualRef type demands a non-null Measurable even though it
          only reads .current while open (i.e. once a selection is made). */}
      <PopoverAnchor virtualRef={virtualRef as RefObject<HTMLElement>} />
      <PopoverContent
        variant="app"
        align="start"
        className="max-h-[min(32rem,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SummaryLineHoverContent
          sessionId={sessionId}
          isLoading={query.isLoading}
          lineText={lineText}
          onInterrogate={handleInterrogate}
          results={query.data}
        />
      </PopoverContent>
    </Popover>
  );
}

function SummaryLineHoverContent({
  sessionId,
  isLoading,
  lineText,
  onInterrogate,
  results,
}: {
  sessionId: string;
  isLoading: boolean;
  lineText: string;
  onInterrogate: () => void;
  results: Awaited<ReturnType<typeof retrieveEncounterSegments>> | undefined;
}) {
  if (isLoading || !results) {
    return (
      <p className="text-muted-foreground py-1 text-xs">Checking transcript…</p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
        Claim context
      </p>
      <p className="text-foreground text-sm leading-snug">{lineText}</p>
      {results.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
            Exact transcript evidence
          </p>
          <ul className="flex flex-col gap-2">
            {results.map((result) => (
              <li
                key={result.segmentId}
                className="group flex items-start justify-between gap-2 text-xs leading-snug"
              >
                <div>
                  <div className="text-muted-foreground mb-0.5 flex items-center gap-1.5 text-[11px]">
                    <span className="font-medium">{result.speaker}</span>
                    <span className="tabular-nums">
                      {formatTimestamp(result.startMs)}
                    </span>
                  </div>
                  <span className="text-foreground">"{result.text}"</span>
                </div>
                <button
                  type="button"
                  aria-label="Copy quote"
                  onClick={() =>
                    void copyTextToClipboard(result.text, {
                      success: "Quote copied",
                      error: "Couldn't copy quote",
                    })
                  }
                  className="text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Copy size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Not directly quoted in this transcript.
        </p>
      )}
      <button
        type="button"
        onClick={onInterrogate}
        className="border-border text-foreground hover:bg-accent flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
      >
        <ChatCircleDots size={15} />
        Ask about this claim
      </button>
      <AgentCompanions
        sessionId={sessionId}
        selectedText={lineText}
        autoOpenSelection={false}
      />
    </div>
  );
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
