import { Trans, useLingui } from "@lingui/react/macro";
import { X } from "@phosphor-icons/react";

import { DOCTORS_VISIT_TEMPLATE_ID } from "~/clinical/summary-evidence";
import { useSession } from "~/session/queries";
import { useSetSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";

// Shown once, the first time a note uses the Doctor's Visit template — an
// independent trigger from the onboarding persona step, so a general user
// who only occasionally picks this template still sees it.
export function PatientIntroBanner({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const session = useSession(sessionId);
  const seen = useConfigValue("patient_intro_seen");
  const setSeen = useSetSettingValue("patient_intro_seen");

  if (seen || session?.raw_template_id !== DOCTORS_VISIT_TEMPLATE_ID) {
    return null;
  }

  return (
    <div className="shrink-0 px-1 pt-1 pb-2">
      <div className="border-border/70 bg-card/80 flex items-start justify-between gap-3 rounded-[22px] border px-4 py-3">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">
            <Trans>Your appointment copilot</Trans>
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            <Trans>
              Finally, demystifying your health — ask Mentari to explain
              anything said during this visit, backed by trusted medical
              sources.
            </Trans>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSeen(true)}
          aria-label={t`Dismiss`}
          className="text-muted-foreground hover:text-foreground shrink-0 rounded-full p-1 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
