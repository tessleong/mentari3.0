import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }));

vi.mock("./list-common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./list-common")>()),
  fetchJson: mocks.fetchJson,
}));

import { listAnthropicModels } from "./list-anthropic";

const catalog = {
  data: [
    {
      type: "model",
      id: "claude-opus-5",
      display_name: "Claude Opus 5",
      created_at: "2026-04-01T00:00:00Z",
    },
  ],
  has_more: false,
  first_id: "claude-opus-5",
  last_id: "claude-opus-5",
};

const headersOf = () =>
  (mocks.fetchJson.mock.calls[0]?.[1] ?? {}) as Record<string, string>;

describe("listAnthropicModels", () => {
  beforeEach(() => {
    mocks.fetchJson.mockReset();
    mocks.fetchJson.mockReturnValue(Effect.succeed(catalog));
  });

  test("sends the API key as x-api-key by default", async () => {
    await listAnthropicModels("https://api.anthropic.com/v1", "sk-test");

    expect(headersOf()["x-api-key"]).toBe("sk-test");
    expect(headersOf().Authorization).toBeUndefined();
  });

  test("sends an OAuth token as a bearer token", async () => {
    await listAnthropicModels("https://api.anthropic.com/v1", "oauth-token", {
      authorization: "bearer",
    });

    expect(headersOf().Authorization).toBe("Bearer oauth-token");
    expect(headersOf()["x-api-key"]).toBeUndefined();
  });

  // An OAuth token is rejected without the oauth beta header, and the failure is
  // swallowed into an empty catalog, so the caller silently falls back.
  test("forwards caller-supplied headers such as the oauth beta flag", async () => {
    await listAnthropicModels("https://api.anthropic.com/v1", "oauth-token", {
      authorization: "bearer",
      headers: { "anthropic-beta": "oauth-2025-04-20" },
    });

    expect(headersOf()["anthropic-beta"]).toBe("oauth-2025-04-20");
    expect(headersOf().Authorization).toBe("Bearer oauth-token");
  });

  test("keeps its own version header when callers pass extras", async () => {
    await listAnthropicModels("https://api.anthropic.com/v1", "oauth-token", {
      authorization: "bearer",
      headers: { "anthropic-beta": "oauth-2025-04-20" },
    });

    expect(headersOf()["anthropic-version"]).toBe("2023-06-01");
  });
});
