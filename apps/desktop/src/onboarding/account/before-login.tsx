import { Trans } from "@lingui/react/macro";
import { CircleNotch } from "@phosphor-icons/react";
import { useState } from "react";

import { OnboardingButton } from "../shared";

import { useAuth } from "~/auth";
import { env } from "~/env";

export function BeforeLogin({ onContinue }: { onContinue: () => void }) {
  const auth = useAuth();
  const [isOpening, setIsOpening] = useState(false);
  const cloudAuthConfigured = Boolean(
    env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY,
  );

  const handleSignIn = () => {
    if (isOpening) return;
    setIsOpening(true);
    void auth.signIn().finally(() => setIsOpening(false));
  };

  return (
    <div className="flex flex-col items-start gap-3">
      {!cloudAuthConfigured ? (
        <p className="text-muted-foreground max-w-md text-sm leading-6">
          <Trans>
            Cloud accounts are not configured for this development build. You
            can continue with a private local workspace now.
          </Trans>
        </p>
      ) : null}
      <div className="flex flex-row items-center gap-4">
        <OnboardingButton
          onClick={cloudAuthConfigured ? handleSignIn : onContinue}
          disabled={isOpening}
          className="flex items-center gap-2 px-6 py-2 text-sm disabled:opacity-70"
        >
          {isOpening ? (
            <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {cloudAuthConfigured ? (
            <Trans>Create account</Trans>
          ) : (
            <Trans>Continue locally</Trans>
          )}
        </OnboardingButton>

        {cloudAuthConfigured ? (
          <OnboardingButton
            variant="secondary"
            onClick={handleSignIn}
            disabled={isOpening}
            className="px-6 py-2"
          >
            <Trans>Sign in</Trans>
          </OnboardingButton>
        ) : null}
      </div>
    </div>
  );
}
