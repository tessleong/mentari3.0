import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  events as windowsEvents,
  getCurrentWebviewWindowLabel,
} from "@anlg/plugin-windows";
import { sonnerToast } from "@anlg/ui/components/ui/toast";

import { DEVICE_AUTH_REASON } from "./auth";
import { LockScreen, useDeviceAuthHint } from "./screen";
import { useAppLock } from "./store";

import { useSettingsReady } from "~/settings/queries";
import { BrandLoadingView } from "~/shared/brand-loading-view";
import { useConfigValue } from "~/shared/config";

export function AppLockGate({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const settingsReady = useSettingsReady();
  const lockAppEnabled = useConfigValue("lock_app");
  const available = useAppLock((state) => state.available);
  const appUnlocked = useAppLock((state) => state.appUnlocked);
  const authenticating = useAppLock((state) => state.authenticating);
  const refreshAvailability = useAppLock((state) => state.refreshAvailability);
  const unlockApp = useAppLock((state) => state.unlockApp);
  const hint = useDeviceAuthHint();
  const promptedRef = useRef(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  const shouldLock = settingsReady && lockAppEnabled && available === true;
  const locked = shouldLock && !appUnlocked;

  // Lock app requires biometrics (no password fallback), so it silently
  // stops enforcing on hardware without Touch ID/Face ID -- e.g. after
  // migrating to a Mac without it. Warn instead of leaving the app
  // unlocked with no sign the protection the user turned on is inactive.
  useEffect(() => {
    if (settingsReady && lockAppEnabled && available === false) {
      sonnerToast.warning(t`Lock app is not active on this Mac`, {
        description: t`This Mac has no Touch ID or Face ID, so Mentari cannot require device authentication here. Your notes are not protected by Lock app on this device.`,
      });
    }
  }, [settingsReady, lockAppEnabled, available, t]);

  useEffect(() => {
    if (!shouldLock || appUnlocked) {
      setSessionStarted(true);
    }
  }, [appUnlocked, shouldLock]);

  useEffect(() => {
    if (!shouldLock || appUnlocked || authenticating || promptedRef.current) {
      return;
    }
    promptedRef.current = true;
    void unlockApp(DEVICE_AUTH_REASON.openApp);
  }, [unlockApp, appUnlocked, authenticating, shouldLock]);

  useEffect(() => {
    // Gated on config, not `shouldLock`: `available` is cached from one
    // check made when the gate mounted, and if that came back false (a
    // transient LAContext hiccup, or biometrics that only finish
    // initializing after boot), shouldLock would stay false and this
    // listener would never attach -- so `available` would never get
    // re-checked, leaving Lock App silently disabled for the whole
    // session. Attaching whenever the user has it enabled lets each
    // reopen self-heal a stale unavailable reading.
    if (!settingsReady || !lockAppEnabled) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void windowsEvents.visibilityEvent
      .listen(async ({ payload }) => {
        if (
          payload.window.type !== "main" ||
          getCurrentWebviewWindowLabel() !== "main"
        ) {
          return;
        }

        if (!payload.visible) {
          // Closing hides the main window. Lock now, but do not prompt until
          // the user opens it again.
          promptedRef.current = true;
          useAppLock.getState().lockApp();
          return;
        }

        if (useAppLock.getState().available !== true) {
          await useAppLock.getState().refreshAvailability();
        }
        if (useAppLock.getState().available !== true) return;

        if (useAppLock.getState().appUnlocked) return;
        if (useAppLock.getState().authenticating) {
          // A close-invalidated prompt is still running. Let the auto-prompt
          // effect start a new one once that auth settles.
          promptedRef.current = false;
          return;
        }
        promptedRef.current = true;
        void useAppLock.getState().unlockApp(DEVICE_AUTH_REASON.openApp);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [settingsReady, lockAppEnabled]);

  if (!settingsReady) {
    return <BrandLoadingView />;
  }

  if (lockAppEnabled && available === null) {
    return <BrandLoadingView />;
  }

  return (
    <div className="relative h-full min-h-0 w-full">
      {sessionStarted ? (
        <div
          className="h-full min-h-0 w-full"
          {...(locked ? { inert: true } : {})}
        >
          {children}
        </div>
      ) : null}
      {locked ? (
        <div className="absolute inset-0">
          <LockScreen
            title={t`Mentari is Locked`}
            description={hint}
            action={t`View Mentari`}
            authenticating={authenticating}
            onUnlock={() => {
              promptedRef.current = true;
              void unlockApp(DEVICE_AUTH_REASON.openApp);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
