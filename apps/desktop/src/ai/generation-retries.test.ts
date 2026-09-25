import { describe, expect, it } from "vitest";

import { getGenerationMaxRetries } from "./generation-retries";

describe("getGenerationMaxRetries", () => {
  it("fails fast for direct Google models so exhausted quotas do not loop", () => {
    expect(
      getGenerationMaxRetries({ provider: "google.generative-ai" } as any),
    ).toBe(0);
  });

  it("keeps transient provider retries for other models", () => {
    expect(
      getGenerationMaxRetries({ provider: "openai.responses" } as any),
    ).toBe(4);
  });
});
