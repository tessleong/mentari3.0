import { MagnifyingGlass } from "@phosphor-icons/react";

import { defineTool } from "./define-tool";
import { EditActions } from "./edit-summary";
import { ToolCardBody, ToolCardFooterError, ToolCardFooters } from "./shared";

import { parseMcpObjectOutput } from "~/chat/mcp/mcp-output-parser";

type FindReplaceNoteOutput = {
  status?: string;
  target?: "memo" | "summary";
  message?: string;
  replacements?: number;
  candidates?: Array<{
    enhancedNoteId: string;
    title: string;
    templateId?: string;
    position?: number;
  }>;
};

function parseFindReplaceNoteOutput(
  output: unknown,
): FindReplaceNoteOutput | null {
  return parseMcpObjectOutput<FindReplaceNoteOutput>(output);
}

export const ToolFindReplaceNote = defineTool({
  icon: <MagnifyingGlass />,
  parseFn: parseFindReplaceNoteOutput,
  isDone: (parsed) => parsed?.status === "applied",
  label: ({ running, failed, parsed }) => {
    if (running) return "Find & replace — review tab opened";
    if (failed) return "Find & replace failed";
    if (parsed?.status === "applied") return "Replacement applied";
    if (parsed?.status === "declined") return "Replacement declined";
    if (parsed?.status === "not_found") return "No match found";
    return "Find & replace";
  },
  renderBody: (input) =>
    input?.find ? (
      <ToolCardBody>
        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-foreground line-through">{input.find}</span>
          <span>&rarr;</span>
          <span className="text-foreground">
            {input.replace || "(removed)"}
          </span>
        </div>
      </ToolCardBody>
    ) : null,
  renderFooter: ({ failed, errorText, parsed, toolCallId }) => (
    <>
      <ToolCardFooters failed={failed} errorText={errorText} rawText={null}>
        {parsed?.status === "error" || parsed?.status === "not_found" ? (
          <div className="space-y-2">
            <ToolCardFooterError text={parsed.message ?? "Unknown error"} />
            {parsed.candidates && parsed.candidates.length > 0 ? (
              <div className="border-border bg-muted text-muted-foreground space-y-1 rounded-md border p-2 text-[12px]">
                {parsed.candidates.map((candidate) => (
                  <div key={candidate.enhancedNoteId}>
                    {candidate.title} ({candidate.enhancedNoteId})
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </ToolCardFooters>
      {parsed?.target ? (
        <EditActions toolCallId={toolCallId} target={parsed.target} />
      ) : null}
    </>
  ),
});
