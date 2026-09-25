import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@anlg/ui/components/ui/popover";
import { cn } from "@anlg/utils";

import {
  PARTICIPANT_ROLES,
  isParticipantRole,
  type ParticipantRole,
} from "~/session/participant-roles";
import { updateSessionParticipantRole } from "~/session/queries";

const ROLE_SHORT_LABELS: Record<ParticipantRole, string> = {
  clinician: "MD",
  patient: "Pt",
  family: "Fam",
  interpreter: "Int",
  lecturer: "Lec",
  other: "Other",
};

export function ParticipantRoleBadge({
  mappingId,
  role,
}: {
  mappingId: string;
  role: string;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  const labels: Record<ParticipantRole, string> = {
    clinician: t`Clinician`,
    patient: t`Patient`,
    family: t`Family`,
    interpreter: t`Interpreter`,
    lecturer: t`Lecturer`,
    other: t`Other`,
  };

  const currentRole = isParticipantRole(role) ? role : null;

  const choose = (nextRole: ParticipantRole | null) => {
    void updateSessionParticipantRole(mappingId, nextRole ?? "");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={t`Set participant role`}
          title={currentRole ? labels[currentRole] : t`Set role`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          className={cn([
            "relative shrink-0 rounded px-1 text-[10px] font-medium",
            currentRole
              ? "bg-foreground/15 text-foreground"
              : "text-muted-foreground/70 hover:text-foreground",
          ])}
        >
          {currentRole ? ROLE_SHORT_LABELS[currentRole] : t`+ Role`}
        </button>
      </PopoverAnchor>
      <PopoverContent
        variant="app"
        align="start"
        className="w-auto p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground px-1 text-[11px] font-medium tracking-[0.08em] uppercase">
            {t`Role`}
          </p>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => choose(null)}
              className={cn([
                "rounded px-2 py-1 text-left text-xs",
                !currentRole
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              ])}
            >
              {t`None`}
            </button>
            {PARTICIPANT_ROLES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                className={cn([
                  "rounded px-2 py-1 text-left text-xs",
                  currentRole === option
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                ])}
              >
                {labels[option]}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
