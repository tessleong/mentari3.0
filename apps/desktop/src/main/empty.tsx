import { Trans } from "@lingui/react/macro";
import { Microphone, NotePencil } from "@phosphor-icons/react";
import { platform } from "@tauri-apps/plugin-os";
import { useCallback } from "react";

import { Kbd } from "@anlg/ui/components/ui/kbd";
import { cn } from "@anlg/utils";

import { FloatingChatCTA } from "~/shared/chat-cta";
import { StandardContentWrapper } from "~/shared/main";
import { useNewNote, useNewNoteAndListen } from "~/shared/useNewNote";
import { type Tab, useTabs } from "~/store/zustand/tabs";

export function TabContentEmpty({
  tab: _tab,
}: {
  tab: Extract<Tab, { type: "empty" }>;
}) {
  return (
    <StandardContentWrapper floatingButton={<FloatingChatCTA />}>
      <EmptyView />
    </StandardContentWrapper>
  );
}

function EmptyView() {
  const newNote = useNewNote({ behavior: "current" });
  const newNoteAndListen = useNewNoteAndListen({ behavior: "current" });
  const openCurrent = useTabs((state) => state.openCurrent);
  const primaryModifier = platform() === "macos" ? "⌘" : "Ctrl";

  const openSettings = useCallback(
    () => openCurrent({ type: "settings" }),
    [openCurrent],
  );

  return (
    <div
      data-tauri-drag-region
      className="flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8"
    >
      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="border-border/70 bg-card/70 flex flex-col rounded-xl border p-1">
          <ActionItem
            label={<Trans>New Note</Trans>}
            icon={<NotePencil weight="bold" className="size-4" />}
            shortcut={[primaryModifier, "N"]}
            onClick={newNote}
          />
          <ActionItem
            label={<Trans>Start Recording</Trans>}
            icon={<Microphone weight="bold" className="size-4" />}
            shortcut={[primaryModifier, "⇧", "N"]}
            onClick={newNoteAndListen}
          />
        </div>

        <div className="text-muted-foreground flex items-center justify-center text-xs">
          <button
            onClick={openSettings}
            data-tauri-drag-region="false"
            className="hover:text-foreground cursor-pointer transition-colors"
          >
            <Trans>Configure providers</Trans>
          </button>
        </div>
      </div>
      <p className="text-muted-foreground mt-6 text-center text-xs">
        <Trans>
          Capture source material in a local note without sending it to a cloud
          model.
        </Trans>
      </p>
    </div>
  );
}

function ActionItem({
  label,
  shortcut,
  icon,
  onClick,
}: {
  label: React.ReactNode;
  shortcut?: string[];
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-tauri-drag-region="false"
      className={cn([
        "group",
        "flex items-center justify-between gap-8",
        "text-foreground text-sm",
        "rounded-full px-4 py-2",
        "hover:bg-accent cursor-pointer transition-colors",
      ])}
    >
      <span className="flex items-center gap-2.5">
        {icon ? (
          <span className="text-muted-foreground [&>svg]:block">{icon}</span>
        ) : null}
        {label}
      </span>
      {shortcut && shortcut.length > 0 ? (
        <Kbd
          className={cn([
            "transition-all duration-100",
            "group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_0_0_var(--kbd-shadow-outer-hover),inset_0_1px_0_0_var(--kbd-shadow-inset)]",
            "group-active:translate-y-0.5 group-active:shadow-none",
          ])}
        >
          {shortcut.join(" ")}
        </Kbd>
      ) : null}
    </button>
  );
}
