import { DotsSixVertical } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHotkeys } from "react-hotkeys-hook";

import { cn } from "@anlg/utils";

import { ChatPanelFrame } from "./chat-panel";

import type { ChatSessionRenderProps } from "~/chat/components/session-provider";
import { chatFloatingPanelShellClassNames } from "~/chat/surface";
import { useShell } from "~/contexts/shell";
import { useFloatingPanelLayout } from "~/shared/hooks/use-floating-panel-layout";

const FLOATING_CHAT_INPUT_MAX_WIDTH = 640;
const FLOATING_CHAT_SHELL_INSET = 4;
const FLOATING_PANEL_MIN_WIDTH = 476;
const FLOATING_PANEL_DEFAULT_MAX_WIDTH =
  FLOATING_CHAT_INPUT_MAX_WIDTH + FLOATING_CHAT_SHELL_INSET * 2;
const FLOATING_PANEL_TOP_CLEARANCE = 46;
const FLOATING_PANEL_EASE = [0.22, 1, 0.36, 1] as const;
const DOCK_EDGE_THRESHOLD = 80;

type FloatingContainerRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

// Dragging to either edge docks for real — the same resizable, window-
// reflowing panel the toolbar buttons open — rather than a lightweight
// visual edge-hug while still floating. Exported standalone (rather than
// inlined in the drag handler) so the edge-resolution decision is
// unit-testable without a live DOM drag, which the floating panel's
// ResizeObserver-measured containerRect can't reliably produce in this
// test environment.
export function resolveDockAction(
  containerRect: FloatingContainerRect | null,
  releasePoint: { clientX: number },
  threshold = DOCK_EDGE_THRESHOLD,
): "open-right-panel" | "open-left-panel" | null {
  if (!containerRect) return null;

  const distanceFromRight =
    containerRect.left + containerRect.width - releasePoint.clientX;
  if (distanceFromRight <= threshold) return "open-right-panel";

  const distanceFromLeft = releasePoint.clientX - containerRect.left;
  if (distanceFromLeft <= threshold) return "open-left-panel";

  return null;
}

