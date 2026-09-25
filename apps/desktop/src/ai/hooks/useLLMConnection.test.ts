import { describe, expect, it } from "vitest";

import {
  normalizeLLMProviderId,
  resolveLLMConnection,
} from "./useLLMConnection";

describe("normalizeLLMProviderId", () => {
  it("maps the legacy hosted provider id to Mentari", () => {
    expect(normalizeLLMProviderId("hyprnote")).toBe("anarlog");
  });

  it("preserves current provider ids", () => {
    expect(normalizeLLMProviderId("openai")).toBe("openai");
  });
});

describe("resolveLLMConnection BAA policy", () => {
  it("blocks a network provider by default", () => {
    const result = resolveLLMConnection({
      providerId: "openai",
      modelId: "gpt-5",
      providerConfig: {
        type: "llm",
        api_key: "secret",
        base_url: undefined,
      },
      session: null,
      isPaid: false,
      baaApprovals: "[]",
    });

    expect(result).toEqual({
      conn: null,
      status: {
        status: "error",
        reason: "baa_not_approved",
        providerId: "openai",
      },
    });
  });

  it("allows only the approved provider and type pair", () => {
    const result = resolveLLMConnection({
      providerId: "openai",
      modelId: "gpt-5",
      providerConfig: {
        type: "llm",
        api_key: "secret",
        base_url: undefined,
      },
      session: null,
      isPaid: false,
      baaApprovals: '["stt:openai","llm:openai"]',
    });

    expect(result.status).toEqual({
      status: "success",
      providerId: "openai",
      isHosted: false,
    });
  });

  it("allows local providers without a BAA approval", () => {
    const result = resolveLLMConnection({
      providerId: "ollama",
      modelId: "qwen3",
      providerConfig: undefined,
      session: null,
      isPaid: false,
      baaApprovals: "[]",
    });

    expect(result.status.status).toBe("success");
  });
});
