import { useLingui } from "@lingui/react/macro";
import { CaretDown, CaretLeft, CaretRight, Check } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@anlg/ui/components/ui/button";
import {
  AppFloatingPanel,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { cn } from "@anlg/utils";

import { useConfiguredMapping } from "~/settings/ai/llm/select";
import { PROVIDERS } from "~/settings/ai/llm/shared";
import { ProviderButtonIcon } from "~/settings/ai/shared";
import { setSettingValues } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";

// The current chat model, resolved from the same settings the full
// Intelligence settings page reads — shared by the "Powered by" label under
// the loading indicator and this switcher's trigger button.
export function useCurrentChatModelLabel(): {
  providerDisplayName: string;
  modelId: string;
} | null {
  const { current_llm_provider, current_llm_model } = useConfigValues([
    "current_llm_provider",
    "current_llm_model",
  ]);
  if (!current_llm_provider || !current_llm_model) {
    return null;
  }

  const provider = PROVIDERS.find(({ id }) => id === current_llm_provider);
  return {
    providerDisplayName: provider?.displayName ?? current_llm_provider,
    modelId: current_llm_model,
  };
}

export function ModelSwitcher({
  surface = "light",
  className,
}: {
  surface?: "light" | "dark";
  className?: string;
}) {
  const { t } = useLingui();
  const isDark = surface === "dark";
  const [isOpen, setIsOpen] = useState(false);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(
    null,
  );
  const { providers } = useConfiguredMapping();
  const { current_llm_provider, current_llm_model } = useConfigValues([
    "current_llm_provider",
    "current_llm_model",
  ]);
  const current = useCurrentChatModelLabel();

  const configuredProviders = PROVIDERS.filter(
    ({ id }) => providers[id]?.configured,
  );
  const expandedProvider = expandedProviderId
    ? PROVIDERS.find(({ id }) => id === expandedProviderId)
    : undefined;

  const modelsQuery = useQuery({
    queryKey: ["chat-model-switcher-models", expandedProviderId],
    queryFn: () => providers[expandedProviderId!]!.listModels!(),
    enabled:
      !!expandedProviderId && !!providers[expandedProviderId]?.listModels,
  });

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    if (!next) {
      setExpandedProviderId(null);
    }
  };

  const handleSelectModel = (providerId: string, modelId: string) => {
    void setSettingValues({
      current_llm_provider: providerId,
      current_llm_model: modelId,
    }).catch((error) => {
      console.error("[chat] failed to switch model", error);
    });
    setIsOpen(false);
    setExpandedProviderId(null);
  };

  if (configuredProviders.length === 0) {
    return null;
  }

  const rowClassName = cn([
    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
    isDark
      ? "text-primary-foreground/85 hover:bg-primary-foreground/10"
      : "text-foreground hover:bg-muted/60",
  ]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t`Switch model`}
          data-tauri-drag-region="false"
          variant="ghost"
          size="sm"
          className={cn([
            "h-8 w-auto max-w-40 shrink-0 gap-1.5 rounded-full px-2.5 py-0 transition-colors",
            isDark
              ? "text-primary-foreground/70 hover:bg-primary-foreground/14 hover:text-primary-foreground data-[state=open]:bg-primary-foreground/14 data-[state=open]:text-primary-foreground"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground data-[state=open]:bg-muted/80 data-[state=open]:text-foreground",
            className,
          ])}
        >
          <span className="min-w-0 truncate text-xs font-medium">
            {current
              ? `${current.providerDisplayName} · ${current.modelId}`
              : t`Select model`}
          </span>
          <CaretDown
            className={cn([
              "h-3 w-3 shrink-0 transition-transform duration-200",
              isOpen && "rotate-180",
            ])}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        variant="app"
        align="start"
        sideOffset={4}
        className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto"
      >
        <AppFloatingPanel className="p-1.5">
          {expandedProvider ? (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setExpandedProviderId(null)}
                className={cn([rowClassName, "text-muted-foreground gap-1"])}
              >
                <CaretLeft size={12} />
                {expandedProvider.displayName}
              </button>
              {modelsQuery.isLoading ? (
                <p className="text-muted-foreground px-2.5 py-1.5 text-xs">
                  {t`Loading models…`}
                </p>
              ) : null}
              {(modelsQuery.data?.models ?? []).map((modelId) => (
                <button
                  key={modelId}
                  type="button"
                  onClick={() =>
                    handleSelectModel(expandedProvider.id, modelId)
                  }
                  className={rowClassName}
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {modelId === current_llm_model &&
                    expandedProvider.id === current_llm_provider ? (
                      <Check size={12} />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{modelId}</span>
                </button>
              ))}
              {modelsQuery.data && modelsQuery.data.models.length === 0 ? (
                <p className="text-muted-foreground px-2.5 py-1.5 text-xs">
                  {t`No models found.`}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {configuredProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setExpandedProviderId(provider.id)}
                  className={rowClassName}
                >
                  <ProviderButtonIcon>{provider.icon}</ProviderButtonIcon>
                  <span className="min-w-0 flex-1 truncate">
                    {provider.displayName}
                  </span>
                  {provider.id === current_llm_provider ? (
                    <Check size={12} className="shrink-0" />
                  ) : null}
                  <CaretRight
                    size={12}
                    className="text-muted-foreground shrink-0"
                  />
                </button>
              ))}
            </div>
          )}
        </AppFloatingPanel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