export function PersistentChatPanel({
  floatingContainerRef,
  sessionProps,
}: {
  floatingContainerRef: React.RefObject<HTMLDivElement | null>;
  sessionProps: ChatSessionRenderProps | null;
}) {
  const { chat } = useShell();
  const isVisible = chat.mode === "FloatingOpen";

  const [containerRect, setContainerRect] =
    useState<FloatingContainerRect | null>(null);
  const [draftHasContent, setDraftHasContent] = useState(false);
  const { layout, startDrag, startResize } = useFloatingPanelLayout(
    "ask-mentari-panel-layout",
    { minWidth: FLOATING_PANEL_MIN_WIDTH, minHeight: 260 },
  );

  const getActiveContainer = () => {
    return (
      floatingContainerRef.current?.querySelector<HTMLDivElement>(
        "[data-chat-floating-anchor]",
      ) ?? floatingContainerRef.current
    );
  };

  const getContainerRect = () => {
    const anchor = getActiveContainer();

    if (!anchor) {
      return null;
    }

    return toFloatingContainerRect(anchor.getBoundingClientRect());
  };

  useHotkeys(
    "esc",
    () => chat.sendEvent({ type: "CLOSE" }),
    {
      enabled: isVisible,
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [chat, isVisible],
  );

  useLayoutEffect(() => {
    const root = floatingContainerRef.current;
    const container = getActiveContainer();

    if (!isVisible || !root || !container) {
      return;
    }

    const updateRect = () => {
      const nextRect = getContainerRect();
      setContainerRect((currentRect) =>
        areFloatingContainerRectsEqual(currentRect, nextRect)
          ? currentRect
          : nextRect,
      );
    };

    updateRect();
    const observer = new ResizeObserver(updateRect);
    if (root !== container) {
      observer.observe(root);
    }
    observer.observe(container);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [isVisible, floatingContainerRef]);

  const panelMotion = {
    initial: { y: 10, scale: 0.985 },
    animate: { y: 0, scale: 1 },
    exit: { y: 6, scale: 0.99 },
  };
  const panelTransition = { duration: 0.18, ease: FLOATING_PANEL_EASE };
  const panelStyle = {
    width: layout.width ? `${layout.width}px` : "100%",
    minWidth: `min(${FLOATING_PANEL_MIN_WIDTH}px, 100%)`,
    maxWidth: layout.width
      ? `${layout.width}px`
      : `${FLOATING_PANEL_DEFAULT_MAX_WIDTH}px`,
    height: layout.height ? `${layout.height}px` : undefined,
    maxHeight: layout.height ? `${layout.height}px` : "100%",
    transformOrigin: "bottom center",
    willChange: "transform",
  };

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {isVisible && (
        <motion.div
          className="pointer-events-none fixed"
          style={
            containerRect
              ? {
                  top: containerRect.top + layout.dy,
                  left: containerRect.left + layout.dx,
                  width: containerRect.width,
                  height: containerRect.height,
                  willChange: "opacity",
                }
              : { display: "none" }
          }
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: FLOATING_PANEL_EASE }}
        >
          <div
            data-chat-floating-frame
            className="pointer-events-auto relative flex h-full min-h-0 items-end justify-center px-3 pb-2"
            style={{
              paddingTop: FLOATING_PANEL_TOP_CLEARANCE,
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                if (draftHasContent) {
                  return;
                }

                chat.sendEvent({ type: "CLOSE" });
              }
            }}
          >
            <motion.div
              data-chat-panel
              data-chat-panel-reveal="lift"
              data-chat-size="floating"
              className={cn([
                "relative flex min-h-0 flex-col overflow-hidden",
                chatFloatingPanelShellClassNames(),
              ])}
              style={panelStyle}
              initial={panelMotion.initial}
              animate={panelMotion.animate}
              exit={panelMotion.exit}
              transition={panelTransition}
            >
              <div
                data-chat-drag-handle
                onMouseDown={(event) => {
                  startDrag(event, (upEvent) => {
                    const action = resolveDockAction(containerRect, upEvent);
                    if (action === "open-right-panel") {
                      chat.sendEvent({ type: "OPEN_RIGHT_PANEL" });
                    } else if (action === "open-left-panel") {
                      chat.sendEvent({ type: "OPEN_LEFT_PANEL" });
                    }
                  });
                }}
                aria-hidden
                className="text-muted-foreground/40 hover:text-muted-foreground/70 flex shrink-0 cursor-grab items-center justify-center py-1 active:cursor-grabbing"
              >
                <DotsSixVertical className="size-4" />
              </div>
              <div
                data-chat-resize-handle
                role="presentation"
                aria-hidden
                onMouseDown={(event) => {
                  // Bottom-anchored panel: dragging the top edge up
                  // (negative deltaY) should grow the height. Width is only
                  // ever resized here to preserve its current effective
                  // value, since startResize always sets both together.
                  const startingHeight =
                    layout.height ?? containerRect?.height ?? 0;
                  const currentWidth =
                    layout.width ??
                    containerRect?.width ??
                    FLOATING_PANEL_MIN_WIDTH;
                  startResize(event, (_deltaX, deltaY) => ({
                    width: currentWidth,
                    height: startingHeight - deltaY,
                  }));
                }}
                className="absolute top-0 right-0 left-0 h-1.5 cursor-ns-resize"
              />
              <ChatPanelFrame
                layout="floating"
                onDraftContentChange={setDraftHasContent}
                onOpenLeftPanel={() =>
                  chat.sendEvent({ type: "OPEN_LEFT_PANEL" })
                }
                onOpenRightPanel={() =>
                  chat.sendEvent({ type: "OPEN_RIGHT_PANEL" })
                }
                sessionProps={sessionProps}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function toFloatingContainerRect(rect: DOMRect): FloatingContainerRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function areFloatingContainerRectsEqual(
  currentRect: FloatingContainerRect | null,
  nextRect: FloatingContainerRect | null,
) {
  return (
    currentRect?.top === nextRect?.top &&
    currentRect?.left === nextRect?.left &&
    currentRect?.width === nextRect?.width &&
    currentRect?.height === nextRect?.height
  );
}
