import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdentifier: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: mocks.getIdentifier,
}));

import { getScheme } from "./utils";

describe("getScheme", () => {
  beforeEach(() => {
    mocks.getIdentifier.mockReset();
  });

  it.each([
    ["com.hyprnote.stable", "mentari"],
    ["com.hyprnote.Hyprnote", "mentari"],
    ["com.hyprnote.staging", "mentari-staging"],
    ["com.hyprnote.dev", "mentari-dev"],
    ["so.anarlog.Mentari", "mentari"],
    ["com.anarlog.dev", "mentari-dev"],
    ["unknown", "mentari"],
  ])("maps %s to %s", async (identifier, scheme) => {
    mocks.getIdentifier.mockResolvedValue(identifier);

    await expect(getScheme()).resolves.toBe(scheme);
  });
});
