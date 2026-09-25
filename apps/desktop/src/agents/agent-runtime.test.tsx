import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startAgentRun: vi.fn().mockResolvedValue({ outcome: "satisfied" }),
  model: { id: "fake" } as unknown,
  conn: { providerId: "claude", baseUrl: "https://api.anthropic.com/v1" } as {
    providerId: string;
    baseUrl: string;
  } | null,
  approvals: [] as string[],
  auth: { session: { user: { id: "user-1" } } } as {
    session: { user: { id: string } } | null;
  } | null,
  search: vi.fn().mockResolvedValue([]),
}));

vi.mock("./runtime", () => ({ startAgentRun: mocks.startAgentRun }));
vi.mock("~/ai/hooks/useLLMConnection", () => ({
  useLanguageModel: () => mocks.model,
  useLLMConnection: () => ({ conn: mocks.conn }),
}));
vi.mock("~/auth/auth-context", () => ({
  useOptionalAuth: () => mocks.auth,
}));
vi.mock("~/shared/config", () => ({ useConfigValue: () => mocks.approvals }));
vi.mock("~/clinical/repository", () => ({
  searchClinicalEvidence: mocks.search,
}));
vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: { getState: () => ({ liveSegments: [] }) },
}));

import { AgentRuntime } from "./agent-runtime";
import { useAgentPanels } from "./panels";

beforeEach(() => {
  useAgentPanels.setState({ order: [], runs: {}, controls: {} });
  mocks.startAgentRun.mockClear();
  mocks.search.mockClear();
  mocks.model = { id: "fake" };
  mocks.conn = {
    providerId: "claude",
    baseUrl: "https://api.anthropic.com/v1",
  };
  mocks.approvals = [];
  mocks.auth = { session: { user: { id: "user-1" } } };
});
afterEach(cleanup);

describe("AgentRuntime", () => {
  it("runs an agent the picker just started", async () => {
    render(<AgentRuntime />);

    useAgentPanels.getState().start("research", "a claim");

    await waitFor(() => expect(mocks.startAgentRun).toHaveBeenCalledTimes(1));
    expect(mocks.startAgentRun.mock.calls[0]?.[0]).toMatchObject({
      role: "research",
      goal: "a claim",
    });
  });

  it("starts each goal once, however often the store updates", async () => {
    render(<AgentRuntime />);
    useAgentPanels.getState().start("research", "a claim");
    await waitFor(() => expect(mocks.startAgentRun).toHaveBeenCalledTimes(1));

    useAgentPanels.getState().raise("research");
    useAgentPanels.getState().open("explainer");

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocks.startAgentRun).toHaveBeenCalledTimes(1);
  });

  it("runs agents concurrently rather than queueing them", async () => {
    render(<AgentRuntime />);

    useAgentPanels.getState().start("research", "a claim");
    useAgentPanels.getState().start("explainer", "a term");

    await waitFor(() => expect(mocks.startAgentRun).toHaveBeenCalledTimes(2));
    expect(
      mocks.startAgentRun.mock.calls.map((call) => call[0].role).sort(),
    ).toEqual(["explainer", "research"]);
  });

  it("still runs for a signed-out, local-first user", async () => {
    mocks.auth = null;
    render(<AgentRuntime />);

    useAgentPanels.getState().start("research", "a claim");

    await waitFor(() => expect(mocks.startAgentRun).toHaveBeenCalledTimes(1));
  });

  it("waits rather than running when no model is configured", async () => {
    mocks.model = null;
    render(<AgentRuntime />);

    useAgentPanels.getState().start("research", "a claim");

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocks.startAgentRun).not.toHaveBeenCalled();
  });

  it("treats a BAA-approved provider as attested", async () => {
    mocks.approvals = ["llm:claude"];
    render(<AgentRuntime />);

    useAgentPanels.getState().start("research", "a claim");

    await waitFor(() => expect(mocks.startAgentRun).toHaveBeenCalled());
    // The runner is built from the route; exercising it proves the wiring.
    const { runTools } = mocks.startAgentRun.mock.calls[0]![0];
    const [result] = await runTools(
      [
        {
          tool: "search_evidence",
          input: "sepsis",
          requiresNetwork: true,
          containsPhi: true,
        },
      ],
      new AbortController().signal,
    );
    expect(result.blocked).toBeUndefined();
  });

  it("blocks a PHI search when the provider is not attested", async () => {
    mocks.approvals = [];
    mocks.auth = { session: { user: { id: "user-1" } } };
    render(<AgentRuntime />);

    useAgentPanels.getState().start("research", "a claim");

    await waitFor(() => expect(mocks.startAgentRun).toHaveBeenCalled());
    const { runTools } = mocks.startAgentRun.mock.calls[0]![0];
    const [result] = await runTools(
      [
        {
          tool: "search_evidence",
          input: "sepsis",
          requiresNetwork: true,
          containsPhi: true,
        },
      ],
      new AbortController().signal,
    );
    expect(result.blocked).toBe(true);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
