import {
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  GearSix,
  Microphone,
  NotePencil,
  Notebook,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { AgentCompanions } from "~/agents/companions";
import { PersonalityAvatar } from "~/agents/personality";
import { useIgnoredEvents } from "~/calendar/ignored-events";
import {
  useEnabledCalendarRows,
  useTimelineEventsTable,
} from "~/calendar/queries";
import { TemplateEmptyState } from "~/session/components/note-input/raw";
import {
  createSession,
  getOrCreateSessionForEventId,
  updateSession,
} from "~/session/queries";
import { useConfigValue } from "~/shared/config";
import { useOpenNoteDialog } from "~/shared/open-note-dialog";
import { useNewNoteAndListen } from "~/shared/useNewNote";
import { useTabs } from "~/store/zustand/tabs";
import type { UserTemplate } from "~/templates";

export function WelcomeDashboard() {
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState(0);
  const reduced = useReducedMotion();
  const timezone = useConfigValue("timezone") || undefined;
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(now),
  );
  const greeting =
    hour < 12
      ? "Good morning."
      : hour < 17
        ? "Good afternoon."
        : "Good evening.";
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setTyped(0);
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setTyped(count);
      if (count >= greeting.length) clearInterval(timer);
    }, 85);
    return () => clearInterval(timer);
  }, [greeting]);
  const events = useTimelineEventsTable();
  const calendars = useEnabledCalendarRows();
  const { isIgnored } = useIgnoredEvents();
  const enabled = new Set(calendars.map((calendar) => calendar.id));
  const upcoming = Object.entries(events ?? {})
    .filter(
      ([, event]) =>
        enabled.has(event.calendar_id ?? "") &&
        !isIgnored(event.tracking_id_event, event.recurrence_series_id) &&
        new Date(event.ended_at || event.started_at || "").getTime() >=
          now.getTime(),
    )
    .sort(
      (a, b) =>
        new Date(a[1].started_at || "").getTime() -
        new Date(b[1].started_at || "").getTime(),
    );
  const maxPage = Math.max(0, Math.ceil(upcoming.length / 3) - 1);
  const currentPage = Math.min(page, maxPage);
  const openCurrent = useTabs((state) => state.openCurrent);
  const openNotes = useOpenNoteDialog();
  const record = useNewNoteAndListen({ behavior: "current" });
  const create = useMutation({
    mutationFn: async ({
      template,
      eventId,
    }: {
      template?: UserTemplate;
      eventId?: string;
    }) => {
      const raw = template
        ? JSON.stringify({
            type: "doc",
            content: template.sections
              .filter((section) => section.title.trim())
              .flatMap((section) => [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: section.title }],
                },
                { type: "paragraph" },
              ]),
          })
        : "";
      const sessionId = eventId
        ? await getOrCreateSessionForEventId(eventId)
        : await createSession("", undefined, { raw_md: raw });
      if (template)
        await updateSession(sessionId, { raw_template_id: template.id });
      openCurrent({ type: "sessions", id: sessionId });
    },
  });
  const date = (value: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timezone,
    }).format(value);
  return (
    <div
      className="bg-background text-foreground h-full min-h-0 min-w-0 flex-1 overflow-y-auto"
      data-testid="welcome-dashboard"
    >
      <header
        className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-8 pt-5 pl-24"
        data-tauri-drag-region
      >
        <span className="font-serif text-xl">Mentari</span>
        <nav className="flex items-center gap-2">
          <button
            title="Open notes"
            className="hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2 text-sm"
            onClick={() => openNotes.open()}
          >
            <Notebook size={17} />
            Your notes
          </button>
          <button
            title="Appearance and settings"
            aria-label="Appearance and settings"
            className="hover:bg-accent rounded-md p-2"
            onClick={() => openCurrent({ type: "settings" })}
          >
            <GearSix size={19} />
          </button>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-8 pb-12">
        <PersonalityAvatar role="explainer" size={94} />
        <h1
          aria-label={greeting}
          className="mt-4 min-h-14 text-center font-serif text-4xl leading-tight"
        >
          <span aria-hidden>
            {reduced ? greeting : greeting.slice(0, typed)}
          </span>
          <span aria-hidden className="text-emerald-600">
            {!reduced && typed < greeting.length ? "|" : ""}
          </span>
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {date(now, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <section className="mt-10 w-full" aria-label="Coming up">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-2xl">Coming up</h2>
            <div className="flex items-center gap-2">
              <button
                title="Calendar"
                aria-label="Open calendar"
                className="hover:bg-accent rounded-md p-2"
                onClick={() => openCurrent({ type: "calendar" })}
              >
                <CalendarBlank size={18} />
              </button>
              <button
                title="Previous events"
                aria-label="Previous events"
                className="hover:bg-accent rounded-md p-2 disabled:opacity-30"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <CaretLeft size={18} />
              </button>
              <button
                title="Next events"
                aria-label="Next events"
                className="hover:bg-accent rounded-md p-2 disabled:opacity-30"
                disabled={currentPage >= maxPage}
                onClick={() => setPage(currentPage + 1)}
              >
                <CaretRight size={18} />
              </button>
            </div>
          </div>
          <div className="border-border divide-border divide-y border-y">
            {upcoming.length === 0 ? (
              <div className="flex items-center gap-6 py-6">
                <span className="font-serif text-4xl">
                  {date(now, { day: "numeric" })}
                </span>
                <div>
                  <p>
                    {calendars.length
                      ? "No upcoming events"
                      : "No calendars connected"}
                  </p>
                  <button
                    className="text-muted-foreground mt-1 text-sm underline underline-offset-4"
                    onClick={() => openCurrent({ type: "calendar" })}
                  >
                    {calendars.length ? "View calendar" : "Connect a calendar"}
                  </button>
                </div>
              </div>
            ) : (
              upcoming
                .slice(currentPage * 3, currentPage * 3 + 3)
                .map(([id, event]) => (
                  <button
                    key={id}
                    disabled={create.isPending}
                    onClick={() => create.mutate({ eventId: id })}
                    className="hover:bg-accent flex w-full items-center gap-5 py-5 text-left"
                  >
                    <div className="w-12 shrink-0 text-center">
                      <div className="font-serif text-3xl">
                        {date(new Date(event.started_at!), { day: "numeric" })}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {date(new Date(event.started_at!), { month: "short" })}
                      </div>
                    </div>
                    <div
                      className="h-10 w-1 shrink-0 rounded-full"
                      style={{
                        backgroundColor: event.calendar_color || "#70a99b",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base">
                        {event.title || "Untitled event"}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {date(new Date(event.started_at!), {
                          weekday: "short",
                        })}{" "}
                        ·{" "}
                        {event.is_all_day
                          ? "All day"
                          : date(new Date(event.started_at!), {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                      </p>
                    </div>
                    <ArrowRight size={18} className="mr-2 shrink-0" />
                  </button>
                ))
            )}
          </div>
        </section>
        <div
          inert={create.isPending}
          className="mt-8 flex w-full max-w-xs flex-col items-start gap-1 font-serif [&>button]:h-10 [&>button_span]:text-base [&>p]:mt-2"
        >
          <TemplateEmptyState
            sessionId=""
            onApply={(template) => create.mutate({ template })}
          />
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button
            disabled={create.isPending}
            onClick={() => create.mutate({})}
            className="bg-foreground text-background flex items-center gap-2 rounded-md px-4 py-2.5 text-sm"
          >
            <NotePencil size={17} />
            {create.isPending ? "Opening..." : "Blank note"}
          </button>
          <button
            onClick={record}
            className="hover:bg-accent border-border flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm"
          >
            <Microphone size={17} />
            Start recording
          </button>
        </div>
        {create.isError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Could not open the note. Please try again.
          </p>
        )}
        <div className="border-border mt-10 border-t pt-6">
          <AgentCompanions />
        </div>
      </main>
    </div>
  );
}
