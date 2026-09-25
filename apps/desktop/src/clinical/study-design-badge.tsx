import { cn } from "@anlg/utils";

import type { StudyDesign } from "./pubmed";

// Real data already stored per article (see pubmed.ts's classifyStudyDesign)
// — an honest, groundable stand-in for Consensus-style "rigor" signals. Omits
// "other": too broad a bucket to say anything meaningful.
const STUDY_DESIGN_LABELS: Partial<Record<StudyDesign, string>> = {
  systematic_review: "Systematic Review",
  meta_analysis: "Meta-Analysis",
  practice_guideline: "Practice Guideline",
  randomized_controlled_trial: "RCT",
  clinical_trial: "Clinical Trial",
  observational_study: "Observational Study",
  case_report: "Case Report",
  review: "Review",
};

export function StudyDesignBadge({
  studyDesign,
  className,
}: {
  studyDesign: StudyDesign | string;
  className?: string;
}) {
  const label = STUDY_DESIGN_LABELS[studyDesign as StudyDesign];
  if (!label) {
    return null;
  }

  return (
    <span
      className={cn([
        "border-border text-muted-foreground inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        className,
      ])}
    >
      {label}
    </span>
  );
}
