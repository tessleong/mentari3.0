import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSessionContentSnapshot: vi.fn(),
  persistChatSessionProposal: vi.fn(),
  applySessionProposal: vi.fn(),
  declineSessionProposal: vi.fn(),
}));

vi.mock("~/session/content-queries", () => ({
  loadSessionContentSnapshot: mocks.loadSessionContentSnapshot,
}));

vi.mock("~/session/queries", () => ({
  persistChatSessionProposal: mocks.persistChatSessionProposal,
  applySessionProposal: mocks.applySessionProposal,
  declineSessionProposal: mocks.declineSessionProposal,
}));

import { buildFindReplaceNoteTool } from "./find-replace-note";

import { usePendingEditStore } from "~/chat/tools/pending-edit-store";

describe("find replace note chat tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePendingEditStore.setState({ edits: new Map() });
    mocks.persistChatSessionProposal.mockResolvedValue(undefined);
    mocks.applySessionProposal.mockResolvedValue(undefined);
    mocks.declineSessionProposal.mockResolvedValue(undefined);
    mocks.loadSessionContentSnapshot.mockResolvedValue({
      rawMarkdown: "BP was 120/80. BP recheck next visit.",
      rawNoteId: "note-1",
      enhancedNotes: [
        {
          id: "summary-1",
          title: "Summary",
          markdown: "BP was elevated at 140/90.",
          templateId: "",
          position: 0,
        },
      ],
    });
  });

  it("replaces every match in the memo and applies after review", async () => {
    const openEditTab = vi.fn((requestId: string) => {
      expect(usePendingEditStore.getState().edits.get(requestId)).toMatchObject(
        {
          sessionId: "session-1",
          target: { kind: "memo" },
          currentContent: "BP was 120/80. BP recheck next visit.",
          proposedContent:
            "blood pressure was 120/80. blood pressure recheck next visit.",
          source: "chat",
        },
      );
      usePendingEditStore.getState().resolveEdit(requestId, true);
    });
    const tool = buildFindReplaceNoteTool({
      getSessionId: () => "session-1",
      getEnhancedNoteId: () => undefined,
      openEditTab,
    });

    await expect(
      (tool as any).execute(
        { target: "memo", find: "BP", replace: "blood pressure" },
        { toolCallId: "request-1", messages: [] },
      ),
    ).resolves.toEqual({
      status: "applied",
      target: "memo",
      replacements: 2,
    });

    expect(mocks.persistChatSessionProposal).toHaveBeenCalledWith({
      id: "request-1",
      sessionId: "session-1",
      kind: "memo_replace",
      targetId: "note-1",
      currentMarkdown: "BP was 120/80. BP recheck next visit.",
      proposedMarkdown:
        "blood pressure was 120/80. blood pressure recheck next visit.",
    });
    expect(openEditTab).toHaveBeenCalledWith("request-1");
    expect(mocks.applySessionProposal).toHaveBeenCalledWith("request-1");
  });

  it("replaces matches in an existing summary", async () => {
    const tool = buildFindReplaceNoteTool({
      getSessionId: () => "session-1",
      getEnhancedNoteId: () => undefined,
      openEditTab: (requestId) => {
        usePendingEditStore.getState().resolveEdit(requestId, true);
      },
    });

    await expect(
      (tool as any).execute(
        { target: "summary", find: "140/90", replace: "138/88" },
        { toolCallId: "request-1", messages: [] },
      ),
    ).resolves.toEqual({
      status: "applied",
      target: "summary",
      replacements: 1,
    });

    expect(mocks.persistChatSessionProposal).toHaveBeenCalledWith({
      id: "request-1",
      sessionId: "session-1",
      kind: "summary_replace",
      targetId: "summary-1",
      currentMarkdown: "BP was elevated at 140/90.",
      proposedMarkdown: "BP was elevated at 138/88.",
    });
  });

  it("returns not_found without persisting a proposal when there is no match", async () => {
    const tool = buildFindReplaceNoteTool({
      getSessionId: () => "session-1",
      getEnhancedNoteId: () => undefined,
      openEditTab: vi.fn(),
    });

    await expect(
      (tool as any).execute(
        { target: "memo", find: "not present", replace: "anything" },
        { toolCallId: "request-1", messages: [] },
      ),
    ).resolves.toMatchObject({ status: "not_found", target: "memo" });

    expect(mocks.persistChatSessionProposal).not.toHaveBeenCalled();
  });

  it("declines the persisted proposal when review is rejected", async () => {
    const tool = buildFindReplaceNoteTool({
      getSessionId: () => "session-1",
      getEnhancedNoteId: () => undefined,
      openEditTab: (requestId) => {
        usePendingEditStore.getState().resolveEdit(requestId, false);
      },
    });

    await expect(
      (tool as any).execute(
        { target: "memo", find: "BP", replace: "blood pressure" },
        { toolCallId: "request-1", messages: [] },
      ),
    ).resolves.toEqual({ status: "declined", target: "memo" });

    expect(mocks.declineSessionProposal).toHaveBeenCalledWith("request-1");
    expect(mocks.applySessionProposal).not.toHaveBeenCalled();
  });

  it("respects matchWholeWord: false to match inside other words", async () => {
    mocks.loadSessionContentSnapshot.mockResolvedValue({
      rawMarkdown: "abcdef",
      rawNoteId: "note-1",
      enhancedNotes: [],
    });
    const tool = buildFindReplaceNoteTool({
      getSessionId: () => "session-1",
      getEnhancedNoteId: () => undefined,
      openEditTab: (requestId) => {
        usePendingEditStore.getState().resolveEdit(requestId, true);
      },
    });

    await expect(
      (tool as any).execute(
        {
          target: "memo",
          find: "cd",
          replace: "XY",
          matchWholeWord: false,
        },
        { toolCallId: "request-1", messages: [] },
      ),
    ).resolves.toEqual({ status: "applied", target: "memo", replacements: 1 });

    expect(mocks.persistChatSessionProposal).toHaveBeenCalledWith(
      expect.objectContaining({ proposedMarkdown: "abXYef" }),
    );
  });

  it("returns canonical candidates when the requested summary is unrelated", async () => {
    const tool = buildFindReplaceNoteTool({
      getSessionId: () => "session-1",
      getEnhancedNoteId: () => undefined,
      openEditTab: vi.fn(),
    });

    await expect(
      (tool as any).execute(
        {
          target: "summary",
          enhancedNoteId: "summary-other",
          find: "BP",
          replace: "blood pressure",
        },
        { toolCallId: "request-1", messages: [] },
      ),
    ).resolves.toEqual({
      status: "error",
      target: "summary",
      message: "That summary does not belong to the target session.",
      candidates: [
        {
          enhancedNoteId: "summary-1",
          title: "Summary",
          position: 0,
        },
      ],
    });
    expect(mocks.persistChatSessionProposal).not.toHaveBeenCalled();
  });
});
