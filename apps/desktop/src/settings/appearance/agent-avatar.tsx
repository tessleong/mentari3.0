import { Trans, useLingui } from "@lingui/react/macro";

import { Avatar } from "@anlg/ui/components/avatar";
import { cn } from "@anlg/utils";

import { PersonalitySelector } from "~/agents/personality";
import {
  AGENT_AVATAR_SEEDS,
  type AgentAvatarSeed,
  normalizeAgentAvatarSeed,
} from "~/chat/agent-avatar";
import { useSetSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";

export function AgentAvatarSelector() {
  const { t } = useLingui();
  const value = normalizeAgentAvatarSeed(useConfigValue("agent_avatar_seed"));
  const setAgentAvatarSeed = useSetSettingValue("agent_avatar_seed");

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
    <section className="flex flex-col gap-4">
      <PersonalitySelector />
      <div>
        <h3 className="text-lg font-semibold">
          <Trans>Agent avatar</Trans>
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          <Trans>Choose the color for Mentari's agent avatar in chat.</Trans>
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={t`Agent avatar`}
        className="flex flex-wrap gap-3"
      >
        {AGENT_AVATAR_SEEDS.map((seed) => {
          const selected = seed === value;
          return (
            <button
              key={seed}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={labels[seed]}
              title={labels[seed]}
              className={cn([
                "group focus-visible:ring-ring focus-visible:ring-offset-background flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border bg-transparent p-2 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]",
                selected
                  ? "border-foreground/30 bg-accent/40"
                  : "hover:bg-accent/30 border-transparent",
              ])}
              onClick={() => setAgentAvatarSeed(seed)}
            >
              <Avatar seed={seed} label="" size={40} />
              <span className="text-muted-foreground text-xs">
                {labels[seed]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
