import { CircleNotch, Info } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@anlg/ui/components/ui/popover";
import { cn } from "@anlg/utils";

import { explainMedicalTerm } from "~/clinical/patient-explain";
import { SourceBadge } from "~/clinical/source-badge";
import { StudyDesignBadge } from "~/clinical/study-design-badge";

const HOVER_OPEN_DELAY_MS = 350;
const HOVER_CLOSE_DELAY_MS = 150;

/**
 * Wraps a transcript word recognized as a clinical term. On hover, looks up
 * what was actually said about it during this visit plus any locally
 * stored reference material — no query typing, no live network call. The
 * lookup is entirely local; there is nothing to fetch on demand.
 */
export function MedicalTermHoverCard({
  sessionId,
  term,
  children,
}: {
  sessionId: string;
  term: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  const query = useQuery({
    queryKey: ["medical-term-explanation", sessionId, term],
    queryFn: () => explainMedicalTerm(sessionId, term),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          data-medical-term={term}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          className={cn([
            "decoration-primary/50 hover:decoration-primary cursor-help underline decoration-dotted underline-offset-4",
          ])}
        >
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        variant="app"
        align="start"
        className="w-80"
        onMouseEnter={clearTimers}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <MedicalTermHoverContent
          term={term}
          isLoading={query.isLoading}
          data={query.data}
        />
      </PopoverContent>
    </Popover>
  );
}

function MedicalTermHoverContent({
  term,
  isLoading,
  data,
}: {
  term: string;
  isLoading: boolean;
  data: Awaited<ReturnType<typeof explainMedicalTerm>> | undefined;
}) {
  if (isLoading || !data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
        <CircleNotch className="size-4 animate-spin" />
        Looking up {term}…
      </div>
    );
  }

  const hasEncounter = data.encounterSources.length > 0;
  const hasMedical = data.medicalSources.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-foreground text-sm font-medium capitalize">{term}</p>

      <section className="flex flex-col gap-1.5">
        <p className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
          Said during this visit
        </p>
        {hasEncounter ? (
          <ul className="flex flex-col gap-1.5">
            {data.encounterSources.slice(0, 3).map((source) => (
              <li key={source.segmentId} className="text-xs leading-snug">
                <span className="text-muted-foreground">
                  {source.speaker}:{" "}
                </span>
                <span className="text-foreground">"{source.text}"</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            Not directly mentioned in this transcript.
          </p>
        )}
      </section>

      <section className="border-border/60 flex flex-col gap-1.5 border-t pt-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
          Reference material
        </p>
        {hasMedical ? (
          <ul className="flex flex-col gap-2">
            {data.medicalSources.slice(0, 2).map((source) => (
              <li key={source.pmid || source.doi} className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground line-clamp-2 leading-snug font-medium">
                    {source.title}
                  </p>
                  <span className="mt-0.5 flex shrink-0 items-center gap-1">
                    <StudyDesignBadge studyDesign={source.studyDesign} />
                    <SourceBadge sourceId={source.sourceId} />
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5">
                  {source.journal || "Unknown journal"}
                  {source.publicationYear ? ` · ${source.publicationYear}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-snug">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            No local reference material for this term yet.
          </p>
        )}
      </section>
    </div>
  );
}
