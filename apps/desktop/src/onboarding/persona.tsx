import { Trans } from "@lingui/react/macro";
import { HeartStraight, type Icon, Users } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import { cn } from "@anlg/utils";

import { OnboardingButton } from "./shared";

import { PATIENT_USAGE_CONTEXT } from "~/clinical/usage-context";
import { useSetSettingValue } from "~/settings/queries";

type Persona = "patient" | "general";

export function PersonaSection({ onContinue }: { onContinue: () => void }) {
  const setUsageContext = useSetSettingValue("usage_context");
  const [selected, setSelected] = useState<Persona | null>(null);

  const choose = (value: Persona) => {
    setSelected(value);
    setUsageContext(value);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PersonaOption
          icon={HeartStraight}
          title={<Trans>My own doctor or dentist visits</Trans>}
          description={
            <Trans>
              Ask Mentari focuses on explaining what's discussed during your
              appointments.
            </Trans>
          }
          isSelected={selected === PATIENT_USAGE_CONTEXT}
          onClick={() => choose(PATIENT_USAGE_CONTEXT)}
        />
        <PersonaOption
          icon={Users}
          title={<Trans>Work meetings</Trans>}
          description={
            <Trans>
              Ask Mentari focuses on action items, summaries, and follow-ups.
            </Trans>
          }
          isSelected={selected === "general"}
          onClick={() => choose("general")}
        />
      </div>

      {selected === PATIENT_USAGE_CONTEXT && (
        <div className="border-border/60 bg-card/60 rounded-2xl border p-4">
          <p className="text-foreground text-base font-medium">
            <Trans>Your appointment copilot.</Trans>
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            <Trans>
              Finally, demystifying your health — Mentari explains what's said
              during your visit and backs it up with trusted medical sources.
            </Trans>
          </p>
        </div>
      )}

      {selected && (
        <OnboardingButton
          onClick={onContinue}
          className="px-6 py-2 text-sm"
          data-testid="persona-continue"
        >
          <Trans>Continue</Trans>
        </OnboardingButton>
      )}
    </div>
  );
}

function PersonaOption({
  icon: IconComponent,
  title,
  description,
  isSelected,
  onClick,
}: {
  icon: Icon;
  title: ReactNode;
  description: ReactNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn([
        "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border/60 bg-card/40 hover:bg-card/70",
      ])}
    >
      <IconComponent
        className={cn([
          "size-5",
          isSelected ? "text-primary" : "text-muted-foreground",
        ])}
      />
      <span className="text-foreground text-sm font-medium">{title}</span>
      <span className="text-muted-foreground text-xs">{description}</span>
    </button>
  );
}
