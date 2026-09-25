import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import { cn } from "@anlg/utils";

import { useSession, useUpdateSession } from "~/session/queries";

const SPEAKER_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

export function SpeakerCountEditor({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const expectedSpeakerCount = useSession(sessionId)?.expected_speaker_count;
  const updateSession = useUpdateSession(sessionId);

  const choose = (count: number | null) => {
    void updateSession({ expected_speaker_count: count });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-accent h-px" />
      <SpeakerCountPicker
        value={expectedSpeakerCount ?? null}
        onChange={choose}
      />
      <p className="text-muted-foreground text-xs">
        {t`How many people will be talking, including you. Helps separate speakers correctly when no participants are attached.`}
      </p>
    </div>
  );
}

/**
 * The picker on its own, decoupled from session-metadata wiring — reused by
 * SpeakerCountEditor (the header popover) and the start-of-recording
 * confirmation dialog.
 */
export function SpeakerCountPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (count: number | null) => void;
}) {
  const { t } = useLingui();
  const isPreset =
    value != null &&
    (SPEAKER_COUNT_OPTIONS as readonly number[]).includes(value);
  const isCustomValue = value != null && !isPreset;
  const [customActive, setCustomActive] = useState(isCustomValue);
  const [customDraft, setCustomDraft] = useState(
    isCustomValue ? String(value) : "",
  );

  // Keep the draft in sync when the underlying value changes from outside
  // this component (e.g. switching sessions, or Auto/a preset being chosen
  // elsewhere) — but never fight the user's own keystrokes while they're
  // actively typing a custom value.
  useEffect(() => {
    if (isCustomValue) {
      setCustomActive(true);
      setCustomDraft(String(value));
    } else {
      setCustomActive(false);
    }
  }, [value, isCustomValue]);

  const handleCustomChange = (raw: string) => {
    setCustomDraft(raw);
    const parsed = Number.parseInt(raw, 10);
    if (
      Number.isInteger(parsed) &&
      parsed >= 1 &&
      String(parsed) === raw.trim()
    ) {
      onChange(parsed);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-sm">
        {t`Expected speakers`}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <div
          role="radiogroup"
          aria-label={t`Expected speakers`}
          className="flex flex-wrap gap-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!value}
            onClick={() => onChange(null)}
            className={cn([
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              !value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            ])}
          >
            {t`Auto`}
          </button>
          {SPEAKER_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={value === count}
              onClick={() => onChange(count)}
              className={cn([
                "size-7 rounded-full text-xs font-medium transition-colors",
                value === count
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              ])}
            >
              {count}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={customActive}
            onClick={() => setCustomActive(true)}
            className={cn([
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              customActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            ])}
          >
            {t`Custom`}
          </button>
        </div>
        {customActive && (
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            aria-label={t`Custom expected speaker count`}
            value={customDraft}
            onChange={(event) => handleCustomChange(event.target.value)}
            placeholder="6+"
            className="border-input bg-background text-foreground h-7 w-14 rounded-md border px-2 text-xs"
          />
        )}
      </div>
    </div>
  );
}
