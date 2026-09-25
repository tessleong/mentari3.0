import { Quotes, BookOpenText } from "@phosphor-icons/react";

import { defineTool } from "./define-tool";
import { ToolCardBody } from "./shared";

import { parseMcpObjectOutput } from "~/chat/mcp/mcp-output-parser";
import { SourceBadge } from "~/clinical/source-badge";
import { StudyDesignBadge } from "~/clinical/study-design-badge";

type EncounterSource = {
  segment_id: string;
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
};

type MedicalSource = {
  pmid: string;
  doi: string;
  title: string;
  journal: string;
  publication_year: number;
  excerpt: string;
  source_url: string;
  source_id: string;
  source_label: string;
  study_design?: string;
};

type ExplainMedicalTermOutput = {
  term?: string;
  message?: string;
  encounter_sources?: EncounterSource[];
  medical_sources?: MedicalSource[];
};

function parseOutput(output: unknown): ExplainMedicalTermOutput | null {
  return parseMcpObjectOutput<ExplainMedicalTermOutput>(output);
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const ToolExplainMedicalTerm = defineTool({
  icon: <BookOpenText />,
  parseFn: parseOutput,
  isDone: (parsed) => parsed != null,
  label: ({ running, failed, parsed }) => {
    if (running) return "Looking into this…";
    if (failed) return "Couldn't look into this";
    const term = parsed?.term;
    return term ? `About "${term}"` : "Explained";
  },
  renderSuccess: (parsed) => {
    const encounterSources = parsed.encounter_sources ?? [];
    const medicalSources = parsed.medical_sources ?? [];
    if (encounterSources.length === 0 && medicalSources.length === 0) {
      return parsed.message ? (
        <ToolCardBody>
          <p className="text-muted-foreground text-xs">{parsed.message}</p>
        </ToolCardBody>
      ) : null;
    }

    return (
      <ToolCardBody>
        <div className="flex flex-col gap-3">
          {encounterSources.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-[0.06em] uppercase">
                <Quotes className="size-3" />
                From your visit
              </h3>
              {encounterSources.map((source) => (
                <article
                  key={source.segment_id}
                  className="border-border/80 rounded-lg border p-2.5"
                >
                  <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
                    <span className="font-medium">{source.speaker}</span>
                    <span className="tabular-nums">
                      {formatTimestamp(source.start_ms)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-4">“{source.text}”</p>
                </article>
              ))}
            </section>
          ) : null}
          {medicalSources.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-[0.06em] uppercase">
                <BookOpenText className="size-3" />
                Medical sources
              </h3>
              {medicalSources.map((source) => (
                <article
                  key={source.source_url || `${source.pmid}-${source.title}`}
                  className="border-border/80 rounded-lg border p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      className="hover:text-primary line-clamp-2 text-[13px] font-medium"
                      href={source.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title}
                    </a>
                    <span className="mt-0.5 flex shrink-0 items-center gap-1">
                      {source.study_design ? (
                        <StudyDesignBadge studyDesign={source.study_design} />
                      ) : null}
                      <SourceBadge sourceId={source.source_id} />
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    {source.journal || "Unknown journal"}
                    {source.publication_year
                      ? ` · ${source.publication_year}`
                      : ""}
                    {source.pmid ? ` · PMID ${source.pmid}` : ""}
                  </p>
                  {source.excerpt ? (
                    <p className="text-muted-foreground mt-1.5 line-clamp-3 text-[12px] leading-4">
                      “{source.excerpt}”
                    </p>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </div>
      </ToolCardBody>
    );
  },
});
