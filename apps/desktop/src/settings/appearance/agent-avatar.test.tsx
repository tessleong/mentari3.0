import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setAgentAvatarSeed: vi.fn(),
  agentAvatarSeed: "mentari-agent-21",
}));

vi.mock("~/settings/queries", () => ({
  useSetSettingValue: () => mocks.setAgentAvatarSeed,
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => mocks.agentAvatarSeed,
}));

import { AgentAvatarSelector } from "./agent-avatar";

import { AGENT_AVATAR_SEEDS } from "~/chat/agent-avatar";

describe("AgentAvatarSelector", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.agentAvatarSeed = "mentari-agent-21";
  });

  it("renders every curated seed as a selectable option", () => {
    render(<AgentAvatarSelector />);

    const options = within(
      screen.getByRole("radiogroup", { name: "Agent avatar" }),
    ).getAllByRole("radio");
    expect(options).toHaveLength(AGENT_AVATAR_SEEDS.length);
  });

  it("marks the stored seed as selected", () => {
    mocks.agentAvatarSeed = "mentari-agent-9";

    render(<AgentAvatarSelector />);

    expect(
      screen
        .getByRole("radio", { name: "Twilight" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: "Aurora" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("stores the selected seed", () => {
    render(<AgentAvatarSelector />);

    fireEvent.click(screen.getByRole("radio", { name: "Ocean" }));

    expect(mocks.setAgentAvatarSeed).toHaveBeenCalledWith("mentari-agent-17");
  });

  it("falls back to the default seed for an unrecognized stored value", () => {
    mocks.agentAvatarSeed = "not-a-real-seed";

    render(<AgentAvatarSelector />);

    expect(
      screen
        .getByRole("radio", { name: "Aurora" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});
