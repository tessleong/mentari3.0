export type ClinicalAiProviderType = "llm" | "stt";

const LOOPBACK_LLM_PROVIDER_IDS = new Set(["lmstudio", "ollama", "unsloth"]);

export function getBaaApprovalKey(
  type: ClinicalAiProviderType,
  providerId: string,
): string {
  return `${type}:${providerId === "hyprnote" ? "anarlog" : providerId}`;
}

export function parseBaaApprovals(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function isBaaApproved(
  type: ClinicalAiProviderType,
  providerId: string,
  approvals: unknown,
): boolean {
  return parseBaaApprovals(approvals).includes(
    getBaaApprovalKey(type, providerId),
  );
}

export function isLocalLlmConnection(
  providerId: string,
  baseUrl: string | undefined,
): boolean {
  if (providerId === "apple_foundation") return true;
  if (!LOOPBACK_LLM_PROVIDER_IDS.has(providerId) || !baseUrl) return false;
  try {
    const hostname = new URL(baseUrl).hostname;
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function setBaaApproval(
  approvals: unknown,
  type: ClinicalAiProviderType,
  providerId: string,
  approved: boolean,
): string {
  const key = getBaaApprovalKey(type, providerId);
  const next = new Set(parseBaaApprovals(approvals));
  if (approved) next.add(key);
  else next.delete(key);
  return JSON.stringify([...next].sort());
}
