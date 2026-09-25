import { wrapLanguageModel } from "ai";
import { describe, expect, test, vi } from "vitest";

import { zeroRetentionProviderOptionsMiddleware } from "./zero-retention-middleware";

type LanguageModel = Parameters<typeof wrapLanguageModel>[0]["model"];

const streamResult = {
  stream: new ReadableStream({
    start(controller) {
      controller.close();
    },
  }),
  request: { body: {} },
};

describe("zeroRetentionProviderOptionsMiddleware", () => {
  test("forces providerOptions.openai.store to false, so the SDK sends full reasoning content instead of an item_reference on the next turn", async () => {
    const doStream = vi.fn(async () => streamResult);
    const model = createModel(doStream);
    const wrapped = wrapLanguageModel({
      model,
      middleware: zeroRetentionProviderOptionsMiddleware,
    });

    await wrapped.doStream({ prompt: [] });

    expect(doStream).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openai: { store: false } },
      }),
    );
  });

  test("preserves other providerOptions already set on the call, and other providers' options", async () => {
    const doStream = vi.fn(async () => streamResult);
    const model = createModel(doStream);
    const wrapped = wrapLanguageModel({
      model,
      middleware: zeroRetentionProviderOptionsMiddleware,
    });

    await wrapped.doStream({
      prompt: [],
      providerOptions: {
        openai: { reasoningEffort: "high" },
        anthropic: { thinking: { type: "enabled" } },
      },
    });

    expect(doStream).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          openai: { reasoningEffort: "high", store: false },
          anthropic: { thinking: { type: "enabled" } },
        },
      }),
    );
  });

  test("overrides an explicit store:true, since the wire request is always forced to store:false for this backend", async () => {
    const doStream = vi.fn(async () => streamResult);
    const model = createModel(doStream);
    const wrapped = wrapLanguageModel({
      model,
      middleware: zeroRetentionProviderOptionsMiddleware,
    });

    await wrapped.doStream({
      prompt: [],
      providerOptions: { openai: { store: true } },
    });

    expect(doStream).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openai: { store: false } },
      }),
    );
  });
});

function createModel(doStream: LanguageModel["doStream"]): LanguageModel {
  return {
    specificationVersion: "v3",
    provider: "test",
    modelId: "gpt-test",
    supportedUrls: {},
    doGenerate: vi.fn(),
    doStream,
  };
}
