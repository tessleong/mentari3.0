import { ToolEditMemo, ToolEditSummary } from "./edit-summary";
import { ToolExplainMedicalTerm } from "./explain-medical-term";
import { ToolFindReplaceNote } from "./find-replace-note";
import { ToolGeneric } from "./generic";
import { ToolGetVisitNextSteps } from "./get-visit-next-steps";
import { ToolSearchEncounterTranscript } from "./search-encounter-transcript";
import { ToolSearchMeetings } from "./search-meetings";
import { ToolUpdatePromptTemplate } from "./update-prompt-template";

import type { Part } from "~/chat/components/message/types";

type ToolComponent = (props: { part: Part }) => React.ReactNode;

const toolRegistry: Record<string, ToolComponent> = {
  "tool-list_meetings": ToolSearchMeetings as ToolComponent,
  "tool-search_meetings": ToolSearchMeetings as ToolComponent,
  "tool-search_sessions": ToolSearchMeetings as ToolComponent,
  "tool-edit_memo": ToolEditMemo as ToolComponent,
  "tool-edit_summary": ToolEditSummary as ToolComponent,
  "tool-find_replace_note": ToolFindReplaceNote as ToolComponent,
  "tool-update_prompt_template": ToolUpdatePromptTemplate as ToolComponent,
  "tool-search_encounter_transcript":
    ToolSearchEncounterTranscript as ToolComponent,
  "tool-explain_medical_term": ToolExplainMedicalTerm as ToolComponent,
  "tool-get_visit_next_steps": ToolGetVisitNextSteps as ToolComponent,
};

export function Tool({ part }: { part: Part }) {
  const Renderer = toolRegistry[part.type];
  if (Renderer) {
    return <Renderer part={part} />;
  }
  return <ToolGeneric part={part as Record<string, unknown>} />;
}
