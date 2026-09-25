import { sha256 } from "./hash";

import { executeTransaction, liveQueryClient } from "~/db";

export type PhiRouteDecision = {
  allowed: boolean;
  reason: "local_route" | "no_phi" | "baa_attested" | "network_phi_blocked";
};

export function decidePhiRoute({
  containsPhi,
  local,
  baaAttested,
}: {
  containsPhi: boolean;
  local: boolean;
  baaAttested: boolean;
}): PhiRouteDecision {
  if (local) return { allowed: true, reason: "local_route" };
  if (!containsPhi) return { allowed: true, reason: "no_phi" };
  if (baaAttested) return { allowed: true, reason: "baa_attested" };
  return { allowed: false, reason: "network_phi_blocked" };
}

export async function auditPhiRoute({
  actorId,
  action,
  resourceType,
  resourceId,
  providerType,
  providerId,
  containsPhi,
  decision,
}: {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  providerType: string;
  providerId: string;
  containsPhi: boolean;
  decision: PhiRouteDecision;
}) {
  const previous = await liveQueryClient.execute<{ event_hash: string }>(
    "SELECT event_hash FROM clinical_phi_audit_events ORDER BY occurred_at DESC, id DESC LIMIT 1",
  );
  const occurredAt = new Date().toISOString();
  const resourceIdHash = await sha256(resourceId);
  const previousEventHash = previous[0]?.event_hash ?? "";
  const id = crypto.randomUUID();
  const eventHash = await sha256(
    JSON.stringify({
      id,
      occurredAt,
      actorId,
      action,
      resourceType,
      resourceIdHash,
      providerType,
      providerId,
      containsPhi,
      decision,
      previousEventHash,
    }),
  );
  await executeTransaction([
    {
      sql: `INSERT INTO clinical_phi_audit_events (
        id, occurred_at, actor_id, action, resource_type, resource_id_hash,
        provider_type, provider_id, decision, reason, contains_phi,
        previous_event_hash, event_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        occurredAt,
        actorId,
        action,
        resourceType,
        resourceIdHash,
        providerType,
        providerId,
        decision.allowed ? "allowed" : "blocked",
        decision.reason,
        containsPhi ? 1 : 0,
        previousEventHash,
        eventHash,
      ],
    },
  ]);
  return { id, eventHash };
}
