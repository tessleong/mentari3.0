import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type VirtualElement,
} from "@floating-ui/dom";
import {
  useEditorEffect,
  useEditorEventCallback,
  useEditorState,
} from "@handlewithcare/react-prosemirror";
import {
  CaretDown,
  ChatCenteredDots,
  Code,
  Highlighter,
  ListBullets,
  ListNumbers,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextIndent,
  TextItalic,
  TextOutdent,
  TextStrikethrough,
  TextT,
  TextUnderline,
} from "@phosphor-icons/react";
import { setBlockType, toggleMark } from "prosemirror-commands";
import type { MarkType, Node as PMNode, NodeType } from "prosemirror-model";
import {
  liftListItem,
  sinkListItem,
  wrapInList,
} from "prosemirror-schema-list";
import type { Command, EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@anlg/utils";

import { isInListItem } from "../note/keymap";
import { schema } from "../note/schema";

const OVERFLOW_CLIP = /(auto|scroll|overlay|hidden|clip)/;

export function getClipBoundary(element: Element): Element {
  let current = element.parentElement;
  while (current && current !== document.documentElement) {
    const { overflow, overflowX, overflowY } = getComputedStyle(current);
    if (
      OVERFLOW_CLIP.test(overflowY) ||
      OVERFLOW_CLIP.test(overflowX) ||
      OVERFLOW_CLIP.test(overflow)
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return element;
}

export function createSelectionVirtualElement(
  view: EditorView,
  from: number,
  to: number,
): VirtualElement {
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  return {
    contextElement: view.dom,
    getBoundingClientRect: () =>
      new DOMRect(
        Math.min(start.left, end.left),
        start.top,
        Math.abs(end.right - start.left),
        end.bottom - start.top,
      ),
  };
}

export function selectionTouchesTitleHeading(state: EditorState): boolean {
  const firstNode = state.doc.firstChild;
  if (
    !firstNode ||
    firstNode.type !== state.schema.nodes.heading ||
    firstNode.attrs.level !== 1 ||
    state.selection.empty
  ) {
    return false;
  }

  const titleStart = 1;
  const titleEnd = firstNode.nodeSize - 1;
  const { from, to } = state.selection;

  return from < titleEnd && to > titleStart;
}

function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks || $from.marks());
  }
  return state.doc.rangeHasMark(from, to, type);
}

const TOOLBAR_BUTTONS: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  markType: MarkType;
}[] = [
  { id: "bold", icon: TextB, markType: schema.marks.bold },
  { id: "italic", icon: TextItalic, markType: schema.marks.italic },
  { id: "underline", icon: TextUnderline, markType: schema.marks.underline },
  { id: "strike", icon: TextStrikethrough, markType: schema.marks.strike },
  { id: "code", icon: Code, markType: schema.marks.code },
  { id: "highlight", icon: Highlighter, markType: schema.marks.highlight },
];

// 0 means "Normal text" (paragraph); matches the slash command menu's
// exposed levels (1-3), even though the schema allows up to h6.
const HEADING_LEVELS = [0, 1, 2, 3] as const;
const HEADING_LABELS: Record<(typeof HEADING_LEVELS)[number], string> = {
  0: "Normal text",
  1: "Heading 1",
  2: "Heading 2",
  3: "Heading 3",
};
const HEADING_ICONS: Record<
  (typeof HEADING_LEVELS)[number],
  React.ComponentType<{ className?: string }>
> = {
  0: TextT,
  1: TextHOne,
  2: TextHTwo,
  3: TextHThree,
};

export function getActiveHeadingLevel(
  state: EditorState,
): (typeof HEADING_LEVELS)[number] | null {
  const { parent } = state.selection.$from;
  if (parent.type === schema.nodes.paragraph) return 0;
  if (parent.type === schema.nodes.heading) {
    const level = parent.attrs.level as number;
    return level === 1 || level === 2 || level === 3 ? level : null;
  }
  return null;
}

export function setHeadingLevel(
  level: (typeof HEADING_LEVELS)[number],
): Command {
  return level === 0
    ? setBlockType(schema.nodes.paragraph)
    : setBlockType(schema.nodes.heading, { level });
}

const ALIGN_VALUES = ["left", "center", "right", "justify"] as const;
type AlignValue = (typeof ALIGN_VALUES)[number];
const ALIGN_ICONS: Record<
  AlignValue,
  React.ComponentType<{ className?: string }>
> = {
  left: TextAlignLeft,
  center: TextAlignCenter,
  right: TextAlignRight,
  justify: TextAlignJustify,
};

function isAlignableBlock(type: NodeType): boolean {
  return type === schema.nodes.paragraph || type === schema.nodes.heading;
}

