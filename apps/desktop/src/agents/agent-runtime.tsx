import { useEffect, useRef } from "react";

import { LOOKUP_TOOL } from "./kernel/explainer";
import { LOCAL_TOOL, SEARCH_TOOL } from "./kernel/research";
import { PREFETCH_TOOL } from "./kernel/scribe-policy";
import { createToolRunner } from "./kernel/tool-runner";
import { useAgentPanels } from "./panels";
import type { AgentRole } from "./personality";
import { startAgentRun } from "./runtime";

import {
  useLanguageModel,
  useLLMConnection,
} from "~/ai/hooks/useLLMConnection";
import { useOptionalAuth } from "~/auth/auth-context";
import { searchClinicalEvidence } from "~/clinical/repository";
import { isBaaApproved, isLocalLlmConnection } from "~/settings/ai/baa-policy";
import { useConfigValue } from "~/shared/config";
import { listenerStore } from "~/store/zustand/listener/instance";

const MAX_TRANSCRIPT = 16_000;
const EVIDENCE_LIMIT = 5;

type EvidenceRow = Awaited<ReturnType<typeof searchClinicalEvidence>>[number];

/** Shapes stored evidence into what the research policy stances on. Stance is
 * left unclear: it is established by citation verification, never assumed. */
const toEvidence = (rows: EvidenceRow[]) =>
  rows.map((row) => ({
    id: String(row.article.id ?? row.article.source_url ?? row.article.title),
    title: row.article.title,
    excerpt: row.evidenceExcerpt,
    url: row.article.source_url ?? undefined,
    stance: "unclear" as const,
  }));

const readLiveTranscript = () =>
  listenerStore
    .getState()
    .liveSegments.map((segment) => segment.text)
    .join("\n")
    .slice(-MAX_TRANSCRIPT);

/**
 * Drives the agents the picker starts.
 *
 * Watches the panel store for a panel opened on a goal that has not run yet and
 * runs it with the live model, under the clinical PHI routing policy. Agents
 * run concurrently; each goal is started once.
 */
export function AgentRuntime() {
  const runs = useAgentPanels((state) => state.runs);
  const model = useLanguageModel();
  const { conn } = useLLMConnection();
  // Agents run local-first, so a signed-out user still gets them; the audit
  // log records the actor as local rather than refusing the run.
  const session = useOptionalAuth()?.session;
  const baaApprovals = useConfigValue("baa_approved_ai_providers");
  const started = useRef(new Set<string>());

  useEffect(() => {
    if (!model || !conn) return;

    const runTools = createToolRunner({
      tools: {
        [SEARCH_TOOL]: async (input) =>
          toEvidence(
            await searchClinicalEvidence(String(input), EVIDENCE_LIMIT),
          ),
        // Answers from evidence already on this machine, which is what makes a
        // PHI-blocked round recoverable rather than lost.
        [LOCAL_TOOL]: async (input) =>
          toEvidence(
            await searchClinicalEvidence(String(input), EVIDENCE_LIMIT),
          ),
        [LOOKUP_TOOL]: async (input) => {
          const [first] = await searchClinicalEvidence(String(input), 1);
          return first?.evidenceExcerpt ?? null;
        },
        [PREFETCH_TOOL]: async (input) => {
          await searchClinicalEvidence(String(input), EVIDENCE_LIMIT);
          return null;
        },
      },
      route: {
        actorId: session?.user.id ?? "local",
        providerId: conn.providerId,
        local: isLocalLlmConnection(conn.providerId, conn.baseUrl),
        baaAttested: isBaaApproved("llm", conn.providerId, baaApprovals),
      },
    });

    for (const [role, run] of Object.entries(runs)) {
      // A goal with no steps yet is a panel the picker has just opened.
      if (!run?.goal || run.steps.length > 0) continue;
      const key = `${role}\0${run.goal}`;
      if (started.current.has(key)) continue;
      started.current.add(key);

      void startAgentRun({
        role: role as AgentRole,
        goal: run.goal,
        model,
        runTools,
        readTranscript: readLiveTranscript,
      });
    }
  }, [runs, model, conn, session, baaApprovals]);

  return null;
}
