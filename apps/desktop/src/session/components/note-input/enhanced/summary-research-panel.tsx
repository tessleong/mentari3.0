import { useMemo } from "react";

import { json2md } from "@anlg/editor/markdown";

import { useCitedSourcesForContent } from "~/chat/hooks/use-current-note-sources";
import { CitedSourcesList } from "~/clinical/cited-sources-list";
import { hasPlausibleClinicalContent } from "~/clinical/medical-terms";
import { useEnhancedNote } from "~/session/queries";

// Shows the PubMed sources retrieved for this summary directly on the
// Summary tab — not just in the Ask Mentari chat panel — so the research
// grounding is visible without opening chat. Shows every source that was
// actually retrieved, not only the ones the model chose to cite inline
// (citing is only conditional in the generation prompt, so most retrieved
// evidence never appears in the text otherwise). Renders nothing for
// content that isn't plausibly clinical/research-worthy at all (most
// notes); shows an explicit "none found" state rather than nothing when the
// content looks clinical but nothing came through — otherwise there's no
// way to tell "this feature found nothing" from "this feature is broken".
export function SummaryResearchPanel({
  content,
  enhancedNoteId,
}: {
  content: string;
  enhancedNoteId: string;
}) {
  const note = useEnhancedNote(enhancedNoteId);
  const sources = useCitedSourcesForContent(content, note?.researchEvidence);
  const isPlausiblyClinical = useMemo(() => {
    try {
      return hasPlausibleClinicalContent(json2md(JSON.parse(content)));
    } catch {
      return false;
    }
  }, [content]);

  if (sources.length === 0 && !isPlausiblyClinical) {
    return null;
  }

  return (
    <div
      data-summary-research-panel
      // Explicit font-sans (PP Neue Montreal), not left to inheritance —
      // this panel sits alongside the editor's document content, and should
      // read as UI chrome rather than as part of the note body's typography.
      className="border-border/60 max-h-[35%] shrink-0 overflow-y-auto border-b font-sans"
    >
      <div className="flex flex-col gap-2 p-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
          Research sources
        </p>
        {sources.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No cited sources found for this summary yet.
          </p>
        ) : (
          <CitedSourcesList sources={sources} />
        )}
      </div>
    </div>
  );
}