export function getActiveAlign(state: EditorState): AlignValue | null {
  const { parent } = state.selection.$from;
  if (!isAlignableBlock(parent.type)) return null;
  const align = parent.attrs.align as string | null;
  return align && (ALIGN_VALUES as readonly string[]).includes(align)
    ? (align as AlignValue)
    : "left";
}

// Setting align is a same-size transform (an attr-only change), so
// positions collected from `state.doc` stay valid to apply sequentially
// against the transaction being built up across them.
export function setBlockAlign(align: AlignValue | null): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const targets: { pos: number; node: PMNode }[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (isAlignableBlock(node.type)) {
        targets.push({ pos, node });
      }
    });
    if (targets.length === 0) return false;

    if (dispatch) {
      let tr = state.tr;
      for (const { pos, node } of targets) {
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, align });
      }
      dispatch(tr);
    }
    return true;
  };
}

function isListActive(state: EditorState, listType: NodeType): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === listType) return true;
  }
  return false;
}

export function toggleList(listType: NodeType): Command {
  return (state, dispatch) => {
    if (isListActive(state, listType)) {
      const itemName = isInListItem(state);
      const itemType = itemName ? state.schema.nodes[itemName] : undefined;
      if (!itemType) return false;
      return liftListItem(itemType)(state, dispatch);
    }
    return wrapInList(listType)(state, dispatch);
  };
}

export const outdentListItem: Command = (state, dispatch) => {
  const itemName = isInListItem(state);
  const itemType = itemName ? state.schema.nodes[itemName] : undefined;
  if (!itemType) return false;
  return liftListItem(itemType)(state, dispatch);
};

export const indentListItem: Command = (state, dispatch) => {
  const itemName = isInListItem(state);
  const itemType = itemName ? state.schema.nodes[itemName] : undefined;
  if (!itemType) return false;
  return sinkListItem(itemType)(state, dispatch);
};

