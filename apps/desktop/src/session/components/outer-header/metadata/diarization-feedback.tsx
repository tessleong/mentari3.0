import { useLingui } from "@lingui/react/macro";
import { ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { useState } from "react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@anlg/ui/components/ui/popover";
import { cn } from "@anlg/utils";

import {
  DIARIZATION_FEEDBACK_REASONS,
  recordDiarizationFeedback,
  useSession,
  type DiarizationFeedbackReason,
} from "~/session/queries";
import { useConfigValue } from "~/shared/config";

function speakerModeForSession(
  expectedSpeakerCount: number | null | undefined,
): string {
  return expectedSpeakerCount ? `exact_${expectedSpeakerCount}` : "auto";
}

export function DiarizationFeedback({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const [submitted, setSubmitted] = useState<"positive" | "negative" | null>(
    null,
  );
  const [reasonOpen, setReasonOpen] = useState(false);
  const provider = useConfigValue("current_stt_provider");
  const expectedSpeakerCount = useSession(sessionId)?.expected_speaker_count;

  const reasonLabels: Record<DiarizationFeedbackReason, string> = {
    wrong_speaker: t`Wrong speaker`,
    missed_speaker: t`Missed a speaker`,
    transcript_words: t`Transcript words`,
    speaker_boundary: t`Speaker changed too early/late`,
    overlapping_speech: t`Overlapping speech`,
    doctor_patient_label: t`Doctor/Patient label`,
    other: t`Other`,
  };

  const submit = (
    rating: "positive" | "negative",
    reason?: DiarizationFeedbackReason,
  ) => {
    void recordDiarizationFeedback({
      sessionId,
      rating,
      reason,
      provider: provider || undefined,
      speakerMode: speakerModeForSession(expectedSpeakerCount),
    });
    setSubmitted(rating);
    setReasonOpen(false);
  };

  if (submitted) {
    return (
      <div className="flex flex-col gap-2">
        <div className="bg-accent h-px" />
        <p className="text-muted-foreground text-xs">
          {t`Thanks for the feedback.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-accent h-px" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          {t`How did we do?`}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t`Good transcription`}
            onClick={() => submit("positive")}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-full"
          >
            <ThumbsUp size={14} weight="bold" />
          </button>
          <Popover open={reasonOpen} onOpenChange={setReasonOpen}>
            <PopoverAnchor asChild>
              <button
                type="button"
                aria-label={t`Something was wrong`}
                onClick={() => setReasonOpen(true)}
                className={cn([
                  "flex size-7 items-center justify-center rounded-full",
                  reasonOpen
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                ])}
              >
                <ThumbsDown size={14} weight="bold" />
              </button>
            </PopoverAnchor>
            <PopoverContent
              variant="app"
              align="end"
              className="w-auto p-2"
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground px-1 pb-1 text-[11px] font-medium tracking-[0.08em] uppercase">
                  {t`What was wrong?`}
                </p>
                {DIARIZATION_FEEDBACK_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => submit("negative", reason)}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground rounded px-2 py-1 text-left text-xs"
                  >
                    {reasonLabels[reason]}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
