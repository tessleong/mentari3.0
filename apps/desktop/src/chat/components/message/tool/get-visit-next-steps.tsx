import {
  Camera,
  CalendarCheck,
  Pill,
  TestTube,
  UserSwitch,
  Warning,
  type Icon,
} from "@phosphor-icons/react";

import { cn } from "@anlg/utils";

import { defineTool } from "./define-tool";
import { ToolCardBody } from "./shared";

import { parseMcpObjectOutput } from "~/chat/mcp/mcp-output-parser";

type NextStepCategory =
  | "medication_change"
  | "labs"
  | "imaging"
  | "referral"
  | "follow_up"
  | "warning_sign";

type NextStepItem = {
  category: NextStepCategory;
  description: string;
  segment_id: string;
  speaker: string;
  start_ms: number;
  end_ms: number;
};

type GetVisitNextStepsOutput = {
  session_id?: string | null;
  message?: string;
  steps?: NextStepItem[];
};

function parseOutput(output: unknown): GetVisitNextStepsOutput | null {
  return parseMcpObjectOutput<GetVisitNextStepsOutput>(output);
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const CATEGORY_META: Record<
  NextStepCategory,
  { label: string; icon: Icon; tone: "urgent" | "default" }
> = {
  warning_sign: { label: "Warning sign", icon: Warning, tone: "urgent" },
  medication_change: { label: "Medication", icon: Pill, tone: "default" },
  labs: { label: "Labs", icon: TestTube, tone: "default" },
  imaging: { label: "Imaging", icon: Camera, tone: "default" },
  referral: { label: "Referral", icon: UserSwitch, tone: "default" },
  follow_up: { label: "Follow-up", icon: CalendarCheck, tone: "default" },
};

export const ToolGetVisitNextSteps = defineTool({
  icon: <CalendarCheck />,
  parseFn: parseOutput,
  isDone: (parsed) => parsed != null,
  label: ({ running, failed, parsed }) => {
    if (running) return "Finding next steps…";
    if (failed) return "Couldn't find next steps";
    const count = parsed?.steps?.length ?? 0;
    if (count === 0) return "No next steps found";
    return `Found ${count} next step${count === 1 ? "" : "s"}`;
  },
  renderSuccess: (parsed) => {
    const steps = parsed.steps ?? [];
    if (steps.length === 0) {
      return parsed.message ? (
        <ToolCardBody>
          <p className="text-muted-foreground text-xs">{parsed.message}</p>
        </ToolCardBody>
      ) : null;
    }

    return (
      <ToolCardBody>
        <div className="flex flex-col gap-2">
          {steps.map((step, index) => (
            <NextStepCard key={`${step.segment_id}-${index}`} step={step} />
          ))}
        </div>
        <p className="text-muted-foreground text-[11px] leading-4">
          Heuristic matches against the transcript — verify each against its
          source before treating it as a confirmed instruction.
        </p>
      </ToolCardBody>
    );
  },
});

function NextStepCard({ step }: { step: NextStepItem }) {
  const meta = CATEGORY_META[step.category];
  const StepIcon = meta.icon;

  return (
    <article className="border-border/80 rounded-lg border p-2.5">
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className={cn([
            "flex items-center gap-1 font-medium",
            meta.tone === "urgent"
              ? "text-destructive"
              : "text-muted-foreground",
          ])}
        >
          <StepIcon className="size-3" weight="bold" />
          {meta.label}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{step.speaker}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatTimestamp(step.start_ms)}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-4">{step.description}</p>
    </article>
  );
}
