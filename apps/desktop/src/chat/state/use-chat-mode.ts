import { useCallback, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useChatContext } from "./chat-context";

import { useSessionTab } from "~/chat/components/use-session-tab";
import type { ChatScope } from "~/chat/types";
import { useTabs } from "~/store/zustand/tabs";

export type { ChatEvent, ChatMode } from "~/store/zustand/tabs";

// Used when no note is in focus at all (e.g. a settings tab reached
// without ever having opened a note this session) — falls back to a
// single shared thread rather than a per-note one.
const UNATTACHED_NOTE_KEY = "unattached";

export function useChatMode() {
  const mode = useTabs((state) => state.chatMode);
  const transitionChatMode = useTabs((state) => state.transitionChatMode);
  const scope = useTabs(
    (state): ChatScope =>
      state.currentTab?.type === "automations" ? "automations" : "general",
  );

  // Keeps the "general" thread scoped to whichever note is active, so
  // switching notes shows that note's own Ask Mentari conversation instead
  // of whatever was last on screen.
  const { currentSessionId } = useSessionTab();
  const noteKey = currentSessionId ?? UNATTACHED_NOTE_KEY;
  const switchNote = useChatContext((state) => state.switchNote);
  const previousNoteKeyRef = useRef(noteKey);
  useEffect(() => {
    if (previousNoteKeyRef.current === noteKey) {
      return;
    }
    switchNote(previousNoteKeyRef.current, noteKey);
    previousNoteKeyRef.current = noteKey;
  }, [noteKey, switchNote]);

  const selection = useChatContext((state) => state.chatByScope[scope]);
  const setScopedGroupId = useChatContext((state) => state.setGroupId);
  const rollbackFailedScopedGroup = useChatContext(
    (state) => state.rollbackFailedGroup,
  );
  const startNewScopedChat = useChatContext((state) => state.startNewChat);
  const selectScopedChat = useChatContext((state) => state.selectChat);

  const setGroupId = useCallback(
    (groupId: string | undefined) => setScopedGroupId(scope, groupId),
    [scope, setScopedGroupId],
  );
  const rollbackFailedGroup = useCallback(
    (failedGroupId: string) => rollbackFailedScopedGroup(scope, failedGroupId),
    [rollbackFailedScopedGroup, scope],
  );
  const startNewChat = useCallback(
    () => startNewScopedChat(scope),
    [scope, startNewScopedChat],
  );
  const selectChat = useCallback(
    (groupId: string) => selectScopedChat(scope, groupId),
    [scope, selectScopedChat],
  );

  useHotkeys(
    "mod+j",
    () => {
      transitionChatMode({ type: "TOGGLE" });
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [transitionChatMode],
  );

  return {
    mode,
    scope,
    sendEvent: transitionChatMode,
    groupId: selection.groupId,
    sessionId: selection.sessionId,
    setGroupId,
    rollbackFailedGroup,
    startNewChat,
    selectChat,
  };
}
