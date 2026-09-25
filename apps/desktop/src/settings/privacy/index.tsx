import { useLingui } from "@lingui/react/macro";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect } from "react";

import { DEVICE_AUTH_REASON } from "~/lock/auth";
import { useAppLock } from "~/lock/store";
import {
  isLocalLlmConnection,
  isBaaApproved,
  setBaaApproval,
  type ClinicalAiProviderType,
} from "~/settings/ai/baa-policy";
import { PROVIDERS as LLM_PROVIDERS } from "~/settings/ai/llm/shared";
import { PROVIDERS as STT_PROVIDERS } from "~/settings/ai/stt/shared";
import { privacyMessages } from "~/settings/general/app-settings";
import { SettingsPageTitle } from "~/settings/page-title";
import { useAiProvider } from "~/settings/providers";
import {
  useSetSettingValues,
  useStoredSettingValuesQuery,
} from "~/settings/queries";
import { SettingSwitchRow } from "~/settings/setting-row";
import { resolveConfigValue } from "~/shared/config";
import { isLocalFileSttModel, isOnDeviceSttModel } from "~/stt/capabilities";

export function SettingsPrivacy() {
  const { i18n, t } = useLingui();
  const settingsQuery = useStoredSettingValuesQuery();
  const setSettingValues = useSetSettingValues();
  const available = useAppLock((state) => state.available);
  const authenticating = useAppLock((state) => state.authenticating);
  const authenticate = useAppLock((state) => state.authenticate);
  const lockApp = useAppLock((state) => state.lockApp);
  const refreshAvailability = useAppLock((state) => state.refreshAvailability);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  // Every hook must run on every render regardless of loading state, so
  // useAiProvider is called unconditionally here (before the early return
  // below) with a possibly-undefined provider id. Calling it after the
  // early return caused a hook-count mismatch between the loading and
  // loaded renders — a React rules-of-hooks violation that crashed this
  // screen whenever the underlying settings query briefly re-entered a
  // loading state, e.g. right after toggling a BAA approval switch.
  const llmProviderId = settingsQuery.data
    ? resolveConfigValue("current_llm_provider", settingsQuery.data)
    : undefined;
  const llmProvider = useAiProvider("llm", llmProviderId);

  if (settingsQuery.error) {
    throw settingsQuery.error;
  }
  if (settingsQuery.isLoading || !settingsQuery.data) {
    return null;
  }

  const posthogEnabled = resolveConfigValue(
    "telemetry_consent",
    settingsQuery.data,
  );
  const sentryEnabled = resolveConfigValue(
    "crash_reporting_consent",
    settingsQuery.data,
  );
  const lockAppEnabled = resolveConfigValue("lock_app", settingsQuery.data);
  const baaApprovals = resolveConfigValue(
    "baa_approved_ai_providers",
    settingsQuery.data,
  );
  const sttProviderId = resolveConfigValue(
    "current_stt_provider",
    settingsQuery.data,
  );
  const sttModelId = resolveConfigValue(
    "current_stt_model",
    settingsQuery.data,
  );
  const llmProviderDefinition = LLM_PROVIDERS.find(
    (provider) => provider.id === llmProviderId,
  );
  const llmBaseUrl =
    llmProvider?.base_url?.trim() || llmProviderDefinition?.baseUrl?.trim();
  const isLocalLlm =
    !!llmProviderId && isLocalLlmConnection(llmProviderId, llmBaseUrl);
  const isLocalStt =
    isOnDeviceSttModel(sttProviderId, sttModelId) ||
    isLocalFileSttModel(sttProviderId, sttModelId);
  const authAvailable = available === true;
  const lockAppDescription = !authAvailable
    ? t`Device authentication is not available on this computer.`
    : platform() === "windows"
      ? t`Require Windows Hello face, PIN, or password when opening Mentari.`
      : t`Require Touch ID when opening Mentari.`;

  return (
    <div className="flex flex-col gap-8">
      <SettingsPageTitle title={i18n._(privacyMessages.title)} />

      <section className="flex flex-col gap-4">
        <SettingSwitchRow
          title={t`Lock app`}
          description={lockAppDescription}
          checked={lockAppEnabled && authAvailable}
          disabled={!authAvailable || authenticating}
          onChange={(next) => {
            void (async () => {
              const canAuth = await refreshAvailability();
              if (!canAuth) return;
              const ok = await authenticate(
                DEVICE_AUTH_REASON.changeLockSettings,
              );
              if (!ok) return;
              setSettingValues({ lock_app: next });
              if (next) lockApp();
            })();
          }}
        />
        <SettingSwitchRow
          title={`${i18n._(privacyMessages.posthogTitle)} (PostHog)`}
          description={i18n._(privacyMessages.posthogDescription)}
          checked={posthogEnabled}
          onChange={(telemetryConsent) => {
            setSettingValues({ telemetry_consent: telemetryConsent });
          }}
        />
        <SettingSwitchRow
          title={t`Sentry`}
          description={t`Send sanitized crash and error reports to help improve Mentari.`}
          checked={sentryEnabled}
          onChange={(crashReportingConsent) => {
            setSettingValues({
              crash_reporting_consent: crashReportingConsent,
            });
          }}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Clinical AI providers</h2>
          <p className="text-muted-foreground text-sm">
            Network providers are blocked until you confirm that your
            organization has an appropriate BAA covering that exact provider and
            service type. Mentari does not verify the agreement for you.
          </p>
        </div>
        {llmProviderId && !isLocalLlm && (
          <BaaApprovalSwitch
            type="llm"
            providerId={llmProviderId}
            providerName={llmProviderDefinition?.displayName ?? llmProviderId}
            approvals={baaApprovals}
            onChange={(value) =>
              setSettingValues({ baa_approved_ai_providers: value })
            }
          />
        )}
        {sttProviderId && !isLocalStt && (
          <BaaApprovalSwitch
            type="stt"
            providerId={sttProviderId}
            providerName={
              STT_PROVIDERS.find((provider) => provider.id === sttProviderId)
                ?.displayName ?? sttProviderId
            }
            approvals={baaApprovals}
            onChange={(value) =>
              setSettingValues({ baa_approved_ai_providers: value })
            }
          />
        )}
      </section>
    </div>
  );
}

function BaaApprovalSwitch({
  type,
  providerId,
  providerName,
  approvals,
  onChange,
}: {
  type: ClinicalAiProviderType;
  providerId: string;
  providerName: string;
  approvals: string;
  onChange: (value: string) => void;
}) {
  const service = type === "llm" ? "language model" : "transcription";
  return (
    <SettingSwitchRow
      title={`Approve ${providerName} for clinical ${service} data`}
      description={`I confirm that my organization has a BAA covering ${providerName} ${service} processing.`}
      checked={isBaaApproved(type, providerId, approvals)}
      onChange={(approved) =>
        onChange(setBaaApproval(approvals, type, providerId, approved))
      }
    />
  );
}
