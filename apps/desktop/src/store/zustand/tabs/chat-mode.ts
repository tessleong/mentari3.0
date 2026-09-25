import type { StoreApi } from "zustand";

export type ChatMode =
  | "FloatingOpen"
  | "FloatingClosed"
  | "RightPanelOpen"
  | "LeftPanelOpen";

export type ChatEvent =
  | { type: "OPEN" }
  | { type: "OPEN_FLOATING" }
  | { type: "OPEN_RIGHT_PANEL" }
  | { type: "OPEN_LEFT_PANEL" }
  | { type: "CLOSE" }
  | { type: "TOGGLE" };

export type ChatModeState = {
  chatMode: ChatMode;
};

export type ChatModeActions = {
  transitionChatMode: (event: ChatEvent) => void;
};

const computeNextChatMode = (state: ChatMode, event: ChatEvent): ChatMode => {
  if (event.type === "OPEN") {
    return "RightPanelOpen";
  }
  if (event.type === "OPEN_FLOATING") {
    return "FloatingOpen";
  }

  switch (state) {
    case "FloatingOpen":
      if (event.type === "CLOSE" || event.type === "TOGGLE") {
        return "FloatingClosed";
      }
      if (event.type === "OPEN_RIGHT_PANEL") {
        return "RightPanelOpen";
      }
      if (event.type === "OPEN_LEFT_PANEL") {
        return "LeftPanelOpen";
      }
      return state;
    case "RightPanelOpen":
      if (event.type === "CLOSE" || event.type === "TOGGLE") {
        return "FloatingClosed";
      }
      if (event.type === "OPEN_LEFT_PANEL") {
        return "LeftPanelOpen";
      }
      return state;
    case "LeftPanelOpen":
      if (event.type === "CLOSE" || event.type === "TOGGLE") {
        return "FloatingClosed";
      }
      if (event.type === "OPEN_RIGHT_PANEL") {
        return "RightPanelOpen";
      }
      return state;
    case "FloatingClosed":
      if (event.type === "TOGGLE") {
        return "RightPanelOpen";
      }
      if (event.type === "OPEN_RIGHT_PANEL") {
        return "RightPanelOpen";
      }
      if (event.type === "OPEN_LEFT_PANEL") {
        return "LeftPanelOpen";
      }
      return state;
    default:
      return state;
  }
};

export const createChatModeSlice = <T extends ChatModeState>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): ChatModeState & ChatModeActions => ({
  chatMode: "FloatingClosed",
  transitionChatMode: (event) => {
    const currentMode = get().chatMode;
    const nextMode = computeNextChatMode(currentMode, event);
    if (nextMode === currentMode) return;

    set({
      chatMode: nextMode,
    } as Partial<T>);
  },
});
