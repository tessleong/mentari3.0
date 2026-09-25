import type { ClinicalEvidenceRow } from "./repository";
import { SourceBadge } from "./source-badge";
import { StudyDesignBadge } from "./study-design-badge";

// Shared between the chat panel's ResearchSourcesPanel and the Summary
// editor's embedded panel — both list the same cited sources, just inside
// different containers.
export function CitedSourcesList({
  sources,
}: {
  sources: Array<{ article: ClinicalEvidenceRow; excerpt: string }>;
}) {
  return (
    <ol className="flex flex-col gap-2.5">
      {sources.map(({ article, excerpt }, index) => (
        <li key={article.id} className="text-xs">
          <div className="flex items-start justify-between gap-2">
            <a
              href={article.source_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary line-clamp-2 font-medium"
            >
              {index + 1}. {article.title}
            </a>
            <span className="mt-0.5 flex shrink-0 items-center gap-1">
              <StudyDesignBadge studyDesign={article.study_design} />
              <SourceBadge sourceId={article.source_id} />
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5">
            {article.journal || "Unknown journal"}
            {article.publication_year ? ` · ${article.publication_year}` : ""}
          </p>
          {excerpt ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 leading-4">
              “{excerpt}”
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
