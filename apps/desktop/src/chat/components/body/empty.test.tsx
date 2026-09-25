import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useCurrentNoteSources: vi.fn(() => [] as unknown[]),
}));

vi.mock("~/chat/hooks/use-chat-appearance", () => ({
  useChatAppearance: () => ({
    isDarkAppearance: false,
  }),
}));

vi.mock("~/chat/hooks/use-current-note-sources", () => ({
  useCurrentNoteSources: mocks.useCurrentNoteSources,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: () => vi.fn(),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => undefined,
  useConfigValues: () => ({}),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: () => Promise.resolve("com.hyprnote.stable"),
}));

import { ChatBodyEmpty } from "./empty";

function renderEmpty(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("ChatBodyEmpty", () => {
  beforeEach(() => {
    cleanup();
    mocks.useCurrentNoteSources.mockReturnValue([]);
  });

  it("renders context suggestions as short list rows without intro copy", () => {
    const onSendMessage = vi.fn();

    renderEmpty(<ChatBodyEmpty hasContext onSendMessage={onSendMessage} />);

    expect(screen.queryByText("Mentari AI")).toBeNull();
    expect(screen.queryByText(/Hi, I'm Mentari AI/i)).toBeNull();

    const actionItem = screen.getByRole("button", {
      name: "List action items.",
    });
    const followUp = screen.getByRole("button", {
      name: "Draft follow-up email.",
    });
    const decisions = screen.getByRole("button", {
      name: "Find key decisions.",
    });

    expect(actionItem.className).toContain("w-full");
    expect(actionItem.className).toContain("grid");
    expect(actionItem.className).toContain("grid-cols-[1.5rem_minmax(0,1fr)]");
    expect(actionItem.className).toContain("gap-x-1.5");
    expect(actionItem.className).toContain("hover:bg-muted/55");
    expect(actionItem.className).toContain("text-left");
    expect(actionItem.firstElementChild?.className).toContain("size-6");
    expect(followUp.className).toContain("w-full");
    expect(decisions.className).toContain("w-full");

    fireEvent.click(decisions);

    expect(onSendMessage).toHaveBeenCalledWith(
      "What were the key decisions that have been made?",
      [
        {
          type: "text",
          text: "What were the key decisions that have been made?",
        },
      ],
    );
  });

  it("shows the thinking indicator while a first message is in flight, before any assistant message exists", () => {
    renderEmpty(<ChatBodyEmpty hasContext status="submitted" />);

    expect(screen.getByText("Thinking...")).not.toBeNull();
  });

  it("keeps showing the thinking indicator while streaming has started but no messages exist yet", () => {
    renderEmpty(<ChatBodyEmpty hasContext status="streaming" />);

    expect(screen.getByText("Thinking...")).not.toBeNull();
  });

  it("does not show the thinking indicator once ready", () => {
    renderEmpty(<ChatBodyEmpty hasContext status="ready" />);

    expect(screen.queryByText("Thinking...")).toBeNull();
  });

  it("always includes a suggestion grounded in the top cited source in patient context", () => {
    mocks.useCurrentNoteSources.mockReturnValue([
      {
        article: {
          id: "article-1",
          title: "Managing hypertension in primary care",
        },
        excerpt: "Lifestyle changes reduce blood pressure.",
      },
    ]);
    const onSendMessage = vi.fn();

    renderEmpty(
      <ChatBodyEmpty
        sessionId="session-1"
        hasContext
        isPatientContext
        onSendMessage={onSendMessage}
      />,
    );

    const sourceButton = screen.getByRole("button", {
      name: 'Ask about "Managing hypertension in primary care".',
    });
    fireEvent.click(sourceButton);

    expect(onSendMessage).toHaveBeenCalledWith(
      'How does the study "Managing hypertension in primary care" relate to what was discussed in this visit?',
      [
        {
          type: "text",
          text: 'How does the study "Managing hypertension in primary care" relate to what was discussed in this visit?',
        },
      ],
    );
  });
});
