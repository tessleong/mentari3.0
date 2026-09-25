import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { cn } from "@anlg/utils";

import { useShell } from "~/contexts/shell";
import { AppIconImage } from "~/shared/theme/app-icon-image";

export function ChatCTA({
  label,
  ariaLabel,
}: {
  label?: ReactNode;
  ariaLabel?: string;
}) {
  const { t } = useLingui();
  const { chat } = useShell();
  const isChatOpen = chat.mode !== "FloatingClosed";
  const resolvedLabel = label ?? t`Ask Mentari`;

  const handleClick = () => {
    chat.sendEvent({ type: "OPEN" });
  };

  if (isChatOpen) {
    return null;
  }

  return (
    <button
      type="button"
      data-chat-cta-trigger
      aria-label={ariaLabel ?? t`Ask Mentari anything`}
      onClick={handleClick}
      className="group/anarlog-chat-cta relative flex items-center gap-2 focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={cn([
          "pointer-events-none max-w-0 overflow-hidden opacity-0",
          "border-border/70 bg-popover text-foreground rounded-full border py-2 text-sm font-medium whitespace-nowrap shadow-sm",
          "transition-[max-width,opacity,padding] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "group-hover/anarlog-chat-cta:max-w-40 group-hover/anarlog-chat-cta:px-3.5 group-hover/anarlog-chat-cta:opacity-100",
          "group-focus-visible/anarlog-chat-cta:max-w-40 group-focus-visible/anarlog-chat-cta:px-3.5 group-focus-visible/anarlog-chat-cta:opacity-100",
        ])}
      >
        {resolvedLabel}
      </span>
      <span
        data-chat-cta-surface
        aria-hidden="true"
        className={cn([
          "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full",
          "shadow-[0_2px_8px_rgba(0,0,0,0.18),0_10px_28px_rgba(0,0,0,0.16)]",
          "transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "group-hover/anarlog-chat-cta:scale-105 group-focus-visible/anarlog-chat-cta:scale-105",
          "group-focus-visible/anarlog-chat-cta:ring-ring group-focus-visible/anarlog-chat-cta:ring-2 group-focus-visible/anarlog-chat-cta:ring-offset-2",
        ])}
      >
        <AppIconImage className="size-full rounded-full" />
      </span>
    </button>
  );
}

export function FloatingChatCTA({ label }: { label?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-20 flex items-end justify-end">
      <div className="pointer-events-auto">
        <ChatCTA label={label} />
      </div>
    </div>
  );
}
