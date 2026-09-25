import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatMode: "FloatingClosed" as
    | "FloatingClosed"
    | "FloatingOpen"
    | "RightPanelOpen",
  sendEvent: vi.fn(),
  config: {} as Record<string, string | undefined>,
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: {
      mode: mocks.chatMode,
      sendEvent: mocks.sendEvent,
    },
  }),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) => mocks.config[key],
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: () => Promise.resolve("com.hyprnote.stable"),
}));

import { ChatCTA, FloatingChatCTA } from "./chat-cta";

function renderCTA(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("ChatCTA", () => {
  beforeEach(() => {
    cleanup();
    mocks.chatMode = "FloatingClosed";
    mocks.sendEvent.mockClear();
    mocks.config = {};
  });

  it("opens the floating chat", () => {
    renderCTA(<ChatCTA />);

    const button = screen.getByRole("button", {
      name: "Ask Mentari anything",
    });

    fireEvent.click(button);

    expect(mocks.sendEvent).toHaveBeenCalledWith({ type: "OPEN" });
  });

  it("renders as a large circular badge, matching the app icon the user chose, that reveals an 'Ask Mentari' label on hover", async () => {
    mocks.config.app_icon = "twilight";
    renderCTA(<ChatCTA />);

    const button = screen.getByRole("button", {
      name: "Ask Mentari anything",
    });
    const surface = button.querySelector("[data-chat-cta-surface]");
    const label = screen.getByText("Ask Mentari");
    const badge = await waitFor(() => {
      const img = button.querySelector("img");
      if (!img) throw new Error("badge image not rendered yet");
      return img;
    });

    expect(button.hasAttribute("data-chat-cta-trigger")).toBe(true);
    expect(surface?.className).toContain("size-14");
    expect(surface?.className).toContain("rounded-full");
    expect(surface?.className).toContain(
      "group-hover/anarlog-chat-cta:scale-105",
    );
    expect(badge.getAttribute("src")).toBe("/assets/app-icons/twilight.png");
    expect(label.className).toContain("max-w-0");
    expect(label.className).toContain("opacity-0");
    expect(label.className).toContain("group-hover/anarlog-chat-cta:max-w-40");
    expect(label.className).toContain(
      "group-hover/anarlog-chat-cta:opacity-100",
    );
  });

  it("right-anchors the floating trigger", () => {
    renderCTA(<FloatingChatCTA />);

    const hoverZone = screen.getByRole("button", {
      name: "Ask Mentari anything",
    }).parentElement?.parentElement;

    expect(hoverZone?.className).toContain("right-4");
    expect(hoverZone?.className).toContain("bottom-4");
  });

  it("hides while the floating chat is open", () => {
    mocks.chatMode = "FloatingOpen";

    renderCTA(<ChatCTA />);

    expect(
      screen.queryByRole("button", { name: "Ask Mentari anything" }),
    ).toBeNull();
  });

  it("hides while the right panel chat is open", () => {
    mocks.chatMode = "RightPanelOpen";

    renderCTA(<ChatCTA />);

    expect(
      screen.queryByRole("button", { name: "Ask Mentari anything" }),
    ).toBeNull();
  });
});
