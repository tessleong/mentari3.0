import { CaretDown, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";

import { cn } from "@anlg/utils";

import { useAgentPanels } from "./panels";
import { agentLabels, PersonalityAvatar, type AgentRole } from "./personality";

const MAX_SELECTION = 6000;

/** The toolbar suppresses mousedown, so the selection is still live here. */
function selectedText(): string {
  return (window.getSelection()?.toString() ?? "")
    .trim()
    .slice(0, MAX_SELECTION);
}

/**
 * The agent picker, rendered inside the selection formatting toolbar.
 *
 * It shares the toolbar rather than floating its own bar over the selection, so
 * the two surfaces can no longer cover each other. Picking an agent opens its
 * draggable panel on the highlighted passage.
 */
export function AgentPicker() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Ask an agent"
        title="Ask an agent about this"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn([
          "flex h-7 items-center gap-0.5 rounded-md px-1.5",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer border-none bg-transparent transition-colors",
        ])}
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkle className="size-4" />
        <CaretDown className="size-3" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Agents"
          className="bg-popover ring-border absolute top-full right-0 z-10 mt-1 flex w-48 flex-col rounded-lg p-1 shadow-lg ring-1"
        >
          {(Object.keys(agentLabels) as AgentRole[]).map((role) => (
            <button
              key={role}
              type="button"
              role="menuitem"
              className={cn([
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                "text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer border-none bg-transparent transition-colors",
              ])}
              onClick={() => {
                useAgentPanels.getState().start(role, selectedText());
                setOpen(false);
              }}
            >
              <PersonalityAvatar role={role} size={18} />
              {agentLabels[role]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
