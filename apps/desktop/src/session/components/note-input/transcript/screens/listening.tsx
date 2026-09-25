import { Spinner } from "@anlg/ui/components/ui/spinner";

import { getSpeakerColorForIndex } from "~/shared/speaker-colors";
import { useListener } from "~/stt/contexts";

const RASPBERRY = getSpeakerColorForIndex(0);

export function TranscriptListeningState({
  status,
}: {
  status: "listening" | "finalizing";
}) {
  const isFinalizing = status === "finalizing";
  const amplitude = useListener((state) =>
    Math.min(
      1,
      Math.hypot(state.live.amplitude.mic, state.live.amplitude.speaker),
    ),
  );

  return (
    <div
      role="status"
      className="flex h-full min-h-[400px] flex-col items-center justify-center px-6 text-center"
    >
      {isFinalizing ? (
        <div className="text-muted-foreground mb-5">
          <Spinner size={36} />
        </div>
      ) : (
        <div className="mb-5">
          <LiveAmplitudeBars amplitude={amplitude} />
        </div>
      )}
      <div className="flex max-w-md flex-col gap-2">
        <p className="text-base font-medium">
          {isFinalizing ? "Finalizing transcript..." : "Listening..."}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {isFinalizing
            ? "Transcript is still being written."
            : amplitude > 0.03
              ? "Picking up audio — transcript will appear here shortly."
              : "Transcript will appear here when the first segment arrives."}
        </p>
      </div>
    </div>
  );
}

const BAR_COUNT = 12;
const BAR_HEIGHT = 40;

function LiveAmplitudeBars({ amplitude }: { amplitude: number }) {
  return (
    <div
      role="img"
      aria-label={
        amplitude > 0.03 ? "Audio is being detected" : "No audio detected yet"
      }
      className="flex items-center justify-center gap-[3px]"
      style={{ height: BAR_HEIGHT }}
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <AmplitudeBar key={index} index={index} amplitude={amplitude} />
      ))}
    </div>
  );
}

function AmplitudeBar({
  index,
  amplitude,
}: {
  index: number;
  amplitude: number;
}) {
  // Bars closer to the center rise higher, so the resting state (near-zero
  // amplitude) still reads as a deliberate waveform shape, not a flat line.
  const mid = (BAR_COUNT - 1) / 2;
  const distanceFromCenter = Math.abs(index - mid) / mid;
  const centerBoost = 1 - distanceFromCenter * 0.6;
  const scale = Math.max(0.12, Math.min(1, amplitude * centerBoost * 1.6));

  return (
    <div
      className="w-1 rounded-full transition-[height] duration-100 ease-out"
      style={{
        height: Math.max(3, BAR_HEIGHT * scale),
        backgroundColor: RASPBERRY,
      }}
    />
  );
}
