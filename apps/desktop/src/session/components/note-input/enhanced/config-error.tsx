import { Trans } from "@lingui/react/macro";

import { Button } from "@anlg/ui/components/ui/button";

import type { LLMConnectionStatus } from "~/ai/hooks";
import { useTabs } from "~/store/zustand/tabs";

export function ConfigError({ status }: { status?: LLMConnectionStatus }) {
  const openNew = useTabs((state) => state.openNew);

  const needsBaaApproval =
    status?.status === "error" && status.reason === "baa_not_approved";

  return (
    <div
      role="alert"
      className="flex h-full min-h-[400px] flex-col items-center justify-center px-6"
    >
      <div className="mb-6 flex max-w-md flex-col gap-2 text-center">
        <p className="text-base font-medium">
          {needsBaaApproval ? (
            <Trans>Provider needs BAA approval</Trans>
          ) : (
            <Trans>Set up AI summaries</Trans>
          )}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {needsBaaApproval ? (
            <Trans>
              This AI provider is blocked until you confirm your organization
              has a BAA covering it. Approve it in Privacy settings to generate
              a summary from this transcript.
            </Trans>
          ) : (
            <Trans>
              Add your own LLM API key to generate a summary from this
              transcript.
            </Trans>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {needsBaaApproval ? (
          <Button
            className="shadow-none"
            onClick={() =>
              openNew({ type: "settings", state: { tab: "privacy" } })
            }
          >
            <Trans>Review privacy settings</Trans>
          </Button>
        ) : (
          <Button
            className="shadow-none"
            onClick={() =>
              openNew({ type: "settings", state: { tab: "intelligence" } })
            }
          >
            <Trans>Add API key</Trans>
          </Button>
        )}
      </div>
    </div>
  );
}
