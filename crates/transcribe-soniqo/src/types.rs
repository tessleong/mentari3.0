use owhisper_interface::stream;

use crate::{SoniqoModel, stream_response_from_text};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadState {
    pub status: String,
    pub current_file: Option<String>,
    pub progress_percent: Option<u8>,
    pub local_path: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTranscript {
    pub text: String,
    pub duration_seconds: f64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub chunks: Vec<FileTranscriptChunk>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub speaker_segments: Vec<DiarizationSegment>,
}

impl FileTranscript {
    pub fn new(text: String, duration_seconds: f64) -> Self {
        Self {
            text,
            duration_seconds,
            chunks: Vec::new(),
            speaker_segments: Vec::new(),
        }
    }

    pub fn from_chunks(chunks: Vec<FileTranscriptChunk>, duration_seconds: f64) -> Self {
        let text = chunks
            .iter()
            .map(|chunk| chunk.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        Self {
            text,
            duration_seconds,
            chunks,
            speaker_segments: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTranscriptChunk {
    pub text: String,
    pub start_seconds: f64,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiarizationSegment {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub speaker_index: usize,
}

// Mirrors Soniqo's `Community1SpeakerBounds` field-for-field (unrenamed —
// `exact`/`minimum`/`maximum` — since this is serialized to JSON and decoded
// directly by the Swift side's `Codable` struct of the same shape).
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct SpeakerBounds {
    pub exact: Option<usize>,
    pub minimum: usize,
    pub maximum: Option<usize>,
}

impl SpeakerBounds {
    pub fn exact(count: usize) -> Self {
        Self {
            exact: Some(count),
            minimum: count,
            maximum: Some(count),
        }
    }

    pub fn range(minimum: usize, maximum: Option<usize>) -> Self {
        Self {
            exact: None,
            minimum,
            maximum,
        }
    }
}

// Embedding-based diarization is at its least reliable on short segments —
// a quick back-channel word or the tail of a turn can get clustered to the
// wrong speaker even though the surrounding audio is clearly one person
// talking. Without this, that shows up as a flickering "Speaker 1, Speaker
// 2, Speaker 1" pattern on ordinary back-and-forth conversation instead of
// clean per-turn labeling. Fold any segment shorter than `min_duration`
// into its neighbor when both neighbors agree on a different speaker than
// the short segment — the isolated segment is almost certainly a
// misclassification, not a real third voice interjecting for a fraction of
// a second. Segments are assumed sorted by start_seconds.
pub fn smooth_diarization_segments(
    segments: Vec<DiarizationSegment>,
    min_duration_seconds: f64,
) -> Vec<DiarizationSegment> {
    if segments.len() < 3 {
        return segments;
    }

    let mut smoothed = segments;
    let mut changed = true;
    while changed {
        changed = false;
        for index in 1..smoothed.len().saturating_sub(1) {
            let duration = smoothed[index].end_seconds - smoothed[index].start_seconds;
            if duration >= min_duration_seconds {
                continue;
            }

            let previous_speaker = smoothed[index - 1].speaker_index;
            let next_speaker = smoothed[index + 1].speaker_index;
            let current_speaker = smoothed[index].speaker_index;

            if previous_speaker == next_speaker && previous_speaker != current_speaker {
                smoothed[index].speaker_index = previous_speaker;
                changed = true;
            }
        }
    }

    merge_adjacent_same_speaker(smoothed)
}

fn merge_adjacent_same_speaker(segments: Vec<DiarizationSegment>) -> Vec<DiarizationSegment> {
    let mut merged: Vec<DiarizationSegment> = Vec::with_capacity(segments.len());
    for segment in segments {
        if let Some(last) = merged.last_mut() {
            if last.speaker_index == segment.speaker_index {
                last.end_seconds = segment.end_seconds;
                continue;
            }
        }
        merged.push(segment);
    }
    merged
}

#[cfg(test)]
mod diarization_smoothing_tests {
    use super::*;

    fn segment(start: f64, end: f64, speaker: usize) -> DiarizationSegment {
        DiarizationSegment {
            start_seconds: start,
            end_seconds: end,
            speaker_index: speaker,
        }
    }

    #[test]
    fn folds_a_short_misclassified_blip_into_its_agreeing_neighbors() {
        let segments = vec![
            segment(0.0, 3.0, 0),
            segment(3.0, 3.3, 1), // 0.3s blip, sandwiched by speaker 0 on both sides
            segment(3.3, 6.0, 0),
        ];

        let smoothed = smooth_diarization_segments(segments, 1.0);

        assert_eq!(smoothed.len(), 1);
        assert_eq!(smoothed[0].speaker_index, 0);
        assert_eq!(smoothed[0].start_seconds, 0.0);
        assert_eq!(smoothed[0].end_seconds, 6.0);
    }

    #[test]
    fn preserves_genuine_alternating_turns_that_are_long_enough() {
        let segments = vec![
            segment(0.0, 3.0, 0),
            segment(3.0, 6.0, 1),
            segment(6.0, 9.0, 0),
        ];

        let smoothed = smooth_diarization_segments(segments.clone(), 1.0);

        assert_eq!(smoothed, segments);
    }

    #[test]
    fn does_not_fold_a_short_segment_when_neighbors_disagree() {
        // A genuine three-way exchange shouldn't get collapsed just because
        // one turn happened to be brief.
        let segments = vec![
            segment(0.0, 3.0, 0),
            segment(3.0, 3.3, 1),
            segment(3.3, 6.0, 2),
        ];

        let smoothed = smooth_diarization_segments(segments.clone(), 1.0);

        assert_eq!(smoothed, segments);
    }

    #[test]
    fn cascades_through_consecutive_short_blips() {
        let segments = vec![
            segment(0.0, 3.0, 0),
            segment(3.0, 3.2, 1),
            segment(3.2, 3.4, 0),
            segment(3.4, 3.6, 1),
            segment(3.6, 6.0, 0),
        ];

        let smoothed = smooth_diarization_segments(segments, 1.0);

        assert_eq!(smoothed.len(), 1);
        assert_eq!(smoothed[0].speaker_index, 0);
        assert_eq!(smoothed[0].end_seconds, 6.0);
    }

    #[test]
    fn leaves_short_lists_untouched() {
        let segments = vec![segment(0.0, 0.3, 0), segment(0.3, 0.6, 1)];

        let smoothed = smooth_diarization_segments(segments.clone(), 1.0);

        assert_eq!(smoothed, segments);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptSource {
    Microphone,
    System,
}

impl TranscriptSource {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Microphone => "microphone",
            Self::System => "system",
        }
    }

    pub const fn channel_index(self) -> i32 {
        match self {
            Self::Microphone => 0,
            Self::System => 1,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LivePartial {
    pub source: String,
    pub text: String,
    pub is_final: bool,
}

impl LivePartial {
    pub fn source(&self) -> TranscriptSource {
        match self.source.as_str() {
            "system" => TranscriptSource::System,
            _ => TranscriptSource::Microphone,
        }
    }

    pub fn into_stream_response(
        self,
        model: SoniqoModel,
        start: f64,
        duration: f64,
    ) -> stream::StreamResponse {
        let source = self.source();
        stream_response_from_text(
            model,
            self.text,
            start,
            duration,
            self.is_final,
            &[source.channel_index(), 2],
        )
    }
}
