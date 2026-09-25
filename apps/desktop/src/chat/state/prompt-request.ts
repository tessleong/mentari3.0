import { create } from "zustand";

type ChatPromptRequest = {
  id: number;
  text: string;
};

let nextRequestId = 1;

export const useChatPromptRequest = create<{
  request: ChatPromptRequest | null;
  setRequest: (text: string) => void;
  consumeRequest: (id: number) => void;
}>((set) => ({
  request: null,
  setRequest: (text) =>
    set({ request: { id: nextRequestId++, text: text.trim() } }),
  consumeRequest: (id) =>
    set((state) => (state.request?.id === id ? { request: null } : state)),
}));

export function requestChatPrompt(text: string) {
  useChatPromptRequest.getState().setRequest(text);
}
