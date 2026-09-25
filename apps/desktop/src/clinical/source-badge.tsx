import { cn } from "@anlg/utils";

import { sourceDisplayLabel } from "./sources";

// Government/nonprofit sources (public-domain works, no trademark risk in
// showing them alongside our own product) get a distinct accent color per
// source. Private, trademarked sources (Mayo Clinic, UpToDate) intentionally
// get the same neutral treatment as an unrecognized source — we have no
// license to imply their branding endorses Mentari.
const ACCENTED_SOURCE_STYLES: Record<string, string> = {
  pubmed:
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200",
  "pmc-oa":
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200",
  medline_plus:
    "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200",
  cdc: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200",
};
const NEUTRAL_SOURCE_STYLE = "border-border bg-muted text-muted-foreground";

export function SourceBadge({
  sourceId,
  className,
}: {
  sourceId: string;
  className?: string;
}) {
  const label = sourceDisplayLabel(sourceId);
  const style = ACCENTED_SOURCE_STYLES[sourceId] ?? NEUTRAL_SOURCE_STYLE;

  return (
    <span
      className={cn([
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        style,
        className,
      ])}
    >
      {label}
    </span>
  );
}
