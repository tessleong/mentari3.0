import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { json2md } from "@anlg/editor/markdown";

import { extractCitedPmids } from "~/clinical/citation-verification";
import {
  type ClinicalEvidenceRow,
  fetchClinicalEvidenceByPmids,
} from "~/clinical/repository";
import type { SummaryMedicalEvidence } from "~/clinical/summary-evidence";
import { useEnhancedNote } from "~/session/queries";
import { useTabs } from "~/store/zustand/tabs";

type CitedSource = { article: ClinicalEvidenceRow; excerpt: string };

// Builds a display-ready source directly from retrieved evidence, without a
// DB round-trip — retrieved evidence isn't backed by the locally-ingested
// clinical_evidence_articles corpus, so a PMID lookup there would never find
// it even though it's a real, already-fetched PubMed result.
function toCitedSource(evidence: SummaryMedicalEvidence): CitedSource {
  return {
    article: {
      id: evidence.pmid,
      pmid: evidence.pmid,
      pmcid: "",
      doi: "",
      title: evidence.title,
      abstract_text: evidence.abstractText,
      journal: evidence.journal,
      publication_year: evidence.publicationYear,
      publication_types_json: "[]",
      mesh_terms_json: "[]",
      study_design: evidence.studyDesign,
      retraction_status: "clear",
      source_url: evidence.sourceUrl,
      fetched_at: "",
      source_id: "pubmed",
      external_id: evidence.pmid,
    },
    excerpt: evidence.abstractText,
  };
}

// The currently-viewed enhanced note, if any — mirrors the selector
// use-session-tab.ts computes internally, but that hook only exposes it via
// a non-reactive ref getter, and callers here need to re-render when it
// changes.
function useCurrentEnhancedNoteId(sessionId: string): string | undefined {
  return useTabs((state) =>
    state.currentTab?.type === "sessions" &&
    state.currentTab.id === sessionId &&
    state.currentTab.state.view?.type === "enhanced"
      ? state.currentTab.state.view.id
      : undefined,
  );
}

// The research sources for a given enhanced-note content string: sources
// explicitly cited inline (looked up in the locally-ingested corpus) plus
// whatever was actually retrieved for this generation (which the model is
// only conditionally asked to cite, so most retrieved evidence never makes
// it into the text) — shown together since both are real, already-fetched
// PubMed results relevant to this note, not just the subset the model
// happened to quote. Shared by every citation surface (research panel, chat
// suggestions, inline citation hover) so they resolve the same way.
export function useCitedSourcesForContent(
  content: string | undefined,
  researchEvidence: SummaryMedicalEvidence[] = [],
): CitedSource[] {
  const pmids = useMemo(() => {
    if (!content) {
      return [];
    }
    try {
      const markdown = json2md(JSON.parse(content));
      return extractCitedPmids(markdown);
    } catch (error) {
      console.error(
        "[use-current-note-sources] failed to read summary content",
        error,
      );
      return [];
    }
  }, [content]);

  const { data: citedSources = [] } = useQuery({
    queryKey: ["research-sources-panel", pmids.join(",")],
    queryFn: () => fetchClinicalEvidenceByPmids(pmids),
    enabled: pmids.length > 0,
  });

  return useMemo(() => {
    const byPmid = new Map(
      citedSources.map((source) => [source.article.pmid, source]),
    );
    for (const evidence of researchEvidence) {
      if (!byPmid.has(evidence.pmid)) {
        byPmid.set(evidence.pmid, toCitedSource(evidence));
      }
    }
    return [...byPmid.values()];
  }, [citedSources, researchEvidence]);
}

// The research sources for the currently-viewed enhanced note's summary.
export function useCurrentNoteSources(sessionId: string): CitedSource[] {
  const enhancedNoteId = useCurrentEnhancedNoteId(sessionId);
  const note = useEnhancedNote(enhancedNoteId ?? "");
  return useCitedSourcesForContent(note?.content, note?.researchEvidence);
}
