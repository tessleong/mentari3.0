import { create } from "zustand";

import type { ChatScope } from "~/chat/types";
import { id } from "~/shared/utils";

type ChatSelection = {
  groupId: string | undefined;
  sessionId: string;
};

interface ChatContextState {
  chatByScope: Record<ChatScope, ChatSelection>;
  // Each note keeps its own persistent "general"-scope thread, snapshotted
  // here under the note's session id whenever a different note becomes
  // active (see `switchNote`). Mirrors automations/selection.ts's
  // `chatBySelection`, including not being disk-persisted — a fresh app
  // launch starts every note with a clean thread again, but message
  // history already saved under a real groupId is unaffected.
  chatByNoteId: Record<string, ChatSelection>;
}

interface ChatContextActions {
  setGroupId: (scope: ChatScope, groupId: string | undefined) => void;
  rollbackFailedGroup: (scope: ChatScope, failedGroupId: string) => void;
  startNewChat: (scope: ChatScope) => void;
  selectChat: (scope: ChatScope, groupId: string) => void;
  // Snapshots the live "general" thread under `fromNoteId` and restores
  // whichever thread belongs to `toNoteId` (or a fresh one if it's never
  // been chatted with).
  switchNote: (fromNoteId: string, toNoteId: string) => void;
}

export const useChatContext = create<ChatContextState & ChatContextActions>(
  (set, get) => ({
    chatByScope: {
      general: createChatSelection(),
      automations: createChatSelection(),
    },
    chatByNoteId: {},
    setGroupId: (scope, groupId) =>
      set((state) => ({
        chatByScope: {
          ...state.chatByScope,
          [scope]: { ...state.chatByScope[scope], groupId },
        },
      })),
    // Compares against the live groupId, not a value captured when the send
    // started — the failure lands after onGroupCreated already updated it.
    rollbackFailedGroup: (scope, failedGroupId) =>
      set((state) => {
        const selection = state.chatByScope[scope];
        if (selection.groupId !== failedGroupId) {
          return state;
        }

        return {
          chatByScope: {
            ...state.chatByScope,
            [scope]: { ...selection, groupId: undefined },
          },
        };
      }),
    startNewChat: (scope) =>
      set((state) => ({
        chatByScope: {
          ...state.chatByScope,
          [scope]: createChatSelection(),
        },
      })),
    selectChat: (scope, groupId) =>
      set((state) => ({
        chatByScope: {
          ...state.chatByScope,
          [scope]: { groupId, sessionId: groupId },
        },
      })),
    switchNote: (fromNoteId, toNoteId) => {
      if (fromNoteId === toNoteId) {
        return;
      }

      const { chatByScope, chatByNoteId } = get();
      const nextChatByNoteId = {
        ...chatByNoteId,
        [fromNoteId]: chatByScope.general,
      };
      const restored = nextChatByNoteId[toNoteId] ?? createChatSelection();
      set({
        chatByNoteId: nextChatByNoteId,
        chatByScope: { ...chatByScope, general: restored },
      });
    },
  }),
);

function createChatSelection(): ChatSelection {
  return { groupId: undefined, sessionId: id() };
}
