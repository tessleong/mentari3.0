import { sha256 } from "./hash";

import { executeTransaction, liveQueryClient } from "~/db";

export async function recordClinicalAuditEvent(input: {
  sessionId: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, string | number | boolean>;
}) {
  const previous = await liveQueryClient.execute<{ event_hash: string }>(
    "SELECT event_hash FROM clinical_audit_events ORDER BY occurred_at DESC, id DESC LIMIT 1",
  );
  const id = crypto.randomUUID();
  const occurredAt = new Date().toISOString();
  const resourceIdHash = await sha256(input.resourceId);
  const previousEventHash = previous[0]?.event_hash ?? "";
  const metadataJson = JSON.stringify(input.metadata ?? {});
  const eventHash = await sha256(
    JSON.stringify({
      id,
      sessionId: input.sessionId,
      actorId: input.actorId ?? "",
      action: input.action,
      resourceType: input.resourceType,
      resourceIdHash,
      metadataJson,
      occurredAt,
      previousEventHash,
    }),
  );
  await executeTransaction([
    {
      sql: `INSERT INTO clinical_audit_events
        (id, session_id, actor_id, action, resource_type, resource_id_hash,
         metadata_json, occurred_at, previous_event_hash, event_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        input.sessionId,
        input.actorId ?? "",
        input.action,
        input.resourceType,
        resourceIdHash,
        metadataJson,
        occurredAt,
        previousEventHash,
        eventHash,
      ],
    },
  ]);
  return { id, eventHash };
}
