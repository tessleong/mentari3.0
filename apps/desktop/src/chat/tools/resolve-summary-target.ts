import type { loadSessionContentSnapshot } from "~/session/content-queries";

export type SummaryCandidate = {
  enhancedNoteId: string;
  title: string;
  templateId?: string;
  position?: number;
};

type EnhancedNotes = NonNullable<
  Awaited<ReturnType<typeof loadSessionContentSnapshot>>
>["enhancedNotes"];

export function listSummaryCandidates(
  notes: EnhancedNotes,
): SummaryCandidate[] {
  return notes.map((note) => ({
    enhancedNoteId: note.id,
    title: note.title.trim() || "Summary",
    templateId: note.templateId || undefined,
    position: note.position,
  }));
}

export type ResolveSummaryTargetResult =
  | { status: "ok"; enhancedNoteId: string; currentContent: string }
  | { status: "error"; message: string; candidates?: SummaryCandidate[] };

export function resolveSummaryTarget({
  notes,
  requestedEnhancedNoteId,
  activeEnhancedNoteId,
}: {
  notes: EnhancedNotes;
  requestedEnhancedNoteId?: string;
  activeEnhancedNoteId?: string;
}): ResolveSummaryTargetResult {
  const noteIds = notes.map((note) => note.id);
  if (noteIds.length === 0) {
    return { status: "error", message: "No summaries found for this session" };
  }

  const noteIdSet = new Set(noteIds);
  const candidates = listSummaryCandidates(notes);

  if (requestedEnhancedNoteId && !noteIdSet.has(requestedEnhancedNoteId)) {
    return {
      status: "error",
      message: "That summary does not belong to the target session.",
      candidates,
    };
  }

  const defaultEnhancedNoteId =
    notes.find((note) => !note.templateId)?.id ?? null;

  const enhancedNoteId =
    (requestedEnhancedNoteId && noteIdSet.has(requestedEnhancedNoteId)
      ? requestedEnhancedNoteId
      : null) ??
    (activeEnhancedNoteId && noteIdSet.has(activeEnhancedNoteId)
      ? activeEnhancedNoteId
      : null) ??
    defaultEnhancedNoteId ??
    (noteIds.length === 1 ? noteIds[0] : null);

  if (!enhancedNoteId) {
    return {
      status: "error",
      message:
        "Multiple summaries exist for this session. Specify enhancedNoteId explicitly.",
      candidates,
    };
  }

  const currentContent =
    notes.find((note) => note.id === enhancedNoteId)?.markdown ?? "";

  return { status: "ok", enhancedNoteId, currentContent };
}
