import type {
  GetMeetingInput,
  GetMeetingTranscriptInput,
  GetRecurringMeetingHistoryInput,
  ListMeetingsInput,
  Meeting,
  MeetingPage,
  TranscriptPage,
} from "@anlg/plugin-db";

import { CONTEXT_TEXT_FIELD } from "./context-text";
import { buildEditMemoTool } from "./edit-memo";
import { buildEditSummaryTool } from "./edit-summary";
import { buildExplainMedicalTermTool } from "./explain-medical-term";
import { buildFindReplaceNoteTool } from "./find-replace-note";
import { buildGetVisitNextStepsTool } from "./get-visit-next-steps";
import {
  buildGetMeetingTool,
  buildGetMeetingTranscriptTool,
  buildGetRecurringMeetingHistoryTool,
  buildListMeetingsTool,
} from "./meetings";
import { buildMoveMeetingContentsTool } from "./move-meeting-contents";
import {
  buildFindRelatedMeetingsTool,
  buildSearchMeetingContentTool,
} from "./note-files";
import { buildSearchCalendarEventsTool } from "./search-calendar-events";
import { buildSearchContactsTool } from "./search-contacts";
import { buildSearchEncounterTranscriptTool } from "./search-encounter-transcript";
import { buildSearchMeetingsTool } from "./search-meetings";
import { buildApplySessionCorrectionTool } from "./session-correction";
import type {
  CalendarEventSearchResult,
  ContactSearchResult,
  WebSearchResponse,
  ToolDependencies,
} from "./types";
import { buildWebSearchTool } from "./web-search";

import type { SearchFilters } from "~/search/contexts/engine/types";

export type { ToolDependencies };
export { CONTEXT_TEXT_FIELD };

function withToolLogging<T extends { execute?: (...args: any[]) => any }>(
  name: string,
  toolDef: T,
): T {
  if (typeof toolDef.execute !== "function") {
    return toolDef;
  }

  return {
    ...toolDef,
    execute: async (...args: Parameters<NonNullable<T["execute"]>>) => {
      if (import.meta.env.DEV) {
        console.log(`[chat/tool:start] ${name}`);
      }

      try {
        const result = await toolDef.execute!(...args);
        if (import.meta.env.DEV) {
          console.log(`[chat/tool:result] ${name}`);
        }
        return result;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error(`[chat/tool:error] ${name}`);
        }
        throw error;
      }
    },
  } as T;
}

export const buildChatTools = (deps: ToolDependencies) => ({
  list_meetings: withToolLogging("list_meetings", buildListMeetingsTool()),
  get_meeting: withToolLogging("get_meeting", buildGetMeetingTool()),
  get_meeting_transcript: withToolLogging(
    "get_meeting_transcript",
    buildGetMeetingTranscriptTool(),
  ),
  get_recurring_meeting_history: withToolLogging(
    "get_recurring_meeting_history",
    buildGetRecurringMeetingHistoryTool(),
  ),
  search_meeting_content: withToolLogging(
    "search_meeting_content",
    buildSearchMeetingContentTool(deps),
  ),
  find_related_meetings: withToolLogging(
    "find_related_meetings",
    buildFindRelatedMeetingsTool(deps),
  ),
  search_meetings: withToolLogging(
    "search_meetings",
    buildSearchMeetingsTool(deps),
  ),
  search_contacts: withToolLogging(
    "search_contacts",
    buildSearchContactsTool(deps),
  ),
  search_calendar_events: withToolLogging(
    "search_calendar_events",
    buildSearchCalendarEventsTool(deps),
  ),
  search_encounter_transcript: withToolLogging(
    "search_encounter_transcript",
    buildSearchEncounterTranscriptTool(deps),
  ),
  explain_medical_term: withToolLogging(
    "explain_medical_term",
    buildExplainMedicalTermTool(deps),
  ),
  get_visit_next_steps: withToolLogging(
    "get_visit_next_steps",
    buildGetVisitNextStepsTool(deps),
  ),
  web_search: withToolLogging("web_search", buildWebSearchTool(deps)),
  edit_memo: withToolLogging("edit_memo", buildEditMemoTool(deps)),
  edit_summary: withToolLogging("edit_summary", buildEditSummaryTool(deps)),
  find_replace_note: withToolLogging(
    "find_replace_note",
    buildFindReplaceNoteTool(deps),
  ),
  apply_session_correction: withToolLogging(
    "apply_session_correction",
    buildApplySessionCorrectionTool(deps),
  ),
  move_meeting_contents: withToolLogging(
    "move_meeting_contents",
    buildMoveMeetingContentsTool(deps),
  ),
});

