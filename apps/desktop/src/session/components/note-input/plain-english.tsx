import { ArrowRight, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { Button } from "@anlg/ui/components/ui/button";

import { useLanguageModel, useLLMConnectionStatus } from "~/ai/hooks";
import {
  translatePlainEnglish,
  type PlainEnglishLine,
} from "~/clinical/plain-english-translation";
import { fetchClinicalEvidenceByPmids } from "~/clinical/repository";
import { ConfigError } from "~/session/components/note-input/enhanced/config-error";
import { shouldShowEmptySummaryConfigError } from "~/session/enhance-config";

// A stable reference (not a fresh `[]` literal every render) so the
// useMemo below actually memoizes while the query is loading/undefined,
// instead of recomputing on every render.
const EMPTY_LINES: PlainEnglishLine[] = [];

export function PlainEnglishView({ sessionId }: { sessionId: string }) {
  const model = useLanguageModel("enhance");
  const llmStatus = useLLMConnectionStatus();
  const isConfigError = shouldShowEmptySummaryConfigError(llmStatus);

  const query = useQuery({
    queryKey: ["plain-english-translation", sessionId, modelIdentity(model)],
    queryFn: ({ signal }) => translatePlainEnglish(sessionId, model!, signal),
    enabled: !!model,
    staleTime: Infinity,
  });

  const lines = query.data ?? EMPTY_LINES;
  const citedPmids = useMemo(
    () => [...new Set(lines.flatMap((line) => line.citedPmids))],
    [lines],
  );
  const citedSourcesQuery = useQuery({
    queryKey: ["plain-english-cited-sources", citedPmids.join(",")],
    queryFn: () => fetchClinicalEvidenceByPmids(citedPmids),
    enabled: citedPmids.length > 0,
  });
  const sourceByPmid = useMemo(
    () =>
      new Map(
        (citedSourcesQuery.data ?? []).map((source) => [
          source.article.pmid,
          source.article,
        ]),
      ),
    [citedSourcesQuery.data],
  );

  if (isConfigError && !model) {
    return <ConfigError status={llmStatus} />;
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          role="progressbar"
          aria-label="Translating the transcript into plain English"
          className="bg-muted relative h-1.5 w-48 overflow-hidden rounded-full"
        >
          <span
            aria-hidden="true"
            className="animate-shimmer via-foreground/40 absolute inset-0 -translate-x-full bg-linear-to-r from-transparent to-transparent"
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Reviewing the transcript for terms to clarify…
        </p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <WarningCircle className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">Couldn't translate the transcript</p>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {query.error instanceof Error
            ? query.error.message
            : "Something went wrong."}
        </p>
        <Button size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center px-6 text-center">
        <p className="text-muted-foreground text-sm">
          No transcript to translate yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      {lines.map((line) => (
        <PlainEnglishLineRow
          key={line.segmentId}
          line={line}
          sourceByPmid={sourceByPmid}
        />
      ))}
    </div>
  );
}

function PlainEnglishLineRow({
  line,
  sourceByPmid,
}: {
  line: PlainEnglishLine;
  sourceByPmid: Map<
    string,
    Awaited<ReturnType<typeof fetchClinicalEvidenceByPmids>>[number]["article"]
  >;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-muted-foreground flex items-baseline gap-2 text-[11px]">
        <span className="font-medium">{line.speaker}</span>
        <span className="tabular-nums">{formatTimestamp(line.startMs)}</span>
      </div>
      <p className="text-foreground text-sm leading-snug">“{line.text}”</p>
      {line.plainEnglish ? (
        <div className="flex items-start gap-2 pl-4">
          <ArrowRight className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-sm leading-snug">
              {line.plainEnglish}
            </p>
            {line.citedPmids.map((pmid) => {
              const article = sourceByPmid.get(pmid);
              if (!article) return null;
              return (
                <a
                  key={pmid}
                  href={article.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground/75 hover:text-muted-foreground w-fit text-xs underline-offset-2 hover:underline"
                >
                  {article.title}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function modelIdentity(model: ReturnType<typeof useLanguageModel>): string {
  if (!model) return "";
  return typeof model === "string"
    ? model
    : `${model.provider}:${model.modelId}`;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
