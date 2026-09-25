import type { LanguageModelMiddleware } from "ai";

// The ChatGPT subscription (Codex) backend never persists responses
// server-side, but the AI SDK's OpenAI Responses provider only knows to
// resend full conversation history (rather than compact `item_reference`
// pointers to items it assumes are stored server-side) when it sees
// `providerOptions.openai.store === false` on the call itself — the same
// flag our custom fetch (chatgptResponsesBody in settings/ai/llm/
// subscriptions/oauth.ts) forces onto the outgoing wire request. Setting it
// only on the wire request is too late: the SDK has already built the
// request body using item_reference pointers by then, assuming store
// stayed at its default of true, which a later turn then fails to resolve
// server-side ("Item ... not found. Items are not persisted when `store`
// is set to false."). Setting it here, before the SDK builds that body,
// makes it send full item content (with encrypted_content, given the
// wire-level `include` the fetch wrapper also adds) instead.
export const zeroRetentionProviderOptionsMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({
    ...params,
    providerOptions: {
      ...params.providerOptions,
      openai: {
        ...params.providerOptions?.openai,
        store: false,
      },
    },
  }),
};
