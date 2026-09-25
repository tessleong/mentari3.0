import { useLingui } from "@lingui/react/macro";
import { Check } from "@phosphor-icons/react";
import { useState } from "react";

import { Avatar } from "@anlg/ui/components/avatar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@anlg/ui/components/ui/popover";
import { cn } from "@anlg/utils";

import { useTranscriptSelectionState } from "./selection-context";
import { SpeakerAssignPopover } from "./speaker-assign";

import { AGENT_AVATAR_SEEDS, type AgentAvatarSeed } from "~/chat/agent-avatar";
import { useSetSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";
import {
  getSpeakerAvatarKey,
  getSpeakerAvatarTextColor,
  parseSpeakerAvatarSeeds,
  resolveSpeakerAvatarSeed,
  withSpeakerAvatarSeed,
} from "~/shared/speaker-avatars";
import type { Segment } from "~/stt/live-segment";

export function SegmentHeader({
  segment,
  transcriptId,
  sessionId,
  label,
  selected = false,
}: {
  segment: Segment;
  transcriptId: string;
  sessionId?: string;
  label: string;
  selected?: boolean;
}) {
  const { selectMode } = useTranscriptSelectionState();
  const storedSeedsJson = useConfigValue("speaker_avatar_seeds");
  const setStoredSeedsJson = useSetSettingValue("speaker_avatar_seeds");
  const speakerKey = getSpeakerAvatarKey(segment.key);
  const seeds = parseSpeakerAvatarSeeds(storedSeedsJson);
  const seed = resolveSpeakerAvatarSeed(seeds, speakerKey, label);
  const textColor = getSpeakerAvatarTextColor(seed);

  const choose = (nextSeed: string | null) => {
    setStoredSeedsJson(
      withSpeakerAvatarSeed(storedSeedsJson, speakerKey, nextSeed),
    );
  };

  const headerClassName = cn([
    "relative py-1",
    "text-muted-foreground text-[11px] font-medium tracking-wide",
    "flex items-center gap-2",
  ]);

  return (
    <div className={headerClassName}>
      {selectMode ? (
        <span
          aria-hidden="true"
          className={cn([
            "flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          ])}
        >
          {selected ? <Check className="size-2.5" weight="bold" /> : null}
        </span>
      ) : (
        <SpeakerAvatarDot
          seed={seed}
          hasOverride={speakerKey in seeds}
          onChoose={choose}
        />
      )}
      <SpeakerAssignPopover
        segment={segment}
        transcriptId={transcriptId}
        sessionId={sessionId}
        color={textColor}
        label={label}
      />
    </div>
  );
}

function SpeakerAvatarDot({
  seed,
  hasOverride,
  onChoose,
}: {
  seed: string;
  hasOverride: boolean;
  onChoose: (nextSeed: string | null) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  const choose = (nextSeed: string | null) => {
    onChoose(nextSeed);
    setOpen(false);
  };

  const labels: Record<AgentAvatarSeed, string> = {
    "mentari-agent-21": t`Aurora`,
    "mentari-agent-2": t`Sunrise`,
    "mentari-agent-35": t`Ember`,
    "mentari-agent-30": t`Bloom`,
    "mentari-agent-12": t`Rainforest`,
    "mentari-agent-17": t`Ocean`,
    "mentari-agent-9": t`Twilight`,
    "mentari-agent-22": t`Orchid`,
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={t`Choose speaker color`}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full"
          onContextMenu={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          <Avatar seed={seed} label="" size={14} />
        </button>
      </PopoverAnchor>
      <PopoverContent
        variant="app"
        align="start"
        className="w-auto p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground px-1 text-[11px] font-medium tracking-[0.08em] uppercase">
            {t`Speaker color`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-label={t`Automatic`}
              title={t`Automatic`}
              onClick={() => choose(null)}
              className={cn([
                "flex size-7 items-center justify-center rounded-full border",
                !hasOverride
                  ? "border-foreground/60"
                  : "hover:border-border border-transparent",
              ])}
            >
              <span className="text-muted-foreground text-[9px] font-semibold">
                {t`Auto`}
              </span>
            </button>
            {AGENT_AVATAR_SEEDS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={labels[option]}
                title={labels[option]}
                onClick={() => choose(option)}
                className={cn([
                  "flex size-7 items-center justify-center rounded-full border p-0.5",
                  hasOverride && seed === option
                    ? "border-foreground/60"
                    : "hover:border-border border-transparent",
                ])}
              >
                <Avatar seed={option} label="" size={24} />
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
