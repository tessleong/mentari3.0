import {
  ArrowsOutSimple,
  CaretUp,
  DotsSixVertical,
  NotePencil,
  X,
} from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useCallback } from "react";

import { Button } from "@anlg/ui/components/ui/button";
import { Textarea } from "@anlg/ui/components/ui/textarea";
import { cn } from "@anlg/utils";

import { recordClinicalAuditEvent } from "./audit";

import { executeTransaction, useLiveQuery } from "~/db";
import { useFloatingPanelLayout } from "~/shared/hooks/use-floating-panel-layout";

type CueRow = {
  id: string;
  captured_at_ms: number;
  text: string;
  category: string;
};

const DEFAULT_WIDTH = 380;

export function useClinicalCues(sessionId: string) {
  return useLiveQuery<CueRow, CueRow[]>({
    sql: `SELECT id, captured_at_ms, text, category
      FROM clinical_cues
      WHERE session_id = ? AND deleted_at IS NULL
      ORDER BY captured_at_ms, created_at`,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => rows,
  });
}

export function ClinicalCueComposer({ sessionId }: { sessionId: string }) {
  const cues = useClinicalCues(sessionId);
  const { layout, startDrag, startResize, toggleCollapsed } =
    useFloatingPanelLayout("clinical-cue-composer-layout", {
      minWidth: 260,
      minHeight: 44,
    });
  const form = useForm({
    defaultValues: { text: "" },
    onSubmit: async ({ value }) => {
      const text = value.text.trim();
      if (!text) return;
      await executeTransaction([
        {
          sql: `INSERT INTO clinical_cues
            (id, session_id, captured_at_ms, text)
            VALUES (?, ?, ?, ?)`,
          params: [crypto.randomUUID(), sessionId, Date.now(), text],
        },
      ]);
      void recordClinicalAuditEvent({
        sessionId,
        action: "clinician_cue_created",
        resourceType: "clinical_cue",
        resourceId: sessionId,
        metadata: { textLength: text.length },
      });
      form.setFieldValue("text", "");
    },
  });

  const submit = useCallback(() => {
    void form.handleSubmit();
  }, [form]);

  const width = layout.width ?? DEFAULT_WIDTH;
  const style = {
    transform: `translate(${layout.dx}px, ${layout.dy}px)`,
    width,
  };

  if (layout.collapsed) {
    return (
      <button
        type="button"
        aria-label="Show quick cue or correction"
        onClick={toggleCollapsed}
        style={{ transform: style.transform }}
        className={cn([
          "border-border/70 bg-card/95 text-muted-foreground hover:text-foreground",
          "absolute right-3 bottom-3 z-10 flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs shadow-lg backdrop-blur-sm",
        ])}
      >
        <NotePencil className="size-4 shrink-0" />
        Quick cue
        <CaretUp className="size-3 shrink-0" />
      </button>
    );
  }

  return (
    <div
      style={style}
      className="border-border/70 bg-card/95 absolute right-3 bottom-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl border shadow-lg backdrop-blur-sm"
    >
      <div
        onMouseDown={startDrag}
        className="text-muted-foreground/70 hover:text-muted-foreground flex cursor-grab items-center justify-between px-2 pt-1.5 active:cursor-grabbing"
      >
        <DotsSixVertical className="size-4" />
        <button
          type="button"
          aria-label="Minimize quick cue or correction"
          onClick={toggleCollapsed}
          onMouseDown={(event) => event.stopPropagation()}
          className="hover:text-foreground hover:bg-accent rounded-md p-1"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <form
        className="flex items-center gap-2 p-3 pt-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          submit();
        }}
      >
        <form.Field name="text">
          {(field) => (
            <Textarea
              aria-label="Quick clinical cue"
              className="min-h-9 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-5 shadow-none focus-visible:ring-0"
              placeholder="Quick cue or correction…"
              rows={1}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          )}
        </form.Field>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
        >
          Save cue
        </Button>
      </form>
      {(cues.data ?? []).length > 0 && (
        <div className="border-border/60 flex max-h-20 flex-wrap gap-1 overflow-y-auto border-t px-3 py-2">
          {(cues.data ?? []).slice(-6).map((cue) => (
            <span
              key={cue.id}
              className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px]"
              title={new Date(cue.captured_at_ms).toLocaleTimeString()}
            >
              {cue.text}
            </span>
          ))}
        </div>
      )}
      <div
        role="presentation"
        aria-hidden
        onMouseDown={(event) =>
          // Right-anchored panel: moving the left-edge handle further left
          // (negative deltaX) grows the width.
          startResize(event, (deltaX) => ({
            width: width - deltaX,
            height: 0,
          }))
        }
        className="text-muted-foreground/50 hover:text-muted-foreground absolute bottom-0.5 left-0.5 flex size-4 cursor-nesw-resize items-center justify-center"
      >
        <ArrowsOutSimple className="size-3 rotate-90" />
      </div>
    </div>
  );
}
