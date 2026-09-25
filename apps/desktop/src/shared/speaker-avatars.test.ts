import { describe, expect, it } from "vitest";

import {
  getSpeakerAvatarKey,
  parseSpeakerAvatarSeeds,
  resolveSpeakerAvatarSeed,
  withSpeakerAvatarSeed,
} from "./speaker-avatars";

describe("speaker avatars", () => {
  it("keys the self speaker distinctly from remote speaker indices", () => {
    expect(
      getSpeakerAvatarKey({
        channel: "DirectMic",
        speaker_index: null,
        speaker_human_id: null,
      }),
    ).toBe("self");
    expect(
      getSpeakerAvatarKey({
        channel: "RemoteParty",
        speaker_index: 2,
        speaker_human_id: null,
      }),
    ).toBe("speaker:2");
  });

  it("parses stored seeds and ignores malformed or non-string entries", () => {
    expect(parseSpeakerAvatarSeeds(null)).toEqual({});
    expect(parseSpeakerAvatarSeeds("not json")).toEqual({});
    expect(parseSpeakerAvatarSeeds("[1,2]")).toEqual({});
    expect(
      parseSpeakerAvatarSeeds(
        JSON.stringify({ self: "mentari-agent-21", bad: 5 }),
      ),
    ).toEqual({ self: "mentari-agent-21" });
  });

  it("sets and clears a speaker's stored seed", () => {
    const withSeed = withSpeakerAvatarSeed("{}", "self", "mentari-agent-2");
    expect(JSON.parse(withSeed)).toEqual({ self: "mentari-agent-2" });

    const cleared = withSpeakerAvatarSeed(withSeed, "self", null);
    expect(JSON.parse(cleared)).toEqual({});
  });

  it("falls back to the provided seed when there is no override", () => {
    expect(resolveSpeakerAvatarSeed({}, "self", "Ada")).toBe("Ada");
    expect(
      resolveSpeakerAvatarSeed({ self: "mentari-agent-9" }, "self", "Ada"),
    ).toBe("mentari-agent-9");
  });
});
