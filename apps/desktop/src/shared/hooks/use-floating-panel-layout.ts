import { useCallback, useRef, useState } from "react";

export type FloatingPanelLayout = {
  dx: number;
  dy: number;
  width: number | null;
  height: number | null;
  collapsed: boolean;
};

const DEFAULT_LAYOUT: FloatingPanelLayout = {
  dx: 0,
  dy: 0,
  width: null,
  height: null,
  collapsed: false,
};

function readLayout(storageKey: string): FloatingPanelLayout {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<FloatingPanelLayout>;
    return {
      dx: typeof parsed.dx === "number" ? parsed.dx : 0,
      dy: typeof parsed.dy === "number" ? parsed.dy : 0,
      width: typeof parsed.width === "number" ? parsed.width : null,
      height: typeof parsed.height === "number" ? parsed.height : null,
      collapsed:
        typeof parsed.collapsed === "boolean" ? parsed.collapsed : false,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function writeLayout(storageKey: string, layout: FloatingPanelLayout) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Per-viewer convenience only — a private window or blocked storage
    // just means the layout doesn't persist, which is fine.
  }
}

// Drag-to-reposition, drag-to-resize, and collapse/minimize for a floating
// panel, persisted per-viewer in localStorage so it's remembered across
// restarts without needing a settings-table migration for what's purely a
// cosmetic, per-device preference.
export function useFloatingPanelLayout(
  storageKey: string,
  {
    minWidth = 260,
    minHeight = 120,
  }: { minWidth?: number; minHeight?: number } = {},
) {
  const [layout, setLayout] = useState<FloatingPanelLayout>(() =>
    readLayout(storageKey),
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const persist = useCallback(
    (next: FloatingPanelLayout) => {
      layoutRef.current = next;
      setLayout(next);
      writeLayout(storageKey, next);
    },
    [storageKey],
  );

  const startDrag = useCallback(
    (event: React.MouseEvent, onRelease?: (event: MouseEvent) => void) => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const startLayout = layoutRef.current;

      const handleMove = (moveEvent: MouseEvent) => {
        persist({
          ...layoutRef.current,
          dx: startLayout.dx + (moveEvent.clientX - startX),
          dy: startLayout.dy + (moveEvent.clientY - startY),
        });
      };
      const handleUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        onRelease?.(upEvent);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [persist],
  );

  // The caller computes the new size from the raw mouse delta, since which
  // direction growth happens in depends on which edge the panel is
  // anchored from (e.g. a right-anchored panel grows as the mouse moves
  // left, not right).
  const startResize = useCallback(
    (
      event: React.MouseEvent,
      computeSize: (
        deltaX: number,
        deltaY: number,
      ) => { width: number; height: number },
    ) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;

      const handleMove = (moveEvent: MouseEvent) => {
        const { width, height } = computeSize(
          moveEvent.clientX - startX,
          moveEvent.clientY - startY,
        );
        persist({
          ...layoutRef.current,
          width: Math.max(minWidth, width),
          height: Math.max(minHeight, height),
        });
      };
      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [minWidth, minHeight, persist],
  );

  const toggleCollapsed = useCallback(() => {
    persist({ ...layoutRef.current, collapsed: !layoutRef.current.collapsed });
  }, [persist]);

  const reset = useCallback(() => persist(DEFAULT_LAYOUT), [persist]);

  return { layout, startDrag, startResize, toggleCollapsed, reset };
}
