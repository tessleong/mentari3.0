import { Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { useState } from "react";

import { DropdownMenuItem } from "@anlg/ui/components/ui/dropdown-menu";

import { StartRecordingDialog } from "~/session/components/start-recording-dialog";
import { useListener } from "~/stt/contexts";
import { useStartListening } from "~/stt/useStartListening";
import {
  isMainWebviewWindow,
  requestMainListenerControl,
} from "~/stt/window-control";

export function Listening({
  sessionId,
  resume,
}: {
  sessionId: string;
  resume: boolean;
}) {
  const { mode, stop } = useListener((state) => ({
    mode: state.getSessionMode(sessionId),
    stop: state.stop,
  }));
  const isListening = mode === "active" || mode === "finalizing";
  const isFinalizing = mode === "finalizing";
  const isBatching = mode === "running_batch";
  const startListening = useStartListening(sessionId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmedStart = () => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("start", sessionId);
      return;
    }

    startListening();
  };

  const handleToggleListening = () => {
    if (isBatching) {
      return;
    }

    if (isListening) {
      if (!isMainWebviewWindow()) {
        void requestMainListenerControl("stop", sessionId);
        return;
      }
      stop();
      return;
    }

    // Deferred to the next frame so the dropdown menu this item lives in
    // finishes closing before another Radix overlay (the dialog) opens —
    // matches the pattern used for ExportModal in the sibling overflow menu.
    requestAnimationFrame(() => setConfirmOpen(true));
  };

  const startLabel = resume ? "Resume listening" : "Start listening";

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={handleToggleListening}
        disabled={isFinalizing || isBatching}
      >
        {isListening ? <MicrophoneSlash /> : <Microphone />}
        <span>
          {isBatching
            ? "Batch processing"
            : isListening
              ? "Stop listening"
              : startLabel}
        </span>
      </DropdownMenuItem>
      <StartRecordingDialog
        sessionId={sessionId}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmedStart}
      />
    </>
  );
}
