import { Trans, useLingui } from "@lingui/react/macro";
import { CircleNotch } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";

import { Button } from "@anlg/ui/components/ui/button";
import { Input } from "@anlg/ui/components/ui/input";
import { cn } from "@anlg/utils";

import { useAuth } from "~/auth";
import { useIngestMedlinePlus, useIngestPubMed } from "~/clinical/repository";
import { SourceBadge } from "~/clinical/source-badge";
import {
  type EvidenceSourceStatus,
  useEvidenceSources,
} from "~/clinical/sources";
import { SettingsPageTitle } from "~/settings/page-title";

export function SettingsSources() {
  const auth = useAuth();
  const { data: sources = [] } = useEvidenceSources();
  const defaultEmail = auth.session?.user?.email ?? "";

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageTitle title={<Trans>Research sources</Trans>} />
      <p className="text-muted-foreground -mt-4 text-sm">
        <Trans>
          Citations Mentari shows are pulled from these medical literature
          sources. Mentari has no formal partnership with any of them — only
          sources marked "Connected" have a working integration today.
        </Trans>
      </p>

      <div className="flex flex-col gap-2">
        {sources.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase">
          <Trans>Sync evidence</Trans>
        </h3>
        <PubMedIngestForm defaultEmail={defaultEmail} />
        <MedlinePlusIngestForm defaultEmail={defaultEmail} />
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: EvidenceSourceStatus }) {
  const isConnected = source.enabled && source.accessMode === "open";

  return (
    <div className="border-border/60 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <SourceBadge sourceId={source.id} />
        <span className="text-foreground truncate text-sm font-medium">
          {source.displayName}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={cn([
            "text-xs font-medium",
            isConnected ? "text-emerald-600" : "text-muted-foreground",
          ])}
        >
          {isConnected ? (
            <Trans>Connected</Trans>
          ) : (
            <Trans>Not yet connected</Trans>
          )}
        </span>
        {source.termsUrl ? (
          <a
            href={source.termsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          >
            <Trans>Terms</Trans>
          </a>
        ) : null}
      </div>
    </div>
  );
}

function PubMedIngestForm({ defaultEmail }: { defaultEmail: string }) {
  const { t } = useLingui();
  const ingest = useIngestPubMed();
  const form = useForm({
    defaultValues: { query: "", email: defaultEmail },
    onSubmit: ({ value }) => ingest.mutate(value),
  });

  return (
    <div className="border-border/60 flex flex-col gap-2 rounded-2xl border p-4">
      <div>
        <h3 className="text-sm font-medium">PubMed</h3>
        <p className="text-muted-foreground text-xs">
          <Trans>
            Searches PubMed for articles matching your query and adds them to
            Mentari's local evidence library.
          </Trans>
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <form.Field name="query">
          {(field) => (
            <Input
              className="w-56"
              placeholder={t`Search term, e.g. hypertension`}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <Input
              className="w-56"
              placeholder={t`Contact email`}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <Button type="submit" size="sm" disabled={ingest.isPending}>
          {ingest.isPending ? (
            <CircleNotch className="size-4 animate-spin" />
          ) : (
            <Trans>Sync now</Trans>
          )}
        </Button>
      </form>
      {ingest.isSuccess ? (
        <p className="text-xs text-emerald-600">
          <Trans>Synced {ingest.data} articles.</Trans>
        </p>
      ) : null}
      {ingest.isError ? (
        <p className="text-xs text-red-500">{ingest.error.message}</p>
      ) : null}
    </div>
  );
}

function MedlinePlusIngestForm({ defaultEmail }: { defaultEmail: string }) {
  const { t } = useLingui();
  const ingest = useIngestMedlinePlus();
  const form = useForm({
    defaultValues: { query: "", email: defaultEmail },
    onSubmit: ({ value }) => ingest.mutate(value),
  });

  return (
    <div className="border-border/60 flex flex-col gap-2 rounded-2xl border p-4">
      <div>
        <h3 className="text-sm font-medium">MedlinePlus</h3>
        <p className="text-muted-foreground text-xs">
          <Trans>
            Searches MedlinePlus health topics and adds them to the same
            library.
          </Trans>
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <form.Field name="query">
          {(field) => (
            <Input
              className="w-56"
              placeholder={t`Search term, e.g. diabetes`}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <Input
              className="w-56"
              placeholder={t`Contact email`}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <Button type="submit" size="sm" disabled={ingest.isPending}>
          {ingest.isPending ? (
            <CircleNotch className="size-4 animate-spin" />
          ) : (
            <Trans>Sync now</Trans>
          )}
        </Button>
      </form>
      {ingest.isSuccess ? (
        <p className="text-xs text-emerald-600">
          <Trans>Synced {ingest.data} articles.</Trans>
        </p>
      ) : null}
      {ingest.isError ? (
        <p className="text-xs text-red-500">{ingest.error.message}</p>
      ) : null}
    </div>
  );
}