export function FormatToolbar({
  onComment,
  showFormatting = true,
  trailingActions,
}: {
  onComment?: () => void;
  showFormatting?: boolean;
  /** Rendered at the end of the toolbar, so a consumer can add its own controls
   * to the selection toolbar instead of floating a second bar over it. */
  trailingActions?: React.ReactNode;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);

  const editorState = useEditorState();
  const canFormatSelection = editorState
    ? showFormatting && !selectionTouchesTitleHeading(editorState)
    : false;
  const shouldShowToolbar = editorState
    ? !editorState.selection.empty &&
      (canFormatSelection ||
        onComment !== undefined ||
        trailingActions !== undefined)
    : false;

  const toggle = useEditorEventCallback((view, markType: MarkType) => {
    if (!view) return;
    toggleMark(markType)(view.state, (tr) => view.dispatch(tr));
    view.focus();
  });

  const runCommand = useEditorEventCallback((view, command: Command) => {
    if (!view) return;
    command(view.state, (tr) => view.dispatch(tr));
    view.focus();
  });

  useEffect(() => {
    if (!shouldShowToolbar) setHeadingMenuOpen(false);
  }, [shouldShowToolbar]);

  useEditorEffect((view) => {
    if (!view || !shouldShowToolbar) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      return;
    }

    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const { from, to } = view.state.selection;
    const referenceEl = createSelectionVirtualElement(view, from, to);
    // Portaled toolbars clip to the viewport by default, which includes window
    // chrome. Stay inside the editor scrollport so the menu flips below the
    // first line instead of covering traffic lights.
    const boundary = getClipBoundary(view.dom);

    const update = () => {
      void computePosition(referenceEl, toolbar, {
        placement: "top",
        strategy: "fixed",
        middleware: [
          offset(8),
          flip({
            boundary,
            fallbackPlacements: ["bottom"],
            padding: 8,
          }),
          shift({ boundary, padding: 8 }),
        ],
      }).then(({ x, y }) => {
        Object.assign(toolbar.style, {
          left: `${x}px`,
          top: `${y}px`,
        });
      });
    };

    cleanupRef.current?.();
    cleanupRef.current = autoUpdate(referenceEl, toolbar, update);
    update();
  });

  if (!shouldShowToolbar || !editorState) return null;

  const activeHeadingLevel = getActiveHeadingLevel(editorState);
  const activeAlign = getActiveAlign(editorState);
  const bulletListActive = isListActive(editorState, schema.nodes.bulletList);
  const orderedListActive = isListActive(editorState, schema.nodes.orderedList);
  const canOutdent = isInListItem(editorState) !== null;
  const HeadingIcon = HEADING_ICONS[activeHeadingLevel ?? 0];

  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Format selection"
      className={cn([
        "bg-popover ring-border fixed z-50 flex items-center gap-0.5 rounded-xl p-1 ring-1",
        "shadow-lg",
      ])}
      style={{ top: 0, left: 0 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {canFormatSelection && activeHeadingLevel !== null && (
        <div className="relative">
          <button
            type="button"
            aria-label="Text style"
            aria-haspopup="menu"
            aria-expanded={headingMenuOpen}
            className={cn([
              "flex h-7 items-center gap-0.5 rounded-md px-1.5",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer border-none bg-transparent transition-colors",
            ])}
            onClick={() => setHeadingMenuOpen((open) => !open)}
          >
            <HeadingIcon className="size-4" />
            <CaretDown className="size-3" />
          </button>
          {headingMenuOpen && (
            <div
              role="menu"
              className="bg-popover ring-border absolute top-full left-0 z-10 mt-1 flex w-36 flex-col rounded-lg p-1 shadow-lg ring-1"
            >
              {HEADING_LEVELS.map((level) => {
                const Icon = HEADING_ICONS[level];
                const active = activeHeadingLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={cn([
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      "cursor-pointer border-none transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground bg-transparent",
                    ])}
                    onClick={() => {
                      runCommand(setHeadingLevel(level));
                      setHeadingMenuOpen(false);
                    }}
                  >
                    <Icon className="size-4" />
                    {HEADING_LABELS[level]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {canFormatSelection && activeHeadingLevel !== null && (
        <span className="bg-border mx-0.5 h-4 w-px" aria-hidden="true" />
      )}
      {canFormatSelection &&
        TOOLBAR_BUTTONS.map((button) => {
          const active = isMarkActive(editorState, button.markType);
          return (
            <button
              key={button.id}
              aria-pressed={active}
              className={cn([
                "flex size-7 items-center justify-center rounded-md",
                "cursor-pointer border-none transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent",
              ])}
              onClick={() => toggle(button.markType)}
            >
              <button.icon className="size-4" />
            </button>
          );
        })}
      {canFormatSelection && activeAlign !== null && (
        <span className="bg-border mx-0.5 h-4 w-px" aria-hidden="true" />
      )}
      {canFormatSelection &&
        activeAlign !== null &&
        ALIGN_VALUES.map((align) => {
          const Icon = ALIGN_ICONS[align];
          const active = activeAlign === align;
          return (
            <button
              key={align}
              type="button"
              aria-label={`Align ${align}`}
              aria-pressed={active}
              className={cn([
                "flex size-7 items-center justify-center rounded-md",
                "cursor-pointer border-none transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent",
              ])}
              onClick={() => runCommand(setBlockAlign(active ? null : align))}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      {canFormatSelection && (
        <span className="bg-border mx-0.5 h-4 w-px" aria-hidden="true" />
      )}
      {canFormatSelection && (
        <>
          <button
            type="button"
            aria-label="Bullet list"
            aria-pressed={bulletListActive}
            className={cn([
              "flex size-7 items-center justify-center rounded-md",
              "cursor-pointer border-none transition-colors",
              bulletListActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent",
            ])}
            onClick={() => runCommand(toggleList(schema.nodes.bulletList))}
          >
            <ListBullets className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Numbered list"
            aria-pressed={orderedListActive}
            className={cn([
              "flex size-7 items-center justify-center rounded-md",
              "cursor-pointer border-none transition-colors",
              orderedListActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent",
            ])}
            onClick={() => runCommand(toggleList(schema.nodes.orderedList))}
          >
            <ListNumbers className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Decrease indent"
            disabled={!canOutdent}
            className={cn([
              "flex size-7 items-center justify-center rounded-md",
              "border-none transition-colors",
              canOutdent
                ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer bg-transparent"
                : "text-muted-foreground/40 cursor-not-allowed bg-transparent",
            ])}
            onClick={() => runCommand(outdentListItem)}
          >
            <TextOutdent className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Increase indent"
            disabled={!canOutdent}
            className={cn([
              "flex size-7 items-center justify-center rounded-md",
              "border-none transition-colors",
              canOutdent
                ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer bg-transparent"
                : "text-muted-foreground/40 cursor-not-allowed bg-transparent",
            ])}
            onClick={() => runCommand(indentListItem)}
          >
            <TextIndent className="size-4" />
          </button>
        </>
      )}
      {canFormatSelection && onComment && (
        <span className="bg-border mx-0.5 h-4 w-px" aria-hidden="true" />
      )}
      {onComment && (
        <button
          type="button"
          aria-label="Comment"
          className={cn([
            "text-muted-foreground flex size-7 items-center justify-center rounded-md",
            "hover:bg-accent hover:text-accent-foreground cursor-pointer border-none bg-transparent transition-colors",
          ])}
          onClick={onComment}
        >
          <ChatCenteredDots className="size-4" />
        </button>
      )}
      {trailingActions && (
        <>
          {(canFormatSelection || onComment) && (
            <span className="bg-border mx-0.5 h-4 w-px" aria-hidden="true" />
          )}
          {trailingActions}
        </>
      )}
    </div>,
    document.body,
  );
}
