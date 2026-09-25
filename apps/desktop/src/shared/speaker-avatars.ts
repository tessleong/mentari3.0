import { createAvatarGradient } from "@anlg/ui/lib/avatar";

import type { SegmentKey } from "~/stt/live-segment";

export function getSpeakerAvatarKey(key: SegmentKey): string {
  return key.channel === "DirectMic"
    ? "self"
    : `speaker:${key.speaker_index ?? 0}`;
}

export function parseSpeakerAvatarSeeds(
  json: string | null | undefined,
): Record<string, string> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function withSpeakerAvatarSeed(
  json: string | null | undefined,
  speakerKey: string,
  seed: string | null,
): string {
  const seeds = parseSpeakerAvatarSeeds(json);
  if (seed) {
    seeds[speakerKey] = seed;
  } else {
    delete seeds[speakerKey];
  }
  return JSON.stringify(seeds);
}

export function resolveSpeakerAvatarSeed(
  seeds: Record<string, string>,
  speakerKey: string,
  fallbackSeed: string,
): string {
  return seeds[speakerKey] ?? fallbackSeed;
}

// A single solid color representing the seed's gradient, so speaker text
// always reads in the same color family as its avatar bubble.
export function getSpeakerAvatarTextColor(seed: string): string {
  const { colors } = createAvatarGradient(seed);
  const [r, g, b] = colors.reduce(
    ([sr, sg, sb], [cr, cg, cb]) => [sr + cr, sg + cg, sb + cb],
    [0, 0, 0],
  );
  const count = colors.length;
  return `rgb(${Math.round(r / count)} ${Math.round(g / count)} ${Math.round(b / count)})`;
}
