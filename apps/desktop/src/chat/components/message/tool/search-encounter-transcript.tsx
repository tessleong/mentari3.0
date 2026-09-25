import { Quotes } from "@phosphor-icons/react";

import { defineTool } from "./define-tool";
import { ToolCardBody } from "./shared";

import { parseMcpObjectOutput } from "~/chat/mcp/mcp-output-parser";

type EncounterSegmentResult = {
  segment_id: string;
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
  score: number;
};

type SearchEncounterTranscriptOutput = {
  query?: string;
  message?: string;
  results?: EncounterSegmentResult[];
};

function parseOutput(output: unknown): SearchEncounterTranscriptOutput | null {
  return parseMcpObjectOutput<SearchEncounterTranscriptOutput>(output);
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const ToolSearchEncounterTranscript = defineTool({
  icon: <Quotes />,
  parseFn: parseOutput,
  isDone: (parsed) => parsed != null,
  label: ({ running, failed, parsed }) => {
    if (running) return "Searching this encounter's transcript…";
    if (failed) return "Transcript search failed";
    const count = parsed?.results?.length ?? 0;
    if (count === 0) return "No matching transcript segments";
    return `Found ${count} transcript segment${count === 1 ? "" : "s"}`;
  },
  renderSuccess: (parsed) => {
    const results = parsed.results ?? [];
    if (results.length === 0) {
      return parsed.message ? (
        <ToolCardBody>
          <p className="text-muted-foreground text-xs">{parsed.message}</p>
        </ToolCardBody>
      ) : null;
    }

    return (
      <ToolCardBody>
        <div className="flex flex-col gap-2">
          {results.map((result) => (
            <SegmentCard key={result.segment_id} result={result} />
          ))}
        </div>
      </ToolCardBody>
    );
  },
});

function SegmentCard({ result }: { result: EncounterSegmentResult }) {
  return (
    <article className="border-border/80 rounded-lg border p-2.5">
      <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
        <span className="font-medium">{result.speaker}</span>
        <span className="tabular-nums">{formatTimestamp(result.start_ms)}</span>
      </div>
      <p className="mt-1 text-[12px] leading-4">“{result.text}”</p>
    </article>
  );
}
