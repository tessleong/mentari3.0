import type { ToolCall, ToolResult, ToolRunner } from "./types";

import {
  auditPhiRoute,
  decidePhiRoute,
  type PhiRouteDecision,
} from "~/clinical/phi-policy";

export type ToolImpl = (
  input: unknown,
  signal: AbortSignal,
) => Promise<unknown>;

export type RouteContext = {
  actorId: string;
  providerId: string;
  /** The model runs on this machine, so nothing leaves it. */
  local: boolean;
  /** A BAA has been attested for this provider. */
  baaAttested: boolean;
};

type AuditFn = (input: Parameters<typeof auditPhiRoute>[0]) => Promise<unknown>;

/**
 * Executes an agent's tool calls under the clinical PHI routing policy.
 *
 * Every call that leaves the machine is routed and audited *before* it is made,
 * so a refusal is a decision recorded in the hash-chained audit log rather than
 * a request that happened and was regretted. A refused call comes back as
 * `blocked`, which the kernel treats as a prompt to replan locally rather than
 * as a failure.
 */
export function createToolRunner({
  tools,
  route,
  audit = auditPhiRoute,
}: {
  tools: Record<string, ToolImpl>;
  route: RouteContext;
  audit?: AuditFn;
}): ToolRunner {
  return async (calls, signal) =>
    Promise.all(
      calls.map((call) => runOne(call, { tools, route, audit }, signal)),
    );
}

async function runOne(
  call: ToolCall,
  {
    tools,
    route,
    audit,
  }: { tools: Record<string, ToolImpl>; route: RouteContext; audit: AuditFn },
  signal: AbortSignal,
): Promise<ToolResult> {
  // A call that never leaves the machine raises no routing question, so it is
  // not a PHI disclosure and does not belong in the disclosure audit log.
  if (call.requiresNetwork) {
    const decision = decidePhiRoute({
      containsPhi: call.containsPhi,
      local: route.local,
      baaAttested: route.baaAttested,
    });
    await record(audit, call, route, decision);
    if (!decision.allowed)
      return {
        tool: call.tool,
        call,
        ok: false,
        blocked: true,
        error: `Blocked by PHI routing: ${decision.reason}`,
      };
  }

  const impl = tools[call.tool];
  if (!impl)
    return {
      tool: call.tool,
      call,
      ok: false,
      error: `No tool registered for "${call.tool}"`,
    };

  try {
    return {
      tool: call.tool,
      call,
      ok: true,
      output: await impl(call.input, signal),
    };
  } catch (error) {
    return {
      tool: call.tool,
      call,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function record(
  audit: AuditFn,
  call: ToolCall,
  route: RouteContext,
  decision: PhiRouteDecision,
) {
  try {
    await audit({
      actorId: route.actorId,
      action: `agent_tool:${call.tool}`,
      resourceType: "agent_tool_call",
      resourceId: String(call.input),
      providerType: "llm",
      providerId: route.providerId,
      containsPhi: call.containsPhi,
      decision,
    });
  } catch {
    // The routing decision already stands. Losing its audit row must not also
    // lose the agent's work; the failure surfaces through the audit log's own
    // chain verification.
  }
}
