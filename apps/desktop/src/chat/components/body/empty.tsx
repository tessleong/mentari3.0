import { t } from "@lingui/core/macro";
import {
  ArrowsClockwise,
  BookOpen,
  ClipboardText,
  Envelope,
  Info,
  ListChecks,
  MagnifyingGlass,
  Pill,
  Question,
  Sparkle,
  Stethoscope,
} from "@phosphor-icons/react";
import type { ChatStatus } from "ai";
import { useCallback, useMemo, useState } from "react";

import { cn } from "@anlg/utils";

import { LoadingMessage } from "../message/loading";
import { useMinimumVisibleDuration } from "./use-minimum-visible-duration";

import type { ContextRef } from "~/chat/context/entities";
import { useChatAppearance } from "~/chat/hooks/use-chat-appearance";
import { useCurrentNoteSources } from "~/chat/hooks/use-current-note-sources";
import { useTabs } from "~/store/zustand/tabs";

const PATIENT_SUGGESTION_COUNT = 3;
const MIN_LOADING_VISIBLE_MS = 500;

function pickRandomSuggestions<T>(pool: readonly T[], count: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function ChatBodyEmpty({
  sessionId,
  status,
  isModelConfigured = true,
  hasContext = false,
  isPatientContext = false,
  onSendMessage,
}: {
  sessionId?: string;
  status?: ChatStatus;
  isModelConfigured?: boolean;
  hasContext?: boolean;
  isPatientContext?: boolean;
  onSendMessage?: (
    content: string,
    parts: Array<{ type: "text"; text: string }>,
    contextRefs?: ContextRef[],
  ) => void;
}) {
  const { isDarkAppearance } = useChatAppearance();
  const openNew = useTabs((state) => state.openNew);
  const noteSources = useCurrentNoteSources(sessionId ?? "");
  const topSource = noteSources[0]?.article;

  const generalSuggestions = [
    {
      label: t`List action items.`,
      icon: ListChecks,
      prompt: t`What are my action items from this meeting?`,
    },
    {
      label: t`Draft follow-up email.`,
      icon: Envelope,
      prompt: t`Draft a follow-up email to the participants`,
    },
    {
      label: t`Find key decisions.`,
      icon: MagnifyingGlass,
      prompt: t`What were the key decisions that have been made?`,
    },
  ];

  // Translation functions require the locale to already be active, so this
  // pool must be built at render time, not module scope.
  const patientSuggestionPool = useMemo(
    () =>
      [
        {
          label: t`Explain my diagnosis.`,
          icon: Stethoscope,
          prompt: t`Explain my diagnosis from this visit in plain language.`,
        },
        {
          label: t`Explain this medication.`,
          icon: Pill,
          prompt: t`Explain what the medication discussed is for and how to take it.`,
        },
        {
          label: t`Summarize my treatment plan.`,
          icon: ClipboardText,
          prompt: t`Summarize my treatment plan from this visit in simple terms.`,
        },
        {
          label: t`What should I ask next visit?`,
          icon: Question,
          prompt: t`What follow-up questions should I ask at my next visit?`,
        },
        {
          label: t`What do these results mean?`,
          icon: MagnifyingGlass,
          prompt: t`What do the test results discussed in this visit mean?`,
        },
        {
          label: t`What risks were discussed?`,
          icon: Info,
          prompt: t`What risks or side effects were discussed during this visit?`,
        },
        {
          label: t`Draft questions for my doctor.`,
          icon: Envelope,
          prompt: t`Draft a list of questions I should ask my doctor about this visit.`,
        },
      ] as const,
    [],
  );

  const [patientSuggestions, setPatientSuggestions] = useState(() =>
    pickRandomSuggestions(patientSuggestionPool, PATIENT_SUGGESTION_COUNT),
  );
  const refreshPatientSuggestions = useCallback(() => {
    setPatientSuggestions(
      pickRandomSuggestions(patientSuggestionPool, PATIENT_SUGGESTION_COUNT),
    );
  }, [patientSuggestionPool]);

  // Once a source is cited in this visit's summary, always keep one
  // suggestion grounded in it — refreshing only rotates the generic slots —
  // so the user sees Ask Mentari already knows about the retrieved research.
  const sourceSuggestion = useMemo(
    () =>
      topSource
        ? {
            label: t`Ask about "${topSource.title}".`,
            icon: BookOpen,
            prompt: t`How does the study "${topSource.title}" relate to what was discussed in this visit?`,
          }
        : null,
    [topSource],
  );

  const suggestions = isPatientContext
    ? sourceSuggestion
      ? [
          sourceSuggestion,
          ...patientSuggestions.slice(0, PATIENT_SUGGESTION_COUNT - 1),
        ]
      : patientSuggestions
    : generalSuggestions;

  const handleGoToSettings = useCallback(() => {
    openNew({ type: "settings", state: { tab: "intelligence" } });
  }, [openNew]);

  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      onSendMessage?.(prompt, [{ type: "text", text: prompt }]);
    },
    [onSendMessage],
  );

  const showLoadingState = useMinimumVisibleDuration(
    status === "submitted" || status === "streaming",
    MIN_LOADING_VISIBLE_MS,
  );
  if (showLoadingState) {
    return <LoadingMessage />;
  }

  if (!isModelConfigured) {
    return (
      <div className="flex justify-start py-2 pb-1">
        <div className="flex w-full flex-col">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={cn([
                "text-sm font-medium",
                isDarkAppearance
                  ? "text-primary-foreground"
                  : "text-foreground",
              ])}
            >
              Mentari AI
            </span>
            <BetaChip isDarkAppearance={isDarkAppearance} />
          </div>
          <p
            className={cn([
              "mb-2 text-sm",
              isDarkAppearance
                ? "text-primary-foreground/80"
                : "text-muted-foreground",
            ])}
          >
            {t`Hi, I'm Mentari AI. Set up a language model and I'll be ready to help.`}
          </p>
          <button
            onClick={handleGoToSettings}
            className={cn([
              "border-primary bg-primary text-primary-foreground inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
              "hover:bg-primary/90 shadow-[0_4px_14px_rgba(87,83,78,0.18)] transition-colors",
            ])}
          >
            <Sparkle size={12} />
            {t`Open AI Settings`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start pb-1">
      <div className="flex w-full flex-col">
        {hasContext && (
          <div className="flex flex-col gap-0.5">
            {isPatientContext && (
              <div className="flex justify-end pb-0.5">
                <button
                  type="button"
                  onClick={refreshPatientSuggestions}
                  aria-label={t`Refresh suggestions`}
                  className={cn([
                    "flex size-6 items-center justify-center rounded-full transition-colors",
                    isDarkAppearance
                      ? "text-primary-foreground/55 hover:text-primary-foreground/80"
                      : "text-muted-foreground/75 hover:text-foreground",
                  ])}
                >
                  <ArrowsClockwise size={13} />
                </button>
              </div>
            )}
            {suggestions.map(({ label, icon: Icon, prompt }) => (
              <button
                key={label}
                onClick={() => handleSuggestionClick(prompt)}
                className={cn([
                  "group grid w-full grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-1.5 rounded-lg py-2 pr-3 pl-0 text-left text-sm",
                  isDarkAppearance
                    ? "text-primary-foreground/85 hover:bg-primary-foreground/10"
                    : "text-muted-foreground hover:bg-muted/55",
                  "transition-colors",
                ])}
              >
                <span className="flex size-6 items-center justify-center">
                  <Icon
                    size={16}
                    className={cn([
                      "shrink-0 transition-colors",
                      isDarkAppearance
                        ? "text-primary-foreground/55 group-hover:text-primary-foreground/80"
                        : "text-muted-foreground/75 group-hover:text-foreground",
                    ])}
                  />
                </span>
                <span className="min-w-0 truncate">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BetaChip({ isDarkAppearance }: { isDarkAppearance: boolean }) {
  return (
    <span
      className={cn([
        "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        isDarkAppearance
          ? "border-border bg-accent text-accent-foreground"
          : "border-sky-200 bg-sky-100 text-sky-900",
      ])}
    >
      {t`Beta`}
    </span>
  );
}
