//! Manual diarization benchmark against small, fully-scripted synthetic
//! conversations with known ground truth (see `tests/fixtures/diarization/`
//! and `synthesize.py` there for how they were generated).
//!
//! Requires the real Soniqo Parakeet-batch + Community-1 models to already be
//! downloaded locally (see `crates/transcribe-soniqo`'s model cache). Not run
//! by default — real model inference, too slow/environment-dependent for CI.
//!
//! Run with:
//!   cargo test -p transcribe-soniqo --test diarization_bench -- --ignored --nocapture

use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;

use transcribe_soniqo::{SoniqoModel, SpeakerBounds, diarize_samples};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroundTruth {
    name: String,
    #[allow(dead_code)]
    sample_rate: u32,
    speaker_count: usize,
    segments: Vec<GroundTruthSegment>,
}

#[derive(Debug, Deserialize, Clone)]
struct GroundTruthSegment {
    speaker: String,
    start: f64,
    end: f64,
}

const FRAME_SECONDS: f64 = 0.05;

fn load_scenario(name: &str) -> (Vec<f32>, GroundTruth) {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/diarization");
    let wav_path = fixtures.join(format!("{name}.wav"));
    let json_path = fixtures.join(format!("{name}.json"));

    let mut reader = hound::WavReader::open(&wav_path)
        .unwrap_or_else(|error| panic!("failed to open {}: {error}", wav_path.display()));
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|sample| sample.unwrap() as f32 / 32768.0)
        .collect();

    let ground_truth: GroundTruth = serde_json::from_str(
        &std::fs::read_to_string(&json_path)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", json_path.display())),
    )
    .unwrap_or_else(|error| panic!("failed to parse {}: {error}", json_path.display()));

    (samples, ground_truth)
}

/// Frame-level speaker-error rate, restricted to frames where the ground
/// truth has exactly one active speaker (i.e. not scoring the deliberately
/// overlapping regions, which real DER handles but which need a fuller
/// multi-label scorer than this informal benchmark implements). Finds the
/// best predicted-index -> ground-truth-label mapping by brute-force search
/// (tractable at this speaker count) rather than assuming an ordering.
fn score(
    ground_truth: &[GroundTruthSegment],
    predicted: &[transcribe_soniqo::DiarizationSegment],
    duration_seconds: f64,
) -> BenchResult {
    let frame_count = (duration_seconds / FRAME_SECONDS).ceil() as usize;
    let mut gt_frame_speaker: Vec<Option<&str>> = vec![None; frame_count];
    let mut overlap_frame = vec![false; frame_count];

    for frame in 0..frame_count {
        let t = frame as f64 * FRAME_SECONDS + FRAME_SECONDS / 2.0;
        let active: Vec<&str> = ground_truth
            .iter()
            .filter(|segment| t >= segment.start && t < segment.end)
            .map(|segment| segment.speaker.as_str())
            .collect();
        match active.as_slice() {
            [] => {}
            [single] => gt_frame_speaker[frame] = Some(single),
            _ => overlap_frame[frame] = true,
        }
    }

    let mut predicted_frame_speaker: Vec<Option<usize>> = vec![None; frame_count];
    for frame in 0..frame_count {
        let t = frame as f64 * FRAME_SECONDS + FRAME_SECONDS / 2.0;
        if let Some(segment) = predicted
            .iter()
            .find(|segment| t >= segment.start_seconds && t < segment.end_seconds)
        {
            predicted_frame_speaker[frame] = Some(segment.speaker_index);
        }
    }

    let predicted_speakers: Vec<usize> = {
        let mut set: Vec<usize> = predicted.iter().map(|s| s.speaker_index).collect();
        set.sort_unstable();
        set.dedup();
        set
    };
    let gt_speakers: Vec<&str> = {
        let mut set: Vec<&str> = ground_truth.iter().map(|s| s.speaker.as_str()).collect();
        set.sort_unstable();
        set.dedup();
        set
    };

    let scored_frames: Vec<usize> = (0..frame_count)
        .filter(|&frame| !overlap_frame[frame] && gt_frame_speaker[frame].is_some())
        .collect();

    let best_mapping = best_permutation_mapping(
        &scored_frames,
        &gt_frame_speaker,
        &predicted_frame_speaker,
        &predicted_speakers,
        &gt_speakers,
    );

    let correct = scored_frames
        .iter()
        .filter(|&&frame| {
            let gt = gt_frame_speaker[frame].unwrap();
            match predicted_frame_speaker[frame] {
                Some(predicted_index) => best_mapping.get(&predicted_index) == Some(&gt),
                None => false,
            }
        })
        .count();

    BenchResult {
        scenario: String::new(),
        bounds_label: String::new(),
        predicted_speaker_count: predicted_speakers.len(),
        ground_truth_speaker_count: gt_speakers.len(),
        scored_frames: scored_frames.len(),
        correct_frames: correct,
    }
}

