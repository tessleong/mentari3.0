import type { LanguageModel } from "ai";

const AI_GENERATION_MAX_RETRIES = 4;

// Google's provider rejects a retried request whose body has already been
// consumed, so it gets no automatic retries — every other provider tolerates
// the AI SDK's normal transient-failure retry behavior.
export function getGenerationMaxRetries(model: LanguageModel): number {
  const provider = typeof model === "string" ? model : model.provider;
  return provider.startsWith("google.") ? 0 : AI_GENERATION_MAX_RETRIES;
}
