import { SourceUnavailableError, type EvidenceSourceId } from "./sources";

// Shared shape for a registered accredited source that has no usable public
// API today. Keeping the same search() signature as the real clients
// (pubmed.ts, medlineplus.ts) means call sites don't need to special-case
// these sources; they just get a clear, typed rejection instead of results.
export function createUnavailableSource(
  sourceId: EvidenceSourceId,
  reason: string,
) {
  return {
    sourceId,
    isConfigured: () => false,
    search: async (): Promise<never> => {
      throw new SourceUnavailableError(sourceId, reason);
    },
  };
}
