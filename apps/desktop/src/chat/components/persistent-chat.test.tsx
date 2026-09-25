import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatMode: {
    current: "FloatingOpen" as
      | "FloatingClosed"
      | "FloatingOpen"
      | "RightPanelOpen"
      | "LeftPanelOpen",
  },
  sendEvent: vi.fn(),
  sessionProps: {
    contextEntities: [],
    isSystemPromptReady: true,
    messages: [],
    onAddContextEntity: vi.fn(),
    onDraftContextRefsChange: vi.fn(),
    onRemoveContextEntity: vi.fn(),
    pendingRefs: [],
    regenerate: vi.fn(),
    sendMessage: vi.fn(),
    sessionId: "chat-session-1",
    setMessages: vi.fn(),
    status: "ready" as const,
    stop: vi.fn(),
  },
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: vi.fn(),
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: {
      mode: mocks.chatMode.current,
      sendEvent: mocks.sendEvent,
    },
  }),
}));

vi.mock("./chat-panel", () => ({
  ChatPanelFrame: ({
    layout,
    onDraftContentChange,
    onOpenLeftPanel,
    onOpenRightPanel,
    sessionProps,
  }: {
    layout?: "floating" | "right-panel";
    onDraftContentChange?: (hasDraftContent: boolean) => void;
    onOpenLeftPanel?: () => void;
    onOpenRightPanel?: () => void;
    sessionProps: unknown;
  }) => (
    <>
      <button
        data-has-session={String(sessionProps === mocks.sessionProps)}
        data-layout={layout}
        data-testid="open-left-panel"
        type="button"
        onClick={onOpenLeftPanel}
      >
        Open left panel
      </button>
      <button
        data-has-session={String(sessionProps === mocks.sessionProps)}
        data-layout={layout}
        data-testid="open-right-panel"
        type="button"
        onClick={onOpenRightPanel}
      >
        Open right panel
      </button>
      <button
        data-testid="mark-draft-content"
        type="button"
        onClick={() => onDraftContentChange?.(true)}
      >
        Mark draft content
      </button>
      <div data-testid="chat-view" />
    </>
  ),
}));

import { PersistentChatPanel, resolveDockAction } from "./persistent-chat";

function TestHost() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} data-testid="full-panel-container">
      <div data-chat-floating-anchor />
      <PersistentChatPanel
        floatingContainerRef={containerRef}
        sessionProps={mocks.sessionProps}
      />
    </div>
  );
}

