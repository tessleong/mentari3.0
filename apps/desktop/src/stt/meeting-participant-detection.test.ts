import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { startMeetingParticipantDetection } from "./meeting-participant-detection";

const {
  inspectMeetingAccessibilityMock,
  listMicUsingApplicationsMock,
  createHumanMock,
  searchContactsMock,
  addSessionParticipantMock,
  liveQueryExecuteMock,
} = vi.hoisted(() => ({
  inspectMeetingAccessibilityMock: vi.fn(),
  listMicUsingApplicationsMock: vi.fn(),
  createHumanMock: vi.fn(),
  searchContactsMock: vi.fn(),
  addSessionParticipantMock: vi.fn(),
  liveQueryExecuteMock: vi.fn(),
}));

vi.mock("@anlg/plugin-detect", () => ({
  commands: {
    inspectMeetingAccessibility: inspectMeetingAccessibilityMock,
    listMicUsingApplications: listMicUsingApplicationsMock,
  },
}));

vi.mock("~/contacts/queries", () => ({
  createHuman: createHumanMock,
  searchContacts: searchContactsMock,
}));

vi.mock("~/session/queries/participants", () => ({
  addSessionParticipant: addSessionParticipantMock,
}));

vi.mock("~/db", () => ({
  liveQueryClient: { execute: liveQueryExecuteMock },
}));

function zoomInspection(
  names: Array<string | null>,
  overrides: { accessibilityTrusted?: boolean; appId?: string } = {},
) {
  return {
    app: { id: overrides.appId ?? "us.zoom.xos", name: "Zoom" },
    pid: 1,
    platform: "zoom" as const,
    surface: "native" as const,
    accessibilityTrusted: overrides.accessibilityTrusted ?? true,
    windowTitle: null,
    participantStreams: names.map((name, index) => ({
      id: `stream-${index}`,
      platform: "zoom" as const,
      surface: "native" as const,
      participantName: name,
      label: null,
      bounds: null,
      confidence: 1,
      isActiveSpeaker: false,
      signals: [],
    })),
    activeSpeakers: [],
    warnings: [],
  };
}

describe("startMeetingParticipantDetection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    listMicUsingApplicationsMock.mockResolvedValue({
      status: "ok",
      data: [{ id: "us.zoom.xos", name: "Zoom" }],
    });
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [],
    });
    liveQueryExecuteMock.mockResolvedValue([]);
    searchContactsMock.mockResolvedValue([]);
    createHumanMock.mockResolvedValue("human-new");
    addSessionParticipantMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("adds a newly detected Zoom participant as an auto-sourced participant", async () => {
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [zoomInspection(["James"])],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(createHumanMock).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      name: "James",
      entryPoint: "session_participants",
    });
    expect(addSessionParticipantMock).toHaveBeenCalledWith(
      "session-1",
      "human-new",
      "auto",
    );

    await stop();
  });

  test("reuses an existing contact with the same name instead of creating a duplicate", async () => {
    searchContactsMock.mockResolvedValue([
      { id: "human-existing", name: "James" },
    ]);
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [zoomInspection(["James"])],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(createHumanMock).not.toHaveBeenCalled();
    expect(addSessionParticipantMock).toHaveBeenCalledWith(
      "session-1",
      "human-existing",
      "auto",
    );

    await stop();
  });

  test("does not re-add a participant already attached to the session", async () => {
    liveQueryExecuteMock.mockResolvedValue([{ name: "James" }]);
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [zoomInspection(["James"])],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(createHumanMock).not.toHaveBeenCalled();
    expect(addSessionParticipantMock).not.toHaveBeenCalled();

    await stop();
  });

  test("does nothing when Zoom is running without a trusted accessibility permission", async () => {
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [zoomInspection(["James"], { accessibilityTrusted: false })],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(addSessionParticipantMock).not.toHaveBeenCalled();

    await stop();
  });

  test("ignores an inspection for a meeting app that isn't the current mic-active app", async () => {
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [zoomInspection(["James"], { appId: "some.other.zoom.window" })],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(addSessionParticipantMock).not.toHaveBeenCalled();

    await stop();
  });

  test("does nothing when no mic-using application is detected", async () => {
    listMicUsingApplicationsMock.mockResolvedValue({ status: "ok", data: [] });
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [zoomInspection(["James"])],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(inspectMeetingAccessibilityMock).not.toHaveBeenCalled();
    expect(addSessionParticipantMock).not.toHaveBeenCalled();

    await stop();
  });

  test("does not detect on a non-Zoom platform", async () => {
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [
        {
          ...zoomInspection(["Bob"]),
          platform: "microsoftTeams" as const,
        },
      ],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(addSessionParticipantMock).not.toHaveBeenCalled();

    await stop();
  });

  test("does not re-detect the same name on a later poll", async () => {
    inspectMeetingAccessibilityMock.mockResolvedValue({
      status: "ok",
      data: [zoomInspection(["James"])],
    });

    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(addSessionParticipantMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(addSessionParticipantMock).toHaveBeenCalledTimes(1);

    await stop();
  });

  test("stops polling once stopped", async () => {
    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
    });
    await vi.advanceTimersByTimeAsync(0);
    await stop();

    listMicUsingApplicationsMock.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(listMicUsingApplicationsMock).not.toHaveBeenCalled();
  });

  test("does nothing while disabled", async () => {
    const stop = startMeetingParticipantDetection({
      sessionId: "session-1",
      ownerUserId: "user-1",
      isEnabled: () => false,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(listMicUsingApplicationsMock).not.toHaveBeenCalled();

    await stop();
  });
});