/// Brute-force search over all assignments of predicted indices to ground
/// truth labels (both counts are small — at most 4 — so this is exhaustive,
/// not approximate, unlike a real DER scorer's Hungarian algorithm).
fn best_permutation_mapping<'a>(
    scored_frames: &[usize],
    gt_frame_speaker: &[Option<&'a str>],
    predicted_frame_speaker: &[Option<usize>],
    predicted_speakers: &[usize],
    gt_speakers: &[&'a str],
) -> HashMap<usize, &'a str> {
    fn permutations<T: Clone>(items: &[T]) -> Vec<Vec<T>> {
        if items.is_empty() {
            return vec![vec![]];
        }
        let mut result = Vec::new();
        for i in 0..items.len() {
            let mut rest = items.to_vec();
            let picked = rest.remove(i);
            for mut tail in permutations(&rest) {
                tail.insert(0, picked.clone());
                result.push(tail);
            }
        }
        result
    }

    let mut best_score = 0usize;
    let mut best_mapping = HashMap::new();

    // Map the smaller set into the larger one so every candidate mapping is
    // total on the smaller side; unmapped predicted indices simply never match.
    let assignable_labels: Vec<Option<&str>> = if gt_speakers.len() >= predicted_speakers.len() {
        gt_speakers.iter().map(|s| Some(*s)).collect()
    } else {
        gt_speakers
            .iter()
            .map(|s| Some(*s))
            .chain(std::iter::repeat(None))
            .take(predicted_speakers.len())
            .collect()
    };

    for permutation in permutations(&assignable_labels) {
        let mapping: HashMap<usize, &str> = predicted_speakers
            .iter()
            .zip(permutation.iter())
            .filter_map(|(&index, label)| label.map(|label| (index, label)))
            .collect();

        let score = scored_frames
            .iter()
            .filter(|&&frame| {
                let gt = gt_frame_speaker[frame].unwrap();
                predicted_frame_speaker[frame]
                    .and_then(|index| mapping.get(&index))
                    .is_some_and(|&mapped| mapped == gt)
            })
            .count();

        if score > best_score {
            best_score = score;
            best_mapping = mapping;
        }
    }

    best_mapping
}

#[derive(Debug)]
struct BenchResult {
    scenario: String,
    bounds_label: String,
    predicted_speaker_count: usize,
    ground_truth_speaker_count: usize,
    scored_frames: usize,
    correct_frames: usize,
}

impl BenchResult {
    fn error_rate(&self) -> f64 {
        if self.scored_frames == 0 {
            return 0.0;
        }
        1.0 - (self.correct_frames as f64 / self.scored_frames as f64)
    }
}

fn run_scenario(name: &str, bounds_label: &str, bounds: SpeakerBounds) -> BenchResult {
    let (samples, ground_truth) = load_scenario(name);
    let duration_seconds = samples.len() as f64 / 16_000.0;

    let segments = diarize_samples(SoniqoModel::ParakeetBatch, &samples, bounds)
        .unwrap_or_else(|error| panic!("diarization failed for {name} ({bounds_label}): {error}"));

    let mut result = score(&ground_truth.segments, &segments, duration_seconds);
    result.scenario = ground_truth.name.clone();
    result.bounds_label = bounds_label.to_string();
    result.ground_truth_speaker_count = ground_truth.speaker_count;
    result
}

fn print_result(result: &BenchResult) {
    println!(
        "{:<35} {:<24} predicted_speakers={} gt_speakers={} frames={} correct={} error_rate={:.1}%",
        result.scenario,
        result.bounds_label,
        result.predicted_speaker_count,
        result.ground_truth_speaker_count,
        result.scored_frames,
        result.correct_frames,
        result.error_rate() * 100.0,
    );
}

#[test]
#[ignore = "requires the real downloaded Soniqo model and runs real on-device inference"]
fn benchmark_forced_exact_two_vs_inferred_range_default() {
    let scenarios: &[(&str, Option<SpeakerBounds>)] = &[
        ("clean_two_speaker", None),
        ("short_utterances_and_interruption", None),
        ("similar_voices_two_speaker", None),
        ("three_speaker", Some(SpeakerBounds::exact(3))),
    ];

    println!(
        "\n{:<35} {:<24} {:<28} {:<20} {:<16} {:<14} {}",
        "scenario", "bounds", "predicted/gt speakers", "frames", "correct", "err%", ""
    );

    for (name, exact_when_known) in scenarios {
        let old_forced_exact_two =
            run_scenario(name, "old: forced exact(2)", SpeakerBounds::exact(2));
        print_result(&old_forced_exact_two);

        let new_inferred_range =
            run_scenario(name, "new: range(2, 4)", SpeakerBounds::range(2, Some(4)));
        print_result(&new_inferred_range);

        if let Some(bounds) = exact_when_known {
            let with_known_count = run_scenario(name, "reference: exact(known)", *bounds);
            print_result(&with_known_count);

            if let Some(exact) = bounds.exact {
                let raised_minimum = run_scenario(
                    name,
                    "diag: minimum(known)-4",
                    SpeakerBounds::range(exact, Some(4)),
                );
                print_result(&raised_minimum);
            }
        }
    }
}
