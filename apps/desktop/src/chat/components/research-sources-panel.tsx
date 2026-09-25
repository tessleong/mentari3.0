import { Trans } from "@lingui/react/macro";

import { useCurrentNoteSources } from "~/chat/hooks/use-current-note-sources";
import { CitedSourcesList } from "~/clinical/cited-sources-list";

export function ResearchSourcesPanel({ sessionId }: { sessionId: string }) {
  const sources = useCurrentNoteSources(sessionId);

  if (sources.length === 0) {
    return null;
  }

  return (
    <div
      data-research-sources-panel
      className="border-border/60 max-h-[40%] shrink-0 overflow-y-auto border-b font-sans"
    >
      <div className="flex flex-col gap-2 p-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
          <Trans>Research sources</Trans>
        </p>
        <CitedSourcesList sources={sources} />
      </div>
    </div>
  );
}
