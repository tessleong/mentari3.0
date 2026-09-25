import chroma from "chroma-js";

// Raspberry pink leads the palette and is reserved for the self speaker
// (the mic channel), so "you" is always the same accent color across the
// live transcript and the floating meeting bar. The remaining hues rotate
// through other speakers in a fixed, playful order.
const SPEAKER_HUES = [350, 40, 185, 280, 15, 210, 130, 320];

const SPEAKER_LIGHTNESS: Record<"light" | "dark", number> = {
  light: 0.55,
  dark: 0.72,
};

const SPEAKER_CHROMA = 0.15;

export function getSpeakerColorForIndex(
  index: number,
  mode: "light" | "dark" = "light",
): string {
  const hueIndex =
    ((index % SPEAKER_HUES.length) + SPEAKER_HUES.length) % SPEAKER_HUES.length;
  const hue = SPEAKER_HUES[hueIndex]!;
  return chroma.oklch(SPEAKER_LIGHTNESS[mode], SPEAKER_CHROMA, hue).hex();
}

export function getSpeakerColorForLabel(
  label: string,
  isSelf: boolean,
  mode: "light" | "dark" = "light",
): string {
  if (isSelf) {
    return getSpeakerColorForIndex(0, mode);
  }
  const index = 1 + (hashSpeakerLabel(label) % (SPEAKER_HUES.length - 1));
  return getSpeakerColorForIndex(index, mode);
}

function hashSpeakerLabel(value: string): number {
  let hash = 2_166_136_261;
  for (let charIndex = 0; charIndex < value.length; charIndex += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(charIndex), 16_777_619);
  }
  return hash >>> 0;
}
