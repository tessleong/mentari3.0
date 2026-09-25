import { beforeEach, describe, expect, test } from "vitest";

import { useTabs } from ".";
import { createSessionTab, resetTabsStore } from "./test-utils";

describe("Chat Mode", () => {
  beforeEach(() => {
    resetTabsStore();
  });

  test("initial mode is FloatingClosed", () => {
    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test.each([
    "FloatingClosed",
    "FloatingOpen",
    "RightPanelOpen",
    "LeftPanelOpen",
  ] as const)("OPEN docks chat on the right from %s", (chatMode) => {
    useTabs.setState({ chatMode });
    useTabs.getState().transitionChatMode({ type: "OPEN" });
    expect(useTabs.getState().chatMode).toBe("RightPanelOpen");
  });

  test("TOGGLE from FloatingClosed to RightPanelOpen", () => {
    useTabs.getState().transitionChatMode({ type: "TOGGLE" });
    expect(useTabs.getState().chatMode).toBe("RightPanelOpen");
  });

  test("TOGGLE from FloatingOpen to FloatingClosed", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().transitionChatMode({ type: "TOGGLE" });
    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("OPEN_FLOATING from FloatingClosed to FloatingOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    expect(useTabs.getState().chatMode).toBe("FloatingOpen");
  });

  test("OPEN_RIGHT_PANEL from FloatingClosed to RightPanelOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    expect(useTabs.getState().chatMode).toBe("RightPanelOpen");
  });

  test("OPEN_RIGHT_PANEL from FloatingOpen to RightPanelOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    expect(useTabs.getState().chatMode).toBe("RightPanelOpen");
  });

  test("OPEN_FLOATING from RightPanelOpen to FloatingOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    expect(useTabs.getState().chatMode).toBe("FloatingOpen");
  });

  test("TOGGLE from RightPanelOpen to FloatingClosed", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    useTabs.getState().transitionChatMode({ type: "TOGGLE" });
    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("OPEN_LEFT_PANEL from FloatingClosed to LeftPanelOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    expect(useTabs.getState().chatMode).toBe("LeftPanelOpen");
  });

  test("OPEN_LEFT_PANEL from FloatingOpen to LeftPanelOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    expect(useTabs.getState().chatMode).toBe("LeftPanelOpen");
  });

  test("OPEN_LEFT_PANEL from RightPanelOpen to LeftPanelOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    expect(useTabs.getState().chatMode).toBe("LeftPanelOpen");
  });

  test("OPEN_RIGHT_PANEL from LeftPanelOpen to RightPanelOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    expect(useTabs.getState().chatMode).toBe("RightPanelOpen");
  });

  test("OPEN_FLOATING from LeftPanelOpen to FloatingOpen", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    expect(useTabs.getState().chatMode).toBe("FloatingOpen");
  });

  test("TOGGLE from LeftPanelOpen to FloatingClosed", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    useTabs.getState().transitionChatMode({ type: "TOGGLE" });
    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("CLOSE from LeftPanelOpen to FloatingClosed", () => {
    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    useTabs.getState().transitionChatMode({ type: "CLOSE" });
    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("no-op when event is irrelevant for current state", () => {
    useTabs.getState().transitionChatMode({ type: "CLOSE" });
    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("closing non-chat tab does not affect mode", () => {
    const session = createSessionTab();
    useTabs.getState().openNew(session);
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    expect(useTabs.getState().chatMode).toBe("FloatingOpen");

    const sessionTab = useTabs
      .getState()
      .tabs.find((t) => t.type === "sessions")!;
    useTabs.getState().close(sessionTab);
    expect(useTabs.getState().chatMode).toBe("FloatingOpen");
  });

  test("opening a different session closes the floating chat", () => {
    const first = createSessionTab({ id: "first" });
    const second = createSessionTab({ id: "second" });

    useTabs.getState().openNew(first);
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().openNew(second);

    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("opening the current session keeps the floating chat open", () => {
    const session = createSessionTab({ id: "session" });

    useTabs.getState().openNew(session);
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().openNew(createSessionTab({ id: session.id }));

    expect(useTabs.getState().chatMode).toBe("FloatingOpen");
  });

  test("selecting a different session closes the floating chat", () => {
    const first = createSessionTab({ id: "first" });
    const second = createSessionTab({ id: "second" });

    useTabs.getState().openNew(first);
    useTabs.getState().openNew(second);
    const firstTab = useTabs
      .getState()
      .tabs.find((tab) => tab.type === "sessions" && tab.id === first.id)!;

    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().select(firstTab);

    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("selecting a different session closes the right panel chat", () => {
    const first = createSessionTab({ id: "first" });
    const second = createSessionTab({ id: "second" });

    useTabs.getState().openNew(first);
    useTabs.getState().openNew(second);
    const firstTab = useTabs
      .getState()
      .tabs.find((tab) => tab.type === "sessions" && tab.id === first.id)!;

    useTabs.getState().transitionChatMode({ type: "OPEN_RIGHT_PANEL" });
    useTabs.getState().select(firstTab);

    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("selecting a different session closes the left panel chat", () => {
    const first = createSessionTab({ id: "first" });
    const second = createSessionTab({ id: "second" });

    useTabs.getState().openNew(first);
    useTabs.getState().openNew(second);
    const firstTab = useTabs
      .getState()
      .tabs.find((tab) => tab.type === "sessions" && tab.id === first.id)!;

    useTabs.getState().transitionChatMode({ type: "OPEN_LEFT_PANEL" });
    useTabs.getState().select(firstTab);

    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("cycling to the next session closes the floating chat", () => {
    const first = createSessionTab({ id: "first" });
    const second = createSessionTab({ id: "second" });

    useTabs.getState().openNew(first);
    useTabs.getState().openNew(second);
    useTabs
      .getState()
      .select(
        useTabs
          .getState()
          .tabs.find((tab) => tab.type === "sessions" && tab.id === first.id)!,
      );

    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().selectNext();

    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("cycling to the previous session closes the floating chat", () => {
    const first = createSessionTab({ id: "first" });
    const second = createSessionTab({ id: "second" });

    useTabs.getState().openNew(first);
    useTabs.getState().openNew(second);

    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().selectPrev();

    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("closing the active session closes the floating chat when another session becomes active", () => {
    const first = createSessionTab({ id: "first" });
    const second = createSessionTab({ id: "second" });

    useTabs.getState().openNew(first);
    useTabs.getState().openNew(second);
    const secondTab = useTabs
      .getState()
      .tabs.find((tab) => tab.type === "sessions" && tab.id === second.id)!;

    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });
    useTabs.getState().close(secondTab);

    expect(useTabs.getState().chatMode).toBe("FloatingClosed");
  });

  test("closeAll leaves the floating chat mode unchanged", () => {
    const session = createSessionTab();
    useTabs.getState().openNew(session);
    useTabs.getState().transitionChatMode({ type: "OPEN_FLOATING" });

    useTabs.getState().closeAll();
    expect(useTabs.getState().chatMode).toBe("FloatingOpen");
  });
});
