import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

import { Button } from "@anlg/ui/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";

import { SpeakerCountPicker } from "./outer-header/metadata/speaker-count";

import { useSession, useUpdateSession } from "~/session/queries";
import {
  GlassDialogCancelButton,
  GlassDialogContent,
} from "~/shared/ui/glass-dialog";
import { useSessionParticipantHumanIds } from "~/stt/queries";

/**
 * Shown every time the user presses Start, so diarization always gets a
 * confirmed speaker count instead of silently guessing from whatever
 * participants happen to be attached (or not).
 */
export function StartRecordingDialog({
  sessionId,
  open,
  onOpenChange,
  onConfirm,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useLingui();
  const expectedSpeakerCount =
    useSession(sessionId)?.expected_speaker_count ?? null;
  const updateSession = useUpdateSession(sessionId);
  const participantCount = useSessionParticipantHumanIds(sessionId).length;

  // Pre-fill a sensible default the moment the dialog opens, but only when
  // nothing has been chosen for this session yet — attached participants
  // beat guessing "Auto" blind, and never overwrite a value the user
  // already set (including one they just picked in a previous open).
  useEffect(() => {
    if (open && expectedSpeakerCount == null && participantCount > 0) {
      void updateSession({ expected_speaker_count: participantCount });
    }
    // Deliberately excludes expectedSpeakerCount/participantCount/updateSession
    // — this should only run once per open, not re-run as those values
    // change from the very update it triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleStart = () => {
    onOpenChange(false);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent>
        <DialogHeader className="gap-2">
          <DialogTitle className="text-foreground text-[13px] leading-5 font-semibold tracking-normal">
            {t`How many speakers?`}
          </DialogTitle>
          <DialogDescription className="text-foreground text-[13px] leading-[1.36]">
            {t`Confirming this up front helps separate speakers correctly in the transcript.`}
          </DialogDescription>
        </DialogHeader>
        <SpeakerCountPicker
          value={expectedSpeakerCount}
          onChange={(count) =>
            void updateSession({ expected_speaker_count: count })
          }
        />
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:justify-normal">
          <GlassDialogCancelButton onClick={() => onOpenChange(false)}>
            <Trans>Cancel</Trans>
          </GlassDialogCancelButton>
          <Button
            className="h-8 rounded-full px-4 text-xs font-medium shadow-sm"
            onClick={handleStart}
          >
            <Trans>Start Recording</Trans>
          </Button>
        </DialogFooter>
      </GlassDialogContent>
    </Dialog>
  );
}
