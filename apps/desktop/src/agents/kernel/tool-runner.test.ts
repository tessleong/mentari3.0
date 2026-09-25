import { describe, expect, it, vi } from "vitest";

import { createToolRunner } from "./tool-runner";
import type { ToolCall } from "./types";

const signal = () => new AbortController().signal;

const call = (over: Partial<ToolCall> = {}): ToolCall => ({
  tool: "search",
  input: "sepsis",
  requiresNetwork: true,
  containsPhi: false,
  ...over,
});

const runner = (over: Parameters<typeof createToolRunner>[0] | object = {}) =>
  createToolRunner({
    tools: { search: async (input) => `found ${String(input)}` },
    route: {
      actorId: "user-1",
      providerId: "claude",
      local: false,
      baaAttested: false,
    },
    audit: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as Parameters<typeof createToolRunner>[0]);

describe("PHI-aware tool runner", () => {
  it("runs a call that carries no PHI", async () => {
    const [result] = await runner()([call()], signal());

    expect(result?.ok).toBe(true);
    expect(result?.output).toBe("found sepsis");
  });

  it("refuses a PHI call to the network without a BAA", async () => {
    const search = vi.fn();
    const [result] = await runner({
      tools: { search },
      route: {
        actorId: "u",
        providerId: "claude",
        local: false,
        baaAttested: false,
      },
    })([call({ containsPhi: true })], signal());

    expect(result?.blocked).toBe(true);
    expect(result?.ok).toBe(false);
    // The refusal has to happen before the request, not after.
    expect(search).not.toHaveBeenCalled();
  });

  it("allows a PHI call once the provider is BAA-attested", async () => {
    const [result] = await runner({
      tools: { search: async () => "ok" },
      route: {
        actorId: "u",
        providerId: "claude",
        local: false,
        baaAttested: true,
      },
    })([call({ containsPhi: true })], signal());

    expect(result?.blocked).toBeUndefined();
    expect(result?.ok).toBe(true);
  });

  it("allows a PHI call that never leaves the machine", async () => {
    const [result] = await runner({
      tools: { search: async () => "ok" },
      route: {
        actorId: "u",
        providerId: "ollama",
        local: true,
        baaAttested: false,
      },
    })([call({ containsPhi: true })], signal());

    expect(result?.ok).toBe(true);
  });

  it("does not consult the router for a call that stays local", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const [result] = await runner({
      tools: { cache: async () => "cached" },
      audit,
    })(
      [call({ tool: "cache", requiresNetwork: false, containsPhi: true })],
      signal(),
    );

    expect(result?.ok).toBe(true);
    expect(audit).not.toHaveBeenCalled();
  });

  it("writes an audit entry for every routing decision", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    await runner({ audit })([call(), call()], signal());

    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit.mock.calls[0]?.[0]).toMatchObject({
      actorId: "user-1",
      providerId: "claude",
      containsPhi: false,
    });
  });

  it("still audits a refusal", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    await runner({
      tools: { search: vi.fn() },
      audit,
    })([call({ containsPhi: true })], signal());

    expect(audit.mock.calls[0]?.[0]).toMatchObject({
      decision: { allowed: false, reason: "network_phi_blocked" },
    });
  });

  it("reports an unknown tool as a failed result rather than throwing", async () => {
    const [result] = await runner()([call({ tool: "nope" })], signal());

    expect(result?.ok).toBe(false);
    expect(result?.error).toContain("nope");
  });

  it("turns a throwing tool into a failed result", async () => {
    const [result] = await runner({
      tools: {
        search: async () => {
          throw new Error("network down");
        },
      },
    })([call()], signal());

    expect(result?.ok).toBe(false);
    expect(result?.error).toContain("network down");
  });

  it("does not let a failing audit write lose the tool result", async () => {
    const [result] = await runner({
      audit: vi.fn().mockRejectedValue(new Error("db locked")),
    })([call()], signal());

    expect(result?.ok).toBe(true);
  });

  it("returns one result per call, in order", async () => {
    const results = await runner({
      tools: { search: async (input) => input },
    })([call({ input: "a" }), call({ input: "b" })], signal());

    expect(results.map((r) => r.output)).toEqual(["a", "b"]);
  });
});
