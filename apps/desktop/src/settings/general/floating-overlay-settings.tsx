import { Trans } from "@lingui/react/macro";

import {
  FLOATING_BAR_MAX_OPACITY,
  FLOATING_BAR_MIN_OPACITY,
  LIVE_CAPTION_MAX_OPACITY,
  LIVE_CAPTION_MIN_OPACITY,
} from "~/meeting-float/settings";
import { useSetSettingValue } from "~/settings/queries";
import { SettingRow } from "~/settings/setting-row";
import { useConfigValue } from "~/shared/config";

function OpacitySliderRow({
  title,
  description,
  value,
  min,
  max,
  onChange,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow title={title} description={description} controlWidth="fixed">
      {(labelProps) => (
        <div className="flex w-full items-center gap-2">
          <input
            {...labelProps}
            type="range"
            min={min}
            max={max}
            step={0.01}
            value={value}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            className="accent-primary h-1.5 w-full cursor-pointer"
          />
          <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
            {Math.round(value * 100)}%
          </span>
        </div>
      )}
    </SettingRow>
  );
}

export function FloatingOverlaySettingsView() {
  const floatingBarOpacity = useConfigValue("floating_bar_opacity");
  const liveCaptionOpacity = useConfigValue("live_caption_opacity");
  const setFloatingBarOpacity = useSetSettingValue("floating_bar_opacity");
  const setLiveCaptionOpacity = useSetSettingValue("live_caption_opacity");

  return (
    <>
      <OpacitySliderRow
        title={<Trans>Floating bar opacity</Trans>}
        description={
          <Trans>How see-through the floating bar is while listening.</Trans>
        }
        value={floatingBarOpacity}
        min={FLOATING_BAR_MIN_OPACITY}
        max={FLOATING_BAR_MAX_OPACITY}
        onChange={setFloatingBarOpacity}
      />
      <OpacitySliderRow
        title={<Trans>Live transcript opacity</Trans>}
        description={
          <Trans>
            How see-through the live transcript overlay is while expanded.
          </Trans>
        }
        value={liveCaptionOpacity}
        min={LIVE_CAPTION_MIN_OPACITY}
        max={LIVE_CAPTION_MAX_OPACITY}
        onChange={setLiveCaptionOpacity}
      />
    </>
  );
}
