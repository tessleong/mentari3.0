import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => "macos"),
  openCurrent: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: mocks.platform,
}));

vi.mock("~/shared/main", () => ({
  StandardContentWrapper: ({
    children,
    floatingButton,
  }: {
    children: React.ReactNode;
    floatingButton?: React.ReactNode;
  }) => (
    <div>
      {children}
      {floatingButton}
    </div>
  ),
}));

vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => vi.fn(),
  useNewNoteAndListen: () => vi.fn(),
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: {
      mode: "FloatingClosed",
      sendEvent: vi.fn(),
    },
  }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (
    selector: (state: { openCurrent: typeof mocks.openCurrent }) => unknown,
  ) =>
    selector({
      openCurrent: mocks.openCurrent,
    }),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: () => Promise.resolve("com.hyprnote.stable"),
}));

import { TabContentEmpty } from "./empty";

function renderEmpty(tab: React.ComponentProps<typeof TabContentEmpty>["tab"]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TabContentEmpty tab={tab} />
    </QueryClientProvider>,
  );
}

describe("TabContentEmpty", () => {
  afterEach(() => {
    cleanup();
    mocks.platform.mockReturnValue("macos");
    mocks.openCurrent.mockReset();
  });

  it("shows the home actions and global chat FAB", () => {
    renderEmpty({
      active: true,
      pinned: false,
      slotId: "slot-home",
      type: "empty",
    });

    expect(screen.getByRole("button", { name: /New Note/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ask Mentari anything" }),
    ).toBeTruthy();
  });

  it("shows Windows shortcut modifiers", () => {
    mocks.platform.mockReturnValue("windows");

    renderEmpty({
      active: true,
      pinned: false,
      slotId: "slot-home",
      type: "empty",
    });

    expect(
      screen.getByRole("button", { name: /New Note/ }).textContent,
    ).toContain("Ctrl N");
    expect(
      screen.getByRole("button", { name: /Start Recording/ }).textContent,
    ).toContain("Ctrl ⇧ N");
  });

  it("centers actions in a draggable empty surface while keeping actions clickable", () => {
    renderEmpty({
      active: true,
      pinned: false,
      slotId: "slot-home",
      type: "empty",
    });

    const newNoteButton = screen.getByRole("button", { name: /New Note/ });
    const dragSurface = newNoteButton.closest("[data-tauri-drag-region]");

    expect(dragSurface?.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(dragSurface?.className).not.toContain("mb-12");
    expect(newNoteButton.getAttribute("data-tauri-drag-region")).toBe("false");
    expect(
      screen
        .getByRole("button", { name: /Start Recording/ })
        .getAttribute("data-tauri-drag-region"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: /Configure providers/ })
        .getAttribute("data-tauri-drag-region"),
    ).toBe("false");
  });

  it("defaults to the new-note/recording actions instead of the clinical evidence console", () => {
    renderEmpty({
      active: true,
      pinned: false,
      slotId: "slot-home",
      type: "empty",
    });

    expect(screen.queryByText(/PubMed query/i)).toBeNull();
    expect(screen.queryByText(/Ranked evidence/i)).toBeNull();
    expect(screen.getByRole("button", { name: /New Note/ })).toBeTruthy();
  });
});
