import { ArrowCounterClockwise, X } from "@phosphor-icons/react";

import { emptyRun, useAgentPanels } from "./panels";
import { agentLabels, PersonalityAvatar, type AgentRole } from "./personality";

import { useFloatingPanelLayout } from "~/shared/hooks/use-floating-panel-layout";

const DEFAULT_WIDTH = 380;
const STEPS_SHOWN = 6;

/**
 * A floating, draggable view onto one agent's run.
 *
 * The panel owns no reasoning: it renders whatever the store holds and calls
 * back into controls the runtime registered. Dragging reuses the same
 * layout hook as the Ask Mentari panel, so position persists per agent.
 */
export function AgentPanel({ role }: { role: AgentRole }) {
  const run = useAgentPanels((state) => state.runs[role]) ?? emptyRun();
  const order = useAgentPanels((state) => state.order);
  const controls = useAgentPanels((state) => state.controls[role]);
  const { layout, startDrag, reset } = useFloatingPanelLayout(
    `mentari-agent-panel-${role}`,
    { minWidth: 280, minHeight: 160 },
  );

  const paused = run.outcome === "budget_paused";
  const recent = run.steps.slice(-STEPS_SHOWN);

  return (
    <div
      data-testid={`agent-panel-${role}`}
      role="dialog"
      aria-label={agentLabels[role]}
      onMouseDown={() => useAgentPanels.getState().raise(role)}
      style={{
        transform: `translate(${layout.dx}px, ${layout.dy}px)`,
        width: layout.width ?? DEFAULT_WIDTH,
        zIndex: 40 + Math.max(0, order.indexOf(role)),
      }}
      className="bg-popover ring-border fixed top-24 left-24 flex max-h-[70vh] flex-col gap-2 rounded-xl p-3 shadow-lg ring-1"
    >
      <header
        data-testid={`agent-panel-header-${role}`}
        onMouseDown={startDrag}
        className="flex cursor-grab items-center justify-between gap-2 active:cursor-grabbing"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <PersonalityAvatar role={role} size={22} />
          {agentLabels[role]}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Reset position"
            title="Reset position"
            className="hover:bg-accent rounded-md p-1"
            onClick={reset}
          >
            <ArrowCounterClockwise size={14} />
          </button>
          <button
            type="button"
            aria-label="Close agent"
            title="Close"
            className="hover:bg-accent rounded-md p-1"
            onClick={() => useAgentPanels.getState().close(role)}
          >
            <X size={14} />
          </button>
        </span>
      </header>

      <ol
        aria-label="Reasoning steps"
        className="text-muted-foreground flex flex-col gap-1 overflow-y-auto text-xs"
      >
        {recent.map((step, index) => (
          <li key={`${step.round}-${step.kind}-${index}`}>
            <span className="font-mono">
              {step.kind} {step.round}
            </span>{" "}
            {step.summary}
          </li>
        ))}
      </ol>

      {run.answer && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {run.answer}
        </p>
      )}

      {paused && (
        <div role="status" className="flex flex-col gap-2 text-sm">
          <p>Paused on its budget. Nothing has been discarded.</p>
          {run.openQuestions.length > 0 && (
            <>
              <h4 className="font-medium">Still open</h4>
              <ul className="list-disc space-y-1 pl-4">
                {run.openQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="bg-foreground text-background flex-1 rounded-md p-2"
              onClick={() => controls?.keepGoing?.()}
            >
              Keep going
            </button>
            <button
              type="button"
              className="border-border flex-1 rounded-md border p-2"
              onClick={() => controls?.stop?.()}
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders every open panel, back to front. */
export function AgentPanelHost() {
  const order = useAgentPanels((state) => state.order);
  return (
    <>
      {order.map((role) => (
        <AgentPanel key={role} role={role} />
      ))}
    </>
  );
}