describe("PersistentChatPanel", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    mocks.chatMode.current = "FloatingOpen";
    mocks.sendEvent.mockClear();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  });

  it("anchors the floating panel to the bottom center of the note surface", async () => {
    render(<TestHost />);

    await screen.findByTestId("chat-view");

    expect(screen.getByTestId("open-right-panel").dataset.hasSession).toBe(
      "true",
    );
    const floatingFrame = document.querySelector("[data-chat-floating-frame]");
    const floatingOverlay = floatingFrame?.parentElement;
    const panel = document.querySelector<HTMLElement>("[data-chat-panel]");

    await waitFor(() => {
      expect(floatingOverlay?.parentElement).toBe(document.body);
      expect(floatingOverlay?.className).not.toContain("z-");
      expect(floatingFrame?.className).toContain("items-end");
      expect(floatingFrame?.className).toContain("justify-center");
      expect(floatingFrame?.className).toContain("px-3");
      expect(floatingFrame?.className).toContain("pb-2");
      expect((floatingFrame as HTMLElement | null)?.style.paddingTop).toBe(
        "46px",
      );
      expect(floatingFrame?.className).not.toContain("pt-4");
      expect(floatingFrame?.className).not.toContain("pb-3");
      expect(panel?.style.width).toBe("100%");
      expect(panel?.style.minWidth).toBe("min(476px, 100%)");
      expect(panel?.style.maxWidth).toBe("648px");
      expect(panel?.style.height).toBe("");
      expect(panel?.style.maxHeight).toBe("100%");
      expect(panel?.style.transformOrigin).toBe("bottom center");
      expect(panel?.style.willChange).toBe("transform");
      expect(panel?.style.clipPath).toBe("");
      expect(panel?.className).toContain("rounded-[24px]");
      expect(panel?.dataset.chatPanelReveal).toBe("lift");
    });
  });

  it("opens the docked right panel from the toolbar action", async () => {
    render(<TestHost />);

    await screen.findByTestId("chat-view");

    fireEvent.click(screen.getByTestId("open-right-panel"));

    expect(mocks.sendEvent).toHaveBeenCalledWith({
      type: "OPEN_RIGHT_PANEL",
    });
  });

  it("closes on backdrop click while the draft is empty", async () => {
    render(<TestHost />);

    await screen.findByTestId("chat-view");

    const floatingFrame = document.querySelector<HTMLElement>(
      "[data-chat-floating-frame]",
    );

    fireEvent.click(floatingFrame!);

    expect(mocks.sendEvent).toHaveBeenCalledWith({ type: "CLOSE" });
  });

  it("keeps the expanded composer open on backdrop click when draft has content", async () => {
    render(<TestHost />);

    await screen.findByTestId("chat-view");

    fireEvent.click(screen.getByTestId("mark-draft-content"));
    mocks.sendEvent.mockClear();

    const floatingFrame = document.querySelector<HTMLElement>(
      "[data-chat-floating-frame]",
    );

    fireEvent.click(floatingFrame!);

    expect(mocks.sendEvent).not.toHaveBeenCalledWith({ type: "CLOSE" });
  });

  it("exposes a drag handle and a resize handle so the panel can be repositioned and resized", async () => {
    render(<TestHost />);

    await screen.findByTestId("chat-view");

    const panel = document.querySelector<HTMLElement>("[data-chat-panel]");

    expect(panel).toBeTruthy();
    expect(document.querySelector("[data-chat-drag-handle]")).not.toBeNull();
    expect(document.querySelector("[data-chat-resize-handle]")).not.toBeNull();
  });

  it("persists the dragged offset, which is what the overlay position is derived from", async () => {
    render(<TestHost />);

    await screen.findByTestId("chat-view");

    const dragHandle = document.querySelector<HTMLElement>(
      "[data-chat-drag-handle]",
    )!;

    fireEvent.mouseDown(dragHandle, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 130, clientY: 80 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("ask-mentari-panel-layout")!,
      );
      expect(stored.dx).toBe(30);
      expect(stored.dy).toBe(-20);
    });
  });

  it("opens the docked left panel from the toolbar action", async () => {
    render(<TestHost />);

    await screen.findByTestId("chat-view");

    fireEvent.click(screen.getByTestId("open-left-panel"));

    expect(mocks.sendEvent).toHaveBeenCalledWith({
      type: "OPEN_LEFT_PANEL",
    });
  });

  it("hides the floating panel when the chat moves to the right panel", async () => {
    const { rerender } = render(<TestHost />);

    await screen.findByTestId("chat-view");

    mocks.chatMode.current = "RightPanelOpen";
    rerender(<TestHost />);

    await waitFor(() => {
      expect(
        document.querySelector<HTMLElement>("[data-chat-panel]"),
      ).toBeNull();
    });
  });

  it("hides the floating panel when the chat moves to the left panel", async () => {
    const { rerender } = render(<TestHost />);

    await screen.findByTestId("chat-view");

    mocks.chatMode.current = "LeftPanelOpen";
    rerender(<TestHost />);

    await waitFor(() => {
      expect(
        document.querySelector<HTMLElement>("[data-chat-panel]"),
      ).toBeNull();
    });
  });

  it("resolves a release near the right edge to opening the real docked right panel", () => {
    const containerRect = { top: 0, left: 0, width: 1000, height: 600 };

    expect(resolveDockAction(containerRect, { clientX: 970 })).toBe(
      "open-right-panel",
    );
  });

  it("resolves a release near the left edge to opening the real docked left panel", () => {
    const containerRect = { top: 0, left: 0, width: 1000, height: 600 };

    expect(resolveDockAction(containerRect, { clientX: 30 })).toBe(
      "open-left-panel",
    );
  });

  it("does nothing when released away from either edge", () => {
    const containerRect = { top: 0, left: 0, width: 1000, height: 600 };

    expect(resolveDockAction(containerRect, { clientX: 500 })).toBeNull();
  });

  it("does nothing when the container rect hasn't been measured yet", () => {
    expect(resolveDockAction(null, { clientX: 970 })).toBeNull();
  });

  // A live drag-to-edge dispatch (mouseDown/mouseMove/mouseUp ending near an
  // edge, asserting the resulting chat.sendEvent call) isn't covered here:
  // containerRect is derived from a ResizeObserver + getBoundingClientRect
  // in a useLayoutEffect that never resolves to non-null in this portal +
  // nested-ref test setup (confirmed directly — the floating overlay stays
  // at `style="display: none"` throughout), a pre-existing JSDOM
  // limitation unrelated to this feature. The edge-resolution decision
  // itself (resolveDockAction, above) and each dispatch path individually
  // (the toolbar-action tests, above) are covered instead.
});
