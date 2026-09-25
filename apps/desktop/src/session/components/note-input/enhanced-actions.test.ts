import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  model: null as unknown,
  llmStatus: { status: "pending", reason: "missing_provider" } as unknown,
  openNew: vi.fn(),
  start: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  isMainWindow: true,
  requestMainEnhance: vi.fn(),
  snapshot: null as unknown,
}));

vi.mock("@anlg/plugin-analytics", () => ({
  commands: { event: vi.fn() },
}));

vi.mock("@anlg/ui/components/ui/toast", () => ({
  sonnerToast: { error: mocks.toastError, warning: mocks.toastWarning },
}));

vi.mock("~/ai/hooks", () => ({
  useAITaskTask: () => ({
    isGenerating: false,
    isError: false,
    error: null,
    start: mocks.start,
    cancel: vi.fn(),
  }),
  useLanguageModel: () => mocks.model,
  useLLMConnectionStatus: () => mocks.llmStatus,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { openNew: typeof mocks.openNew }) => unknown) =>
    selector({ openNew: mocks.openNew }),
}));

vi.mock("~/ai/task-window-sync", () => ({
  isMainAITaskHostWindow: () => mocks.isMainWindow,
  requestMainAITaskCancel: vi.fn(),
  requestMainEnhance: mocks.requestMainEnhance,
}));

vi.mock("~/session/content-queries", () => ({
  loadSessionContentSnapshot: () => Promise.resolve(mocks.snapshot),
}));

vi.mock("~/session/queries", () => ({
  useEnhancedNote: () => ({ templateId: "template-1" }),
}));

import { useEnhancedNoteActions } from "./enhanced-actions";

function renderActions() {
  return renderHook(() =>
    useEnhancedNoteActions({
      enhancedNoteId: "summary-1",
      sessionId: "session-1",
    }),
  );
}

describe("useEnhancedNoteActions", () => {
  beforeEach(() => {
    mocks.model = null;
    mocks.llmStatus = { status: "pending", reason: "missing_provider" };
    mocks.isMainWindow = true;
    mocks.snapshot = null;
    mocks.start.mockReset();
    mocks.toastError.mockReset();
    mocks.toastWarning.mockReset();
    mocks.requestMainEnhance.mockReset();
    mocks.openNew.mockReset();
  });

  it("shows a toast without entering an error state when Intelligence is not configured", async () => {
    const { result } = renderActions();

    await act(() => result.current.onRegenerate(null));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Set up Intelligence in Settings before regenerating this summary.",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Open settings" }),
      }),
    );
    expect(mocks.start).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();

    const openSettingsAction = mocks.toastError.mock.calls[0]![1].action;
    openSettingsAction.onClick();
    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "intelligence" },
    });
  });

  it("shows a BAA-specific toast that opens privacy settings when the provider needs approval", async () => {
    mocks.llmStatus = {
      status: "error",
      reason: "baa_not_approved",
      providerId: "google_generative_ai",
    };

    const { result } = renderActions();

    await act(() => result.current.onRegenerate(null));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "This provider needs BAA approval before it can be used.",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Review privacy settings" }),
      }),
    );

    const reviewPrivacyAction = mocks.toastError.mock.calls[0]![1].action;
    reviewPrivacyAction.onClick();
    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "privacy" },
    });
  });

  it("shows the too-short toast instead of forwarding to main from a standalone window", async () => {
    mocks.model = { id: "model-1" };
    mocks.isMainWindow = false;
    mocks.snapshot = {
      transcripts: [{ words: [{ text: "hi" }, { text: "there" }] }],
    };

    const { result } = renderActions();

    await act(() => result.current.onRegenerate(null));

    expect(mocks.toastWarning).toHaveBeenCalledWith(
      "Summary wasn't generated",
      expect.objectContaining({ id: "auto-summary-too-short-session-1" }),
    );
    expect(mocks.requestMainEnhance).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("forwards eligible sessions to the main window", async () => {
    mocks.model = { id: "model-1" };
    mocks.isMainWindow = false;
    mocks.snapshot = {
      transcripts: [
        {
          words: Array.from({ length: 40 }, (_, index) => ({
            text: `word-${index}`,
          })),
        },
      ],
    };

    const { result } = renderActions();

    await act(() => result.current.onRegenerate(null));

    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(mocks.requestMainEnhance).toHaveBeenCalledWith("session-1", {
      templateId: "template-1",
      targetNoteId: "summary-1",
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("forwards a one-off instruction to the enhance task", async () => {
    mocks.model = { id: "model-1" };
    mocks.isMainWindow = true;

    const { result } = renderActions();

    await act(() => result.current.onRegenerate(null, "Make it longer"));

    expect(mocks.start).toHaveBeenCalledWith({
      model: mocks.model,
      args: {
        sessionId: "session-1",
        enhancedNoteId: "summary-1",
        templateId: "template-1",
        oneOffInstruction: "Make it longer",
      },
    });
  });
});
