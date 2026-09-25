import { Fragment, memo, useMemo } from "react";

import { cn } from "@anlg/utils";

import { MedicalTermHoverCard } from "./medical-term-hover";
import type { HighlightSegment } from "./utils";

import { detectMedicalTerm } from "~/clinical/medical-terms";
import type { SegmentWord } from "~/stt/live-segment";
import { isTranscriptWordSeekable } from "~/stt/timing";

interface WordSpanProps {
  word: SegmentWord;
  displayText: string;
  audioExists: boolean;
  onClickWord: (word: SegmentWord) => void;
  highlightSegments?: HighlightSegment[];
  isActiveMatch?: boolean;
  sessionId?: string;
}

export const WordSpan = memo(function WordSpan(props: WordSpanProps) {
  const content = useHighlightedContent(
    props.word,
    props.displayText,
    props.highlightSegments,
    props.isActiveMatch ?? false,
  );
  const canSeek = props.audioExists && isTranscriptWordSeekable(props.word);
  const className = useMemo(
    () =>
      cn([
        "rounded-md transition-colors duration-150",
        canSeek && "hover:bg-primary/10 cursor-pointer",
        !props.word.is_final && [
          "bg-primary/10 text-primary mx-px px-1 py-0.5",
          "ring-primary/15 ring-1 ring-inset",
        ],
      ]),
    [canSeek, props.word.is_final],
  );
  const medicalTerm = useMemo(
    () => (props.sessionId ? detectMedicalTerm(props.word.text) : null),
    [props.sessionId, props.word.text],
  );

  const span = (
    <span
      onClick={() => canSeek && props.onClickWord(props.word)}
      className={className}
      data-transcript-word-id={props.word.id}
      data-transcript-word-start-ms={props.word.start_ms}
    >
      {content}
    </span>
  );

  if (medicalTerm && props.sessionId) {
    return (
      <MedicalTermHoverCard sessionId={props.sessionId} term={medicalTerm}>
        {span}
      </MedicalTermHoverCard>
    );
  }

  return span;
});

function useHighlightedContent(
  word: SegmentWord,
  displayText: string,
  segments: HighlightSegment[] | undefined,
  isActive: boolean,
) {
  return useMemo(() => {
    if (!segments) {
      return displayText;
    }

    const baseKey = word.id ?? word.text ?? "word";

    return segments.map((segment, index) =>
      segment.isMatch ? (
        <span
          key={`${baseKey}-match-${index}`}
          className={isActive ? "bg-yellow-500" : "bg-yellow-200/50"}
        >
          {segment.text}
        </span>
      ) : (
        <Fragment key={`${baseKey}-text-${index}`}>{segment.text}</Fragment>
      ),
    );
  }, [displayText, isActive, segments, word.id, word.text]);
}
