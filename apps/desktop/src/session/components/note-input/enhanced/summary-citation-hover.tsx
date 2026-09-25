import type { EditorView } from "prosemirror-view";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@anlg/ui/components/ui/popover";

import { useCitedSourcesForContent } from "~/chat/hooks/use-current-note-sources";
import type { ClinicalEvidenceRow } from "~/clinical/repository";
import { SourceBadge } from "~/clinical/source-badge";
import { StudyDesignBadge } from "~/clinical/study-design-badge";

const HOVER_OPEN_DELAY_MS = 350;
const HOVER_CLOSE_DELAY_MS = 150;
const PMID_HREF_PREFIX = "https://pubmed.ncbi.nlm.nih.gov/";

function pmidFromHref(href: string): string | null {
  if (!href.startsWith(PMID_HREF_PREFIX)) {
    return null;
  }
  const match = href.slice(PMID_HREF_PREFIX.length).match(/^(\d+)\/?$/);
  return match ? match[1]! : null;
}

function closestCitationLink(
  node: Node | null,
  root: HTMLElement,
): { el: HTMLAnchorElement; pmid: string } | null {
  const element =
    node instanceof Element
      ? node
      : node instanceof Text
        ? node.parentElement
        : null;
  const anchor = element?.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || !root.contains(anchor)) {
    return null;
  }
  const pmid = pmidFromHref(anchor.href);
  return pmid ? { el: anchor, pmid } : null;
}

/**
 * Overlays the enhanced-note editor with a hover-to-preview affordance for
 * verified [PMID X](pubmed url) citation links (see globals.css for the pill
 * styling): hovering one shows the cited article's title, journal, and
 * excerpt without leaving the note. Positions via Radix's virtualRef against
 * the hovered anchor directly, mirroring SummaryLineHoverLayer, so it needs
 * no ProseMirror plugin or decoration.
 */
export function SummaryCitationHoverLayer({
  content,
  view,
}: {
  content: string;
  view: EditorView | null;
}) {
  const sources = useCitedSourcesForContent(content);
  const sourceByPmid = useMemo(
    () => new Map(sources.map((source) => [source.article.pmid, source])),
    [sources],
  );

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hoveredPmid, setHoveredPmid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const pendingElRef = useRef<HTMLElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const virtualRef = useRef<HTMLElement | null>(null);
  virtualRef.current = anchorEl;

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  useEffect(() => {
    if (!view) return;
    const dom = view.dom;

    const handleMouseOver = (event: MouseEvent) => {
      const hit = closestCitationLink(event.target as Node | null, dom);
      if (!hit || hit.el === pendingElRef.current) return;

      clearTimers();
      pendingElRef.current = hit.el;
      openTimer.current = setTimeout(() => {
        setAnchorEl(hit.el);
        setHoveredPmid(hit.pmid);
        setOpen(true);
      }, HOVER_OPEN_DELAY_MS);
    };

    const handleMouseOut = (event: MouseEvent) => {
      const related = closestCitationLink(
        event.relatedTarget as Node | null,
        dom,
      );
      if (related?.el === pendingElRef.current) return;

      clearTimers();
      pendingElRef.current = null;
      closeTimer.current = setTimeout(
        () => setOpen(false),
        HOVER_CLOSE_DELAY_MS,
      );
    };

    dom.addEventListener("mouseover", handleMouseOver);
    dom.addEventListener("mouseout", handleMouseOut);
    return () => {
      dom.removeEventListener("mouseover", handleMouseOver);
      dom.removeEventListener("mouseout", handleMouseOut);
      clearTimers();
    };
  }, [view]);

  if (!view) {
    return null;
  }

  const source = hoveredPmid ? sourceByPmid.get(hoveredPmid) : undefined;

  return (
    <Popover open={open && !!source} onOpenChange={setOpen}>
      {/* Radix's virtualRef type demands a non-null Measurable even though it
          only reads .current while open (i.e. once a citation is hovered). */}
      <PopoverAnchor virtualRef={virtualRef as RefObject<HTMLElement>} />
      <PopoverContent
        variant="app"
        align="start"
        className="w-80"
        onMouseEnter={clearTimers}
        onMouseLeave={() => {
          clearTimers();
          pendingElRef.current = null;
          closeTimer.current = setTimeout(
            () => setOpen(false),
            HOVER_CLOSE_DELAY_MS,
          );
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {source ? (
          <CitationHoverContent
            article={source.article}
            excerpt={source.excerpt}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function CitationHoverContent({
  article,
  excerpt,
}: {
  article: ClinicalEvidenceRow;
  excerpt: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-foreground line-clamp-2 text-sm leading-snug font-medium">
          {article.title}
        </p>
        <span className="mt-0.5 flex shrink-0 items-center gap-1">
          <StudyDesignBadge studyDesign={article.study_design} />
          <SourceBadge sourceId={article.source_id} />
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        {article.journal || "Unknown journal"}
        {article.publication_year ? ` · ${article.publication_year}` : ""}
        {article.pmid ? ` · PMID ${article.pmid}` : ""}
      </p>
      {excerpt ? (
        <p className="text-muted-foreground mt-0.5 line-clamp-3 text-xs leading-4">
          “{excerpt}”
        </p>
      ) : null}
      <a
        href={article.source_url}
        target="_blank"
        rel="noreferrer"
        className="text-primary mt-1 text-xs font-medium hover:underline"
      >
        Open source ↗
      </a>
    </div>
  );
}
