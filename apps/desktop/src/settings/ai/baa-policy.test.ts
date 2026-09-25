import { describe, expect, it } from "vitest";

import {
  isBaaApproved,
  isLocalLlmConnection,
  parseBaaApprovals,
  setBaaApproval,
} from "./baa-policy";

describe("BAA provider approvals", () => {
  it("fails closed for missing or malformed settings", () => {
    expect(parseBaaApprovals(undefined)).toEqual([]);
    expect(parseBaaApprovals("not-json")).toEqual([]);
    expect(isBaaApproved("llm", "openai", "not-json")).toBe(false);
  });

  it("keeps provider types separate", () => {
    const approvals = '["stt:openai"]';
    expect(isBaaApproved("stt", "openai", approvals)).toBe(true);
    expect(isBaaApproved("llm", "openai", approvals)).toBe(false);
  });

  it("adds and removes only the requested approval", () => {
    const approved = setBaaApproval("[]", "llm", "anthropic", true);
    expect(isBaaApproved("llm", "anthropic", approved)).toBe(true);
    expect(setBaaApproval(approved, "llm", "anthropic", false)).toBe("[]");
  });

  it("only treats loopback local-provider endpoints as local", () => {
    expect(isLocalLlmConnection("ollama", "http://127.0.0.1:11434")).toBe(true);
    expect(isLocalLlmConnection("ollama", "http://ollama.example.com")).toBe(
      false,
    );
    expect(isLocalLlmConnection("openai", "http://127.0.0.1:11434")).toBe(
      false,
    );
  });
});
