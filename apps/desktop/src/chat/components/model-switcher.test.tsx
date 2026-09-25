import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: {
    current_llm_provider: "chatgpt",
    current_llm_model: "gpt-5.4",
  } as Record<string, string | undefined>,
  providers: {} as Record<
    string,
    { configured: boolean; listModels?: () => Promise<{ models: string[] }> }
  >,
  setSettingValues: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));

vi.mock("~/settings/ai/llm/select", () => ({
  useConfiguredMapping: () => ({ providers: mocks.providers, isReady: true }),
}));

vi.mock("~/settings/queries", () => ({
  setSettingValues: mocks.setSettingValues,
}));

vi.mock("@anlg/ui/components/ui/dropdown-menu", () => ({
  AppFloatingPanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

import { ModelSwitcher, useCurrentChatModelLabel } from "./model-switcher";

function renderSwitcher() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ModelSwitcher />
    </QueryClientProvider>,
  );
}

function TestLabel() {
  const label = useCurrentChatModelLabel();
  return (
    <span>
      {label ? `${label.providerDisplayName} / ${label.modelId}` : "none"}
    </span>
  );
}

describe("useCurrentChatModelLabel", () => {
  afterEach(cleanup);

  it("resolves the configured provider's display name and current model", () => {
    render(<TestLabel />);

    expect(screen.getByText("ChatGPT / gpt-5.4")).not.toBeNull();
  });

  it("returns null when no model is selected yet", () => {
    mocks.config.current_llm_provider = undefined;
    mocks.config.current_llm_model = undefined;

    render(<TestLabel />);

    expect(screen.getByText("none")).not.toBeNull();

    mocks.config.current_llm_provider = "chatgpt";
    mocks.config.current_llm_model = "gpt-5.4";
  });
});

describe("ModelSwitcher", () => {
  afterEach(() => {
    cleanup();
    mocks.setSettingValues.mockClear();
    mocks.providers = {};
  });

  it("renders nothing when no provider is configured", () => {
    const { container } = renderSwitcher();

    expect(container.firstChild).toBeNull();
  });

  it("shows configured providers, then models, and switches on selection", async () => {
    mocks.providers = {
      chatgpt: {
        configured: true,
        listModels: () => Promise.resolve({ models: ["gpt-5.4", "gpt-5.5"] }),
      },
      claude: {
        configured: true,
        listModels: () => Promise.resolve({ models: [] }),
      },
    };

    renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));

    expect(await screen.findByText("ChatGPT")).not.toBeNull();
    expect(screen.getByText("Claude")).not.toBeNull();

    fireEvent.click(screen.getByText("ChatGPT"));

    expect(await screen.findByText("gpt-5.5")).not.toBeNull();

    fireEvent.click(screen.getByText("gpt-5.5"));

    await waitFor(() =>
      expect(mocks.setSettingValues).toHaveBeenCalledWith({
        current_llm_provider: "chatgpt",
        current_llm_model: "gpt-5.5",
      }),
    );
  });
});
