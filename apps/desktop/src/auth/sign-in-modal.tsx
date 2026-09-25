import { Trans } from "@lingui/react/macro";
import {
  CircleNotch,
  EnvelopeSimple,
  GoogleLogo,
  WindowsLogo,
} from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@anlg/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";
import { Input } from "@anlg/ui/components/ui/input";

import { useAuth } from "./auth-context";

export function SignInModal() {
  const auth = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const googleMutation = useMutation({
    mutationFn: () => auth.signInWithOAuth("google"),
  });
  const microsoftMutation = useMutation({
    mutationFn: () => auth.signInWithOAuth("azure"),
  });
  const magicLinkMutation = useMutation({
    mutationFn: (email: string) => auth.signInWithMagicLink(email),
    onSuccess: (_data, email) => setSentTo(email),
  });

  const emailForm = useForm({
    defaultValues: { email: "" },
    onSubmit: ({ value }) => magicLinkMutation.mutate(value.email.trim()),
  });

  const pending =
    googleMutation.isPending ||
    microsoftMutation.isPending ||
    magicLinkMutation.isPending;
  const error =
    googleMutation.error ?? microsoftMutation.error ?? magicLinkMutation.error;

  const setOpen = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) {
      setSentTo(null);
      emailForm.reset();
      googleMutation.reset();
      microsoftMutation.reset();
      magicLinkMutation.reset();
    }
    auth.closeSignInModal();
  };

  return (
    <Dialog open={auth.isSignInModalOpen} onOpenChange={setOpen}>
      <DialogContent className="border-border/45 bg-card/95 w-[calc(100vw-48px)] max-w-[320px] gap-0 overflow-hidden rounded-[26px] p-0 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:rounded-[26px]">
        <DialogHeader className="items-center gap-2 px-5 pt-7 text-center sm:text-center">
          <DialogTitle className="text-foreground text-[13px] leading-5 font-semibold tracking-normal">
            <Trans>Sign in to Mentari</Trans>
          </DialogTitle>
          <DialogDescription className="text-foreground max-w-[260px] text-center text-[13px] leading-[1.36]">
            {sentTo ? (
              <Trans>
                We sent a sign-in link to {sentTo}. Open it on this computer to
                continue.
              </Trans>
            ) : (
              <Trans>Choose how you'd like to continue.</Trans>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 px-4 pt-4 pb-6">
          {sentTo ? (
            <Button
              variant="outline"
              className="h-8 rounded-full px-4 text-xs font-medium"
              onClick={() => {
                setSentTo(null);
                magicLinkMutation.reset();
              }}
            >
              <Trans>Use a different email</Trans>
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="h-8 rounded-full px-4 text-xs font-medium"
                onClick={() => googleMutation.mutate()}
                disabled={pending}
              >
                {googleMutation.isPending ? (
                  <CircleNotch className="size-3.5 animate-spin" />
                ) : (
                  <GoogleLogo className="size-3.5" aria-hidden="true" />
                )}
                <Trans>Continue with Google</Trans>
              </Button>
              <Button
                variant="outline"
                className="h-8 rounded-full px-4 text-xs font-medium"
                onClick={() => microsoftMutation.mutate()}
                disabled={pending}
              >
                {microsoftMutation.isPending ? (
                  <CircleNotch className="size-3.5 animate-spin" />
                ) : (
                  <WindowsLogo className="size-3.5" aria-hidden="true" />
                )}
                <Trans>Continue with Microsoft</Trans>
              </Button>

              <div className="text-muted-foreground my-1 flex items-center gap-2 text-[11px]">
                <div className="bg-border h-px flex-1" />
                <Trans>or</Trans>
                <div className="bg-border h-px flex-1" />
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void emailForm.handleSubmit();
                }}
                className="grid gap-2"
              >
                <emailForm.Field name="email">
                  {(field) => (
                    <Input
                      type="email"
                      aria-label="Email"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      placeholder="you@example.com"
                      autoComplete="email"
                      disabled={pending}
                      className="h-8 text-xs"
                    />
                  )}
                </emailForm.Field>
                <emailForm.Subscribe selector={(state) => state.values.email}>
                  {(email) => (
                    <Button
                      type="submit"
                      className="h-8 rounded-full px-4 text-xs font-medium"
                      disabled={!email.trim() || pending}
                    >
                      {magicLinkMutation.isPending ? (
                        <CircleNotch className="size-3.5 animate-spin" />
                      ) : (
                        <EnvelopeSimple
                          className="size-3.5"
                          aria-hidden="true"
                        />
                      )}
                      <Trans>Send sign-in link</Trans>
                    </Button>
                  )}
                </emailForm.Subscribe>
              </form>
            </>
          )}

          {error && (
            <p className="mt-1 text-center text-xs text-red-500">
              {error.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
