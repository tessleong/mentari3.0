import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openCurrent: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  eventSession: vi.fn(),
  events: {} as Record<string, unknown>,
  calendars: [{ id: "connected" }],
}));
vi.mock("~/calendar/queries", () => ({
  useTimelineEventsTable: () => mocks.events,
  useEnabledCalendarRows: () => mocks.calendars,
}));
vi.mock("~/calendar/ignored-events", () => ({
  useIgnoredEvents: () => ({ isIgnored: (id: string) => id === "ignored" }),
}));
vi.mock("~/session/queries", () => ({
  createSession: mocks.createSession,
  updateSession: mocks.updateSession,
  getOrCreateSessionForEventId: mocks.eventSession,
}));
vi.mock("~/shared/config", () => ({
  useConfigValue: () => "America/Los_Angeles",
}));
vi.mock("~/shared/open-note-dialog", () => ({
  useOpenNoteDialog: () => ({ open: vi.fn() }),
}));
vi.mock("~/shared/useNewNote", () => ({ useNewNoteAndListen: () => vi.fn() }));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (value: unknown) => unknown) =>
    selector({ openCurrent: mocks.openCurrent }),
}));
vi.mock("~/agents/companions", () => ({ AgentCompanions: () => null }));
vi.mock("~/session/components/note-input/raw", () => ({
  TemplateEmptyState: ({
    onApply,
  }: {
    onApply: (template: unknown) => void;
  }) => (
    <>
      <p>Start with a favorite template</p>
      <button
        onClick={() =>
          onApply({ id: "doctors-visit", sections: [{ title: "Visit notes" }] })
        }
      >
        Doctor's Visit
      </button>
      <p>Suggested templates</p>
      <button>Project Kickoff</button>
      <button>Daily Standup</button>
      <button>1:1 Meeting</button>
      <button>New template</button>
    </>
  ),
}));

import { WelcomeDashboard } from "./welcome";

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <WelcomeDashboard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events = {};
  mocks.calendars = [{ id: "connected" }];
  mocks.createSession.mockResolvedValue("new-note");
  mocks.updateSession.mockResolvedValue(undefined);
  mocks.eventSession.mockResolvedValue("event-note");
});
afterEach(cleanup);

it("waits for an explicit note choice and creates a note with the selected template", async () => {
  mount();
  expect(mocks.createSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Doctor's Visit"));
  await waitFor(() =>
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "sessions",
      id: "new-note",
    }),
  );
  expect(
    JSON.parse(mocks.createSession.mock.calls[0][2].raw_md).content[0]
      .content[0].text,
  ).toBe("Visit notes");
  expect(mocks.updateSession).toHaveBeenCalledWith("new-note", {
    raw_template_id: "doctors-visit",
  });
});

it("filters disabled calendars, past events, and ignored meetings", () => {
  const started_at = new Date(Date.now() + 3600_000).toISOString();
  const ended_at = new Date(Date.now() + 7200_000).toISOString();
  mocks.events = {
    visible: {
      calendar_id: "connected",
      title: "Next appointment",
      started_at,
      ended_at,
    },
    disabled: {
      calendar_id: "off",
      title: "Hidden calendar",
      started_at,
      ended_at,
    },
    ignored: {
      calendar_id: "connected",
      tracking_id_event: "ignored",
      title: "Ignored meeting",
      started_at,
      ended_at,
    },
    past: {
      calendar_id: "connected",
      title: "Past meeting",
      started_at: "2020-01-01",
      ended_at: "2020-01-02",
    },
  };
  mount();
  expect(screen.getByText("Next appointment")).toBeTruthy();
  expect(screen.queryByText("Hidden calendar")).toBeNull();
  expect(screen.queryByText("Ignored meeting")).toBeNull();
  expect(screen.queryByText("Past meeting")).toBeNull();
});

it("shows a connection action when no calendars are integrated", () => {
  mocks.calendars = [];
  mount();
  fireEvent.click(screen.getByText("Connect a calendar"));
  expect(mocks.openCurrent).toHaveBeenCalledWith({ type: "calendar" });
});

it("keeps the dashboard available after a failed note creation", async () => {
  mocks.createSession.mockRejectedValue(new Error("Unavailable"));
  mount();
  fireEvent.click(screen.getByText("Blank note"));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(mocks.openCurrent).not.toHaveBeenCalled();
});

it("fills the shell row instead of collapsing to its content width", () => {
  mount();
  // MainShellScaffold renders the dashboard as a direct child of a `flex` row,
  // so the root has to claim the free space itself. Without `flex-1` it falls
  // back to `flex: 0 1 auto` and the whole dashboard renders as a narrow
  // column; `min-w-0` keeps the event rows truncating instead of overflowing.
  const root = screen.getByTestId("welcome-dashboard");
  expect(root.className).toContain("flex-1");
  expect(root.className).toContain("min-w-0");
});