type LocalTools = {
  list_meetings: {
    input: ListMeetingsInput;
    output: MeetingPage;
  };
  get_meeting: {
    input: GetMeetingInput;
    output: Meeting;
  };
  get_meeting_transcript: {
    input: GetMeetingTranscriptInput;
    output: TranscriptPage;
  };
  get_recurring_meeting_history: {
    input: GetRecurringMeetingHistoryInput;
    output: MeetingPage;
  };
  search_meeting_content: {
    input: { query: string; meeting_ids?: string[]; limit?: number };
    output: {
      query: string;
      scanned?: number;
      message?: string;
      results: Array<{
        meeting_id: string;
        title: string;
        date: string | null;
        score: number;
        snippets: Array<{ section: string; text: string }>;
      }>;
    };
  };
  find_related_meetings: {
    input: { meeting_id?: string; limit?: number };
    output: {
      status: "ok" | "error";
      message?: string;
      meeting_id?: string;
      title?: string;
      results: Array<{
        meeting_id: string;
        title: string;
        date: string | null;
        score: number;
        reasons: string[];
      }>;
    };
  };
  search_meetings: {
    input: {
      query?: string;
      filters?: {
        created_at?:
          | ({
              kind: "absolute";
            } & NonNullable<SearchFilters["created_at"]>)
          | {
              kind: "relative";
              recent_days: number;
            };
      };
      limit?: number;
    };
    output: {
      results: Array<{
        id: string;
        title: string;
        excerpt: string;
        score: number;
        created_at: number;
      }>;
      contextText?: string | null;
    };
  };
  search_contacts: {
    input: { query: string; limit?: number };
    output: {
      query: string;
      results: ContactSearchResult[];
    };
  };
  search_calendar_events: {
    input: { query: string; limit?: number };
    output: {
      query: string;
      results: CalendarEventSearchResult[];
    };
  };
  search_encounter_transcript: {
    input: { session_id?: string; query: string; limit?: number };
    output: {
      session_id: string | null;
      query: string;
      message?: string;
      results: Array<{
        segment_id: string;
        speaker: string;
        start_ms: number;
        end_ms: number;
        text: string;
        score: number;
        source_type: "transcript_direct";
      }>;
    };
  };
  explain_medical_term: {
    input: { session_id?: string; term: string };
    output: {
      term: string;
      message?: string;
      encounter_sources: Array<{
        segment_id: string;
        speaker: string;
        start_ms: number;
        end_ms: number;
        text: string;
      }>;
      medical_sources: Array<{
        pmid: string;
        doi: string;
        title: string;
        journal: string;
        publication_year: number;
        excerpt: string;
        source_url: string;
      }>;
    };
  };
  get_visit_next_steps: {
    input: { session_id?: string };
    output: {
      session_id: string | null;
      message?: string;
      steps: Array<{
        category:
          | "medication_change"
          | "labs"
          | "imaging"
          | "referral"
          | "follow_up"
          | "warning_sign";
        description: string;
        segment_id: string;
        speaker: string;
        start_ms: number;
        end_ms: number;
      }>;
    };
  };
  web_search: {
    input: {
      query: string;
      includeDomains?: string[];
      excludeDomains?: string[];
      limit?: number;
    };
    output: WebSearchResponse;
  };
  edit_memo: {
    input: { sessionId?: string; content: string };
    output: {
      status: string;
      message?: string;
    };
  };
  edit_summary: {
    input: { sessionId?: string; enhancedNoteId?: string; content: string };
    output: {
      status: string;
      message?: string;
      candidates?: Array<{
        enhancedNoteId: string;
        title: string;
        templateId?: string;
        position?: number;
      }>;
    };
  };
  find_replace_note: {
    input: {
      sessionId?: string;
      target: "memo" | "summary";
      enhancedNoteId?: string;
      find: string;
      replace: string;
      matchWholeWord?: boolean;
    };
    output: {
      status: string;
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
  };
  apply_session_correction: {
    input: {
      sessionId?: string;
      target?: "summary" | "transcript" | "summary_and_transcript";
      enhancedNoteId?: string;
      oldText: string;
      newText: string;
      dictionaryTerms?: string[];
    };
    output: {
      status: string;
      message?: string;
      sessionId?: string;
      summaryChanges?: Array<{
        enhancedNoteId: string;
        title: string;
        replacements: number;
      }>;
      transcriptChanges?: Array<{
        transcriptId: string;
        wordReplacements: number;
        memoReplacements: number;
      }>;
      titleChange?: {
        replacements: number;
        nextTitle: string;
      };
      dictionaryChanges?: {
        addedTerms: string[];
      };
    };
  };
  move_meeting_contents: {
    input: {
      sourceMeetingId?: string;
      targetMeetingId: string;
    };
    output: {
      status: string;
      message?: string;
      sourceMeetingId?: string;
      targetMeetingId?: string;
      sourceTitle?: string;
      targetTitle?: string;
      moved?: {
        recording: boolean;
        transcripts: number;
        summaries: number;
        notes: boolean;
        actionItems: number;
      };
    };
  };
};

export type Tools = LocalTools;

export type ToolPartType = `tool-${keyof Tools}`;
