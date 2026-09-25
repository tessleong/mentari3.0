import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/chat/components/message/normal", () => ({
  NormalMessage: () => <div data-testid="normal-message" />,
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => undefined,
  useConfigValues: () => ({}),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: () => Promise.resolve("com.hyprnote.stable"),
}));

import { ChatBodyNonEmpty } from "./non-empty";

import type { AnlgUIMessage } from "~/chat/types";

afterEach(cleanup);

function renderNonEmpty(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("ChatBodyNonEmpty", () => {
  it("shows thinking while waiting for content after a completed tool call", () => {
    renderNonEmpty(
      <ChatBodyNonEmpty
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "tool-search_meetings",
                toolCallId: "search-1",
                state: "output-available",
                input: { query: "defcon" },
                output: { results: [] },
              },
            ],
          } as AnlgUIMessage,
        ]}
        status="streaming"
      />,
    );

    expect(screen.getByText("Thinking...")).not.toBeNull();
  });

  it("shows thinking when the next model step has started", () => {
    renderNonEmpty(
      <ChatBodyNonEmpty
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              { type: "text", text: "Earlier response", state: "done" },
              { type: "step-start" },
            ],
          } as AnlgUIMessage,
        ]}
        status="streaming"
      />,
    );

    expect(screen.getByText("Thinking...")).not.toBeNull();
  });

  it("does not add a thinking row while response text is streaming", () => {
    renderNonEmpty(
      <ChatBodyNonEmpty
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "text",
                text: "Here is what I found",
                state: "streaming",
              },
            ],
          } as AnlgUIMessage,
        ]}
        status="streaming"
      />,
    );

    expect(screen.queryByText("Thinking...")).toBeNull();
  });
});
