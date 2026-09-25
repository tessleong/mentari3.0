import { describe, expect, it } from "vitest";

import {
  shouldRefineSpeakerDiarization,
  shouldUseLocalBatchForSpeakerDiarization,
} from "./capture-lifecycle";

describe("shouldUseLocalBatchForSpeakerDiarization", () => {
  it("runs for a realtime local model when local batch diarization is available", () => {
    expect(
      shouldUseLocalBatchForSpeakerDiarization({
        localBatchDiarizationAvailable: true,
        model: "soniqo-parakeet-streaming",
      }),
    ).toBe(true);
  });

  it("does not require any known participants (fixes 1:1 and in-person recordings)", () => {
    // Regression test: a single-mic, in-person 1:1 conversation has no
    // calendar-linked participants at all, yet should still get local
    // diarization refinement instead of collapsing into one speaker.
    expect(
      shouldUseLocalBatchForSpeakerDiarization({
        localBatchDiarizationAvailable: true,
        model: "apple-speech",
      }),
    ).toBe(true);
  });

  it("does not run when local batch diarization is unavailable", () => {
    expect(
      shouldUseLocalBatchForSpeakerDiarization({
        localBatchDiarizationAvailable: false,
        model: "soniqo-parakeet-streaming",
      }),
    ).toBe(false);
  });

  it("does not run for a non-realtime-local model", () => {
    expect(
      shouldUseLocalBatchForSpeakerDiarization({
        localBatchDiarizationAvailable: true,
        model: "cloud",
      }),
    ).toBe(false);
  });
});

describe("shouldRefineSpeakerDiarization", () => {
  it("refines a solo in-person recording via local batch diarization", () => {
    expect(
      shouldRefineSpeakerDiarization({
        hasMultipleRemoteParticipants: false,
        provider: "soniqo",
        model: "soniqo-parakeet-streaming",
        localBatchDiarizationAvailable: true,
      }),
    ).toBe(true);
  });

  it("refines a 1:1 video call the same way, without requiring a second participant", () => {
    expect(
      shouldRefineSpeakerDiarization({
        hasMultipleRemoteParticipants: false,
        provider: "soniqo",
        model: "apple-speech",
        localBatchDiarizationAvailable: true,
      }),
    ).toBe(true);
  });

  it("refines via the cloud path only when multiple remote participants are known", () => {
    expect(
      shouldRefineSpeakerDiarization({
        hasMultipleRemoteParticipants: true,
        provider: "anarlog",
        model: "cloud",
        localBatchDiarizationAvailable: false,
      }),
    ).toBe(true);

    expect(
      shouldRefineSpeakerDiarization({
        hasMultipleRemoteParticipants: false,
        provider: "anarlog",
        model: "cloud",
        localBatchDiarizationAvailable: false,
      }),
    ).toBe(false);
  });

  it("does not refine when neither local batch nor cloud diarization is available", () => {
    expect(
      shouldRefineSpeakerDiarization({
        hasMultipleRemoteParticipants: false,
        provider: "openai",
        model: "whisper-1",
        localBatchDiarizationAvailable: false,
      }),
    ).toBe(false);
  });
});
