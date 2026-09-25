import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openNew = vi.hoisted(() => vi.fn());

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { openNew: typeof openNew }) => unknown) =>
    selector({ openNew }),
}));

import { ConfigError } from "./config-error";

describe("ConfigError", () => {
  afterEach(() => {
    cleanup();
    openNew.mockReset();
  });

  it("offers API key setup from the empty summary state", () => {
    render(<ConfigError />);

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Set up AI summaries")).not.toBeNull();
    expect(
      screen.getByText(
        "Add your own LLM API key to generate a summary from this transcript.",
      ),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add API key" }));
    expect(openNew).toHaveBeenNthCalledWith(1, {
      type: "settings",
      state: { tab: "intelligence" },
    });
  });

  it("offers to review privacy settings when the provider needs BAA approval", () => {
    render(
      <ConfigError
        status={{
          status: "error",
          reason: "baa_not_approved",
          providerId: "google_generative_ai",
        }}
      />,
    );

    expect(screen.getByText("Provider needs BAA approval")).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Review privacy settings" }),
    );
    expect(openNew).toHaveBeenNthCalledWith(1, {
      type: "settings",
      state: { tab: "privacy" },
    });
  });
});
