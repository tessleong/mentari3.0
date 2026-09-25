import { describe, expect, it } from "vitest";

import { getMentariReadyNotificationIcon } from "./meeting-apps";

describe("getMentariReadyNotificationIcon", () => {
  it("shows Mentari as ready with the detected meeting app as a badge", () => {
    expect(
      getMentariReadyNotificationIcon({
        type: "bundle_id",
        bundle_id: "us.zoom.xos",
      }),
    ).toEqual({
      type: "overlay",
      base: { type: "app_icon" },
      badge: { type: "bundle_id", bundle_id: "us.zoom.xos" },
    });
  });

  it("keeps the Mentari mark visible when the meeting app has no icon", () => {
    expect(getMentariReadyNotificationIcon(null)).toEqual({
      type: "overlay",
      base: { type: "app_icon" },
      badge: { type: "system_symbol", name: "waveform" },
    });
  });
});
