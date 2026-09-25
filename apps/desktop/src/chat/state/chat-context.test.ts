import { beforeEach, describe, expect, test } from "vitest";

import { useChatContext } from "./chat-context";

describe("chat context", () => {
  beforeEach(() => {
    useChatContext.setState({
      chatByScope: {
        general: { groupId: undefined, sessionId: "general-initial" },
        automations: {
          groupId: undefined,
          sessionId: "automations-initial",
        },
      },
    });
  });

  test("startNewChat resets the group and rotates the session id", () => {
    useChatContext.setState({
      chatByScope: {
        ...useChatContext.getState().chatByScope,
        general: { groupId: "group-1", sessionId: "session-1" },
      },
    });

    useChatContext.getState().startNewChat("general");

    const selection = useChatContext.getState().chatByScope.general;
    expect(selection.groupId).toBeUndefined();
    expect(selection.sessionId).not.toBe("session-1");
  });

  test("selectChat syncs the selected group and session id", () => {
    useChatContext.getState().selectChat("general", "group-2");

    const selection = useChatContext.getState().chatByScope.general;
    expect(selection.groupId).toBe("group-2");
    expect(selection.sessionId).toBe("group-2");
  });

  test("keeps general and automation conversations separate", () => {
    useChatContext.getState().selectChat("general", "general-group");
    useChatContext.getState().selectChat("automations", "automation-group");

    const state = useChatContext.getState();
    expect(state.chatByScope.general).toEqual({
      groupId: "general-group",
      sessionId: "general-group",
    });
    expect(state.chatByScope.automations).toEqual({
      groupId: "automation-group",
      sessionId: "automation-group",
    });
  });

  test("switchNote keeps a chat thread per note across note switches", () => {
    useChatContext.getState().selectChat("general", "note-a-group");

    useChatContext.getState().switchNote("note-a", "note-b");
    expect(
      useChatContext.getState().chatByScope.general.groupId,
    ).toBeUndefined();

    useChatContext.getState().selectChat("general", "note-b-group");

    useChatContext.getState().switchNote("note-b", "note-a");
    expect(useChatContext.getState().chatByScope.general).toEqual({
      groupId: "note-a-group",
      sessionId: "note-a-group",
    });

    useChatContext.getState().switchNote("note-a", "note-b");
    expect(useChatContext.getState().chatByScope.general).toEqual({
      groupId: "note-b-group",
      sessionId: "note-b-group",
    });
  });

  test("switchNote gives a note never chatted with a fresh thread", () => {
    useChatContext.getState().selectChat("general", "note-a-group");

    useChatContext.getState().switchNote("note-a", "note-never-seen");

    const selection = useChatContext.getState().chatByScope.general;
    expect(selection.groupId).toBeUndefined();
    expect(selection.sessionId).not.toBe("note-a-group");
  });

  test("switchNote is a no-op when the note doesn't change", () => {
    useChatContext.getState().selectChat("general", "note-a-group");

    useChatContext.getState().switchNote("note-a", "note-a");

    expect(useChatContext.getState().chatByScope.general).toEqual({
      groupId: "note-a-group",
      sessionId: "note-a-group",
    });
  });

  test("switchNote never touches the automations thread", () => {
    useChatContext.getState().selectChat("automations", "automation-group");

    useChatContext.getState().switchNote("note-a", "note-b");

    expect(useChatContext.getState().chatByScope.automations).toEqual({
      groupId: "automation-group",
      sessionId: "automation-group",
    });
  });
});
