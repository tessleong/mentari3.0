import chroma from "chroma-js";
import { describe, expect, it } from "vitest";

import {
  getSpeakerColorForIndex,
  getSpeakerColorForLabel,
} from "./speaker-colors";

describe("speaker colors", () => {
  it("gives the self speaker a raspberry-pink accent", () => {
    const [, , hue] = chroma(getSpeakerColorForIndex(0)).oklch();
    expect(hue).toBeCloseTo(350, 0);
  });

  it("is deterministic for the same speaker index", () => {
    expect(getSpeakerColorForIndex(2)).toBe(getSpeakerColorForIndex(2));
  });

  it("differs across speaker indices within the palette", () => {
    const colors = new Set(
      Array.from({ length: 8 }, (_, index) => getSpeakerColorForIndex(index)),
    );
    expect(colors.size).toBe(8);
  });

  it("wraps around once the index exceeds the palette length", () => {
    expect(getSpeakerColorForIndex(0)).toBe(getSpeakerColorForIndex(8));
  });

  it("uses a brighter color in dark mode", () => {
    expect(
      chroma(getSpeakerColorForIndex(1, "dark")).luminance(),
    ).toBeGreaterThan(chroma(getSpeakerColorForIndex(1, "light")).luminance());
  });

  it("always gives the self speaker the same raspberry color regardless of label", () => {
    expect(getSpeakerColorForLabel("You", true)).toBe(
      getSpeakerColorForIndex(0),
    );
    expect(getSpeakerColorForLabel("Anything", true)).toBe(
      getSpeakerColorForIndex(0),
    );
  });

  it("is deterministic for the same non-self label", () => {
    expect(getSpeakerColorForLabel("Speaker 2", false)).toBe(
      getSpeakerColorForLabel("Speaker 2", false),
    );
  });

  it("never assigns a non-self speaker the raspberry self color", () => {
    const labels = ["Speaker 1", "Speaker 2", "Speaker 3", "Artem", "Jordan"];
    const selfColor = getSpeakerColorForIndex(0);

    for (const label of labels) {
      expect(getSpeakerColorForLabel(label, false)).not.toBe(selfColor);
    }
  });
});
