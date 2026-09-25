use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::{Stream, StreamExt};
use owhisper_interface::batch_stream::BatchStreamEvent;
use tracing::Instrument;

use anlg_audio_chunking::{AudioChunk, SpeechChunkExt, SpeechChunkingConfig};
use anlg_audio_utils::Source;
use anlg_transcribe_core::TARGET_SAMPLE_RATE;

use super::super::{
    BatchParams, BatchRunMode, BatchRunOutput, format_user_friendly_error, session_span,
};
use crate::{BatchEvent, BatchRuntime};

pub(super) const SONIQO_PARAKEET_MAX_CHUNK_SAMPLES: usize = TARGET_SAMPLE_RATE as usize * 59 / 2;
pub(super) const SONIQO_DIARIZATION_MAX_SAMPLES: usize = TARGET_SAMPLE_RATE as usize * 10 * 60;
pub(super) const SONIQO_PROGRESS_PLANNED: f64 = 0.05;
const SONIQO_PROGRESS_RANGE: f64 = 0.90;
pub(super) const SONIQO_PROGRESS_MAX: f64 = 0.95;
pub(super) const SONIQO_DIRECT_MIC_MIN_RMS: f64 = 0.0008;
pub(super) const SONIQO_ACTIVE_CHANNEL_MIN_RMS: f64 = 0.0005;
pub(super) const SONIQO_DIARIZATION_MIN_SEGMENT_SECONDS: f64 = 1.0;
pub(super) const MAX_LOCAL_BATCH_CHANNELS: usize = 8;
const SONIQO_SPEECH_REDEMPTION_TIME: Duration = Duration::from_millis(150);
pub(super) const LOCAL_BATCH_CANCELLED: &str = "Local transcription was cancelled.";

#[derive(Debug)]
pub(super) struct ResampledChannelFile {
    pub(super) file: tempfile::NamedTempFile,
    pub(super) sample_count: usize,
    pub(super) rms: f64,
}

#[cfg(test)]
pub(super) fn resample_audio_to_channel_files<S>(
    source_path: &str,
    source: S,
) -> std::result::Result<Vec<ResampledChannelFile>, String>
where
    S: Source,
{
    resample_audio_to_channel_files_until(source_path, source, || false)
}

pub(super) fn resample_audio_to_channel_files_until<S, F>(
    source_path: &str,
    source: S,
    mut is_cancelled: F,
) -> std::result::Result<Vec<ResampledChannelFile>, String>
where
    S: Source,
    F: FnMut() -> bool,
{
    if is_cancelled() {
        return Err(LOCAL_BATCH_CANCELLED.to_string());
    }

    let channel_count = u16::from(source.channels()) as usize;
    if channel_count > MAX_LOCAL_BATCH_CHANNELS {
        return Err(format!(
            "Local transcription supports at most {MAX_LOCAL_BATCH_CHANNELS} audio channels; the recording declares {channel_count}."
        ));
    }
    let parent = Path::new(source_path).parent();
    let mut files = (0..channel_count)
        .map(|_| create_channel_tempfile(parent))
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut writers = files
        .iter()
        .map(|file| {
            file.reopen()
                .map(BufWriter::new)
                .map_err(anlg_audio_utils::Error::from)
                .and_then(|file| hound::WavWriter::new(file, spec).map_err(Into::into))
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e: anlg_audio_utils::Error| e.to_string())?;
    let mut stereo_difference = 0.0f64;
    let mut stereo_samples = 0usize;
    let mut channel_sum_squares = vec![0.0f64; channel_count];
    let mut channel_sample_counts = vec![0usize; channel_count];

    let info = anlg_audio_utils::for_each_resampled_channel_block::<_, anlg_audio_utils::Error>(
        source,
        TARGET_SAMPLE_RATE,
        |channels| {
            if is_cancelled() {
                return Err(std::io::Error::other(LOCAL_BATCH_CANCELLED).into());
            }
            for (index, (writer, channel)) in writers.iter_mut().zip(channels).enumerate() {
                for sample in *channel {
                    writer.write_sample(*sample)?;
                    channel_sum_squares[index] += f64::from(*sample) * f64::from(*sample);
                }
                channel_sample_counts[index] += channel.len();
            }
            if channels.len() == 2 {
                stereo_difference += channels[0]
                    .iter()
                    .zip(channels[1])
                    .map(|(left, right)| f64::from((left - right).abs()))
                    .sum::<f64>();
                stereo_samples += channels[0].len().min(channels[1].len());
            }
            Ok(())
        },
    )
    .map_err(|e| e.to_string())?;

    for writer in writers {
        writer.finalize().map_err(|e| e.to_string())?;
    }

    if is_cancelled() {
        return Err(LOCAL_BATCH_CANCELLED.to_string());
    }

    if files.len() == 2
        && stereo_samples > 0
        && stereo_difference / (stereo_samples as f64) < 0.0005
    {
        files.truncate(1);
    }

    Ok(files
        .into_iter()
        .enumerate()
        .map(|(index, file)| ResampledChannelFile {
            file,
            sample_count: info.frame_count,
            rms: if channel_sample_counts[index] == 0 {
                0.0
            } else {
                (channel_sum_squares[index] / channel_sample_counts[index] as f64).sqrt()
            },
        })
        .collect())
}

fn create_channel_tempfile(parent: Option<&Path>) -> std::io::Result<tempfile::NamedTempFile> {
    let in_parent = parent.and_then(|parent| {
        tempfile::Builder::new()
            .prefix("anarlog_channel_")
            .suffix(".wav")
            .tempfile_in(parent)
            .ok()
    });
    match in_parent {
        Some(file) => Ok(file),
        None => tempfile::Builder::new()
            .prefix("anarlog_channel_")
            .suffix(".wav")
            .tempfile(),
    }
}

pub(in crate::batch) async fn run_apple_speech_batch(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
    listen_params: owhisper_interface::ListenParams,
) -> crate::Result<BatchRunOutput> {
    let span = session_span(&params.session_id);

    async {
        let locale = anlg_transcribe_speechanalyzer::resolve_session_locale(
            &listen_params.languages,
        )
        .ok_or_else(|| crate::BatchFailure::DirectRequestFailed {
            provider: "apple-speech".to_string(),
            message:
                "Add this language in System Settings > General > Language & Region to transcribe it with Apple Speech."
                    .to_string(),
        })?;
        let file_path = params.file_path.clone();
        let started_at = Instant::now();

        tracing::info!(
            anarlog.stt.provider.name = "apple-speech",
            anarlog.stt.language = %locale,
            "apple_speech_batch_start"
        );

        let session_id = params.session_id.clone();
        let progress_runtime = runtime.clone();
        let num_speakers = listen_params.num_speakers;
        let min_speakers = listen_params.min_speakers;
        let max_speakers = listen_params.max_speakers;
        let transcribed = tokio::task::spawn_blocking(
            move || -> std::result::Result<
                Vec<anlg_transcribe_speechanalyzer::FileTranscript>,
                String,
            > {
                let progress = SoniqoProgressReporter {
                    runtime: progress_runtime,
                    session_id,
                };
                let transcripts =
                    transcribe_apple_speech_file(&file_path, &locale, Some(&progress))?;
                Ok(diarize_apple_speech_transcripts(
                    &file_path,
                    num_speakers,
                    min_speakers,
                    max_speakers,
                    transcripts,
                    Some(&progress),
                ))
            },
        )
        .await
        .map_err(|e| crate::BatchFailure::DirectRequestFailed {
            provider: "apple-speech".to_string(),
            message: format!("Apple Speech transcription task failed: {e}"),
        })?
        .map_err(|e| {
            let message = format_user_friendly_error(&e);
            tracing::error!(
                anarlog.stt.provider.name = "apple-speech",
                error = %e,
                anarlog.error.user_message = %message,
                "apple_speech_batch_failed"
            );
            crate::BatchFailure::DirectRequestFailed {
                provider: "apple-speech".to_string(),
                message,
            }
        })?;

        tracing::info!(
            anarlog.stt.provider.name = "apple-speech",
            elapsed_ms = started_at.elapsed().as_millis() as u64,
            transcript.channel_count = transcribed.len(),
            "apple_speech_batch_completed"
        );

        Ok(BatchRunOutput {
            session_id: params.session_id,
            mode: BatchRunMode::Direct,
            response: anlg_transcribe_speechanalyzer::batch_response_from_transcripts(transcribed),
        })
    }
    .instrument(span)
    .await
}

/// Transcribes each recorded channel separately so mic and system audio stay attributable.
fn transcribe_apple_speech_file(
    file_path: &str,
    locale: &str,
    progress: Option<&SoniqoProgressReporter>,
) -> std::result::Result<Vec<anlg_transcribe_speechanalyzer::FileTranscript>, String> {
    ensure_local_batch_running(progress)?;
    let source = anlg_audio_utils::source_from_path(file_path).map_err(|e| e.to_string())?;
    let channels = resample_audio_to_channel_files_until(file_path, source, || {
        local_batch_is_cancelled(progress)
    })?;
    ensure_local_batch_running(progress)?;

    if let Some(progress) = progress {
        progress.emit(SONIQO_PROGRESS_PLANNED);
    }

    let total = channels.len().max(1);
    let mut transcripts = Vec::with_capacity(channels.len());

    for (index, channel) in channels.into_iter().enumerate() {
        ensure_local_batch_running(progress)?;
        let transcript =
            anlg_transcribe_speechanalyzer::transcribe_file(channel.file.path(), locale)
                .map_err(|e| e.to_string())?;
        ensure_local_batch_running(progress)?;
        transcripts.push(transcript);

        if let Some(progress) = progress {
            progress.emit(soniqo_batch_progress(index + 1, total));
        }
    }

    Ok(transcripts)
}

// Apple Speech only tells speakers apart by physical channel (mic vs.
// system audio) — see `transcribe_apple_speech_file`'s doc comment. That
// works for remote calls but leaves an in-person, single-microphone
// recording as one undivided transcript. When exactly one channel is
// active, reuse Soniqo's diarization model against the raw audio and merge
// the resulting speaker segments onto the transcript's real word timings —
// deliberately decoupled from which engine produced the words, since the
// diarizer is a separate acoustic step. Any failure (including the model
// not being downloaded yet) degrades to the original, undiarized
// transcripts rather than failing the whole batch.
fn diarize_apple_speech_transcripts(
    file_path: &str,
    num_speakers: Option<u32>,
    min_speakers: Option<u32>,
    max_speakers: Option<u32>,
    mut transcripts: Vec<anlg_transcribe_speechanalyzer::FileTranscript>,
    progress: Option<&SoniqoProgressReporter>,
) -> Vec<anlg_transcribe_speechanalyzer::FileTranscript> {
    let Ok(source) = anlg_audio_utils::source_from_path(file_path) else {
        return transcripts;
    };
    let Ok(channel_files) = resample_audio_to_channel_files_until(file_path, source, || {
        local_batch_is_cancelled(progress)
    }) else {
        return transcripts;
    };
    if channel_files.len() != transcripts.len() {
        // This resample pass disagreed with the transcription pass about
        // channel count — don't guess which transcript maps to which channel.
        return transcripts;
    }

    let active_channels = channel_files
        .iter()
        .map(|channel| channel.rms >= SONIQO_ACTIVE_CHANNEL_MIN_RMS)
        .collect::<Vec<_>>();
    let mut active_indices = active_channels
        .iter()
        .enumerate()
        .filter(|(_, active)| **active)
        .map(|(index, _)| index);
    let (Some(mic_channel_index), None) = (active_indices.next(), active_indices.next()) else {
        // Zero or two+ active channels: either silence, or a real call where
        // the mic/system-audio split already separates speakers.
        return transcripts;
    };

    let requested_bounds = requested_speaker_bounds(num_speakers, min_speakers, max_speakers);
    let Some(bounds) = soniqo_requested_diarization_bounds(requested_bounds, &active_channels)
    else {
        return transcripts;
    };
    let channel_sample_counts = channel_files
        .iter()
        .map(|channel| channel.sample_count)
        .collect::<Vec<_>>();
    if !soniqo_diarization_plan_within_limit(&channel_sample_counts, &active_channels, Some(bounds))
    {
        tracing::warn!(
            anarlog.stt.provider.name = "apple-speech",
            "apple_speech_diarization_skipped_for_long_recording"
        );
        return transcripts;
    }
    let Some(speaker_bounds) =
        soniqo_diarization_speaker_bounds(Some(bounds), &active_channels, mic_channel_index)
    else {
        return transcripts;
    };

    let channel = &channel_files[mic_channel_index];
    let segments = match diarize_soniqo_channel_file(
        anlg_transcribe_soniqo::SoniqoModel::ParakeetBatch,
        mic_channel_index,
        channel,
        speaker_bounds,
        progress,
    ) {
        Ok(segments) => segments,
        Err(error) => {
            tracing::warn!(
                anarlog.stt.provider.name = "apple-speech",
                error = %error,
                "apple_speech_diarization_failed"
            );
            return transcripts;
        }
    };

    if let Some(transcript) = transcripts.get_mut(mic_channel_index) {
        transcript.speaker_segments = segments
            .into_iter()
            .map(
                |segment| anlg_transcribe_speechanalyzer::DiarizationSegment {
                    start_seconds: segment.start_seconds,
                    end_seconds: segment.end_seconds,
                    speaker_index: segment.speaker_index,
                },
            )
            .collect();
    }

    transcripts
}

pub(in crate::batch) async fn run_soniqo_batch(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
    listen_params: owhisper_interface::ListenParams,
) -> crate::Result<BatchRunOutput> {
    let span = session_span(&params.session_id);

    async {
        let model = listen_params
            .model
            .as_deref()
            .ok_or_else(|| crate::BatchFailure::DirectRequestFailed {
                provider: "soniqo".to_string(),
                message: "Missing Soniqo model.".to_string(),
            })?
            .parse::<anlg_transcribe_soniqo::SoniqoModel>()
            .map_err(|e| crate::BatchFailure::DirectRequestFailed {
                provider: "soniqo".to_string(),
                message: e.to_string(),
            })?
            .batch_model();

        let file_path = params.file_path.clone();
        let file_extension = Path::new(&file_path)
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
            .to_string();
        let language = listen_params
            .languages
            .first()
            .map(anlg_language::Language::bcp47_code);
        let language_hint = soniqo_language_hint(language.as_deref());
        let num_speakers = listen_params.num_speakers;
        let min_speakers = listen_params.min_speakers;
        let max_speakers = listen_params.max_speakers;
        let language_label = language.as_deref().unwrap_or("auto").to_string();
        let language_hint_label = language_hint.as_deref().unwrap_or("auto").to_string();
        let started_at = Instant::now();

        tracing::info!(
            anarlog.stt.provider.name = "soniqo",
            anarlog.stt.model = %model,
            anarlog.stt.language = %language_label,
            anarlog.stt.language_hint = %language_hint_label,
            file.extension = %file_extension,
            "soniqo_batch_start"
        );

        let session_id = params.session_id.clone();
        let async_runtime = tokio::runtime::Handle::current();
        let transcribed = tokio::task::spawn_blocking(move || {
            let progress = SoniqoProgressReporter {
                runtime,
                session_id,
            };
            transcribe_soniqo_file(
                model,
                &file_path,
                language_hint.as_deref(),
                num_speakers,
                min_speakers,
                max_speakers,
                Some(&progress),
                &async_runtime,
            )
        })
        .await
        .map_err(|e| {
            tracing::error!(
                anarlog.stt.provider.name = "soniqo",
                anarlog.stt.model = %model,
                error = %e,
                "soniqo_batch_task_join_failed"
            );
            crate::BatchFailure::DirectRequestFailed {
                provider: "soniqo".to_string(),
                message: format!("Soniqo transcription task failed: {e}"),
            }
        })?
        .map_err(|e| {
            let message = format_user_friendly_error(&e);
            tracing::error!(
                anarlog.stt.provider.name = "soniqo",
                anarlog.stt.model = %model,
                error = %e,
                anarlog.error.user_message = %message,
                "soniqo_batch_failed"
            );
            crate::BatchFailure::DirectRequestFailed {
                provider: "soniqo".to_string(),
                message,
            }
        })?;

        tracing::info!(
            anarlog.stt.provider.name = "soniqo",
            anarlog.stt.model = %model,
            elapsed_ms = started_at.elapsed().as_millis() as u64,
            transcript.channel_count = transcribed.len(),
            "soniqo_batch_completed"
        );

        let response = anlg_transcribe_soniqo::batch_response_from_channels(model, transcribed);

        Ok(BatchRunOutput {
            session_id: params.session_id,
            mode: BatchRunMode::Direct,
            response,
        })
    }
    .instrument(span)
    .await
}

fn transcribe_soniqo_file(
    model: anlg_transcribe_soniqo::SoniqoModel,
    file_path: &str,
    language: Option<&str>,
    num_speakers: Option<u32>,
    min_speakers: Option<u32>,
    max_speakers: Option<u32>,
    progress: Option<&SoniqoProgressReporter>,
    async_runtime: &tokio::runtime::Handle,
) -> std::result::Result<Vec<anlg_transcribe_soniqo::FileTranscript>, String> {
    ensure_local_batch_running(progress)?;
    let source = anlg_audio_utils::source_from_path(file_path).map_err(|e| e.to_string())?;
    let channel_count = u16::from(source.channels()).max(1) as usize;
    let sample_rate = u32::from(source.sample_rate());
    let duration_ms = source
        .total_duration()
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64);

    tracing::info!(
        anarlog.stt.provider.name = "soniqo",
        anarlog.stt.model = %model,
        anarlog.stt.language = %language.unwrap_or("auto"),
        audio.channel_count = channel_count,
        audio.sample_rate_hz = sample_rate,
        audio.duration_ms = duration_ms.unwrap_or_default(),
        audio.duration_known = duration_ms.is_some(),
        "soniqo_audio_file_loaded"
    );

    let resample_started_at = Instant::now();
    let channel_files = resample_audio_to_channel_files_until(file_path, source, || {
        local_batch_is_cancelled(progress)
    })?;
    ensure_local_batch_running(progress)?;
    let resampled_sample_count = channel_files
        .iter()
        .map(|channel| channel.sample_count)
        .sum::<usize>();
    tracing::info!(
        anarlog.stt.provider.name = "soniqo",
        anarlog.stt.model = %model,
        elapsed_ms = resample_started_at.elapsed().as_millis() as u64,
        audio.source_sample_rate_hz = sample_rate,
        audio.target_sample_rate_hz = TARGET_SAMPLE_RATE,
        audio.resampled_sample_count = resampled_sample_count,
        "soniqo_audio_resampled"
    );

    tracing::info!(
        anarlog.stt.provider.name = "soniqo",
        anarlog.stt.model = %model,
        audio.source_channel_count = channel_count,
        audio.transcribed_channel_count = channel_files.len(),
        audio.mic_rms = channel_files.first().map(|channel| channel.rms).unwrap_or_default(),
        audio.system_rms = channel_files.get(1).map(|channel| channel.rms).unwrap_or_default(),
        "soniqo_channels_prepared"
    );

    let transcribed_channel_count = channel_files.len();
    let active_channels = channel_files
        .iter()
        .map(|channel| channel.rms >= SONIQO_ACTIVE_CHANNEL_MIN_RMS)
        .collect::<Vec<_>>();
    let requested_bounds = requested_speaker_bounds(num_speakers, min_speakers, max_speakers);
    let requested_diarization_bounds =
        soniqo_requested_diarization_bounds(requested_bounds, &active_channels);
    tracing::info!(
        anarlog.stt.provider.name = "soniqo",
        anarlog.stt.model = %model,
        audio.mic_active = active_channels.first().copied().unwrap_or(false),
        audio.system_active = active_channels.get(1).copied().unwrap_or(false),
        diarization.requested_minimum = requested_diarization_bounds.map(|bounds| bounds.minimum).unwrap_or_default(),
        diarization.requested_maximum = requested_diarization_bounds.and_then(|bounds| bounds.maximum).unwrap_or_default(),
        diarization.requested_exact = requested_diarization_bounds.and_then(|bounds| bounds.exact).unwrap_or_default(),
        diarization.speaker_count_known = requested_diarization_bounds.is_some(),
        "soniqo_channel_activity_classified"
    );
    let channel_sample_counts = channel_files
        .iter()
        .map(|channel| channel.sample_count)
        .collect::<Vec<_>>();
    let diarization_within_limit = soniqo_diarization_plan_within_limit(
        &channel_sample_counts,
        &active_channels,
        requested_diarization_bounds,
    );
    let diarization_bounds = if diarization_within_limit {
        requested_diarization_bounds
    } else {
        None
    };
    if !diarization_within_limit {
        tracing::warn!(
            anarlog.stt.provider.name = "soniqo",
            anarlog.stt.model = %model,
            audio.duration_seconds = channel_sample_counts.iter().copied().max().unwrap_or_default()
                as f64
                / TARGET_SAMPLE_RATE as f64,
            diarization.max_duration_seconds =
                SONIQO_DIARIZATION_MAX_SAMPLES / TARGET_SAMPLE_RATE as usize,
            "soniqo_diarization_skipped_for_long_recording"
        );
    }
    if let Some(progress) = progress {
        progress.emit(soniqo_batch_progress(0, transcribed_channel_count));
    }

    let mut channel_results = Vec::with_capacity(transcribed_channel_count);
    let mut channel_speaker_segments = Vec::with_capacity(transcribed_channel_count);
    for (channel_index, channel) in channel_files.into_iter().enumerate() {
        ensure_local_batch_running(progress)?;
        let speaker_segments = match soniqo_diarization_speaker_bounds(
            diarization_bounds,
            &active_channels,
            channel_index,
        ) {
            Some(speaker_bounds) => diarize_soniqo_channel_file(
                model,
                channel_index,
                &channel,
                speaker_bounds,
                progress,
            )?,
            None => Vec::new(),
        };
        let plan = soniqo_channel_plan(
            model,
            channel_index,
            channel,
            transcribed_channel_count == 2 && channel_index == 0,
        );
        let channel_result =
            transcribe_soniqo_channel_chunks(model, plan, language, progress, async_runtime);
        ensure_local_batch_running(progress)?;
        channel_results.push(channel_result);
        channel_speaker_segments.push(speaker_segments);

        if let Some(progress) = progress {
            progress.emit(soniqo_batch_progress(
                channel_index + 1,
                transcribed_channel_count,
            ));
        }
    }

    let mut transcripts = collect_soniqo_channel_transcripts(channel_results)?;
    for (transcript, speaker_segments) in transcripts
        .iter_mut()
        .zip(channel_speaker_segments.into_iter())
    {
        transcript.speaker_segments = speaker_segments;
    }
    Ok(transcripts)
}

struct SoniqoProgressReporter {
    runtime: Arc<dyn BatchRuntime>,
    session_id: String,
}

impl SoniqoProgressReporter {
    fn emit(&self, percentage: f64) {
        self.runtime.emit(BatchEvent::BatchResponseStreamed {
            session_id: self.session_id.clone(),
            event: BatchStreamEvent::Progress {
                percentage,
                partial_text: None,
            },
        });
    }

    fn is_cancelled(&self) -> bool {
        self.runtime.is_cancelled()
    }
}

fn local_batch_is_cancelled(progress: Option<&SoniqoProgressReporter>) -> bool {
    progress.is_some_and(SoniqoProgressReporter::is_cancelled)
}

fn ensure_local_batch_running(
    progress: Option<&SoniqoProgressReporter>,
) -> std::result::Result<(), String> {
    if local_batch_is_cancelled(progress) {
        Err(LOCAL_BATCH_CANCELLED.to_string())
    } else {
        Ok(())
    }
}

struct SoniqoChannelPlan {
    channel_index: usize,
    duration_seconds: f64,
    is_direct_mic: bool,
    chunk_strategy: SoniqoChunkStrategy,
    channel: ResampledChannelFile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SoniqoChunkStrategy {
    Fixed { max_samples: usize },
    SpeechAware,
}

pub(super) struct FixedSoniqoFileChunkIterator {
    reader: hound::WavReader<BufReader<File>>,
    _file: tempfile::NamedTempFile,
    max_samples: usize,
    next_start: usize,
    finished: bool,
}

impl FixedSoniqoFileChunkIterator {
    pub(super) fn new(
        file: tempfile::NamedTempFile,
        max_samples: usize,
    ) -> std::result::Result<Self, String> {
        let reader = hound::WavReader::open(file.path()).map_err(|e| e.to_string())?;
        Ok(Self {
            reader,
            _file: file,
            max_samples,
            next_start: 0,
            finished: false,
        })
    }
}

impl Iterator for FixedSoniqoFileChunkIterator {
    type Item = std::result::Result<AudioChunk, String>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.finished {
            return None;
        }

        let samples = match self
            .reader
            .samples::<f32>()
            .take(self.max_samples)
            .collect::<Result<Vec<_>, _>>()
        {
            Ok(samples) => samples,
            Err(error) => {
                self.finished = true;
                return Some(Err(error.to_string()));
            }
        };
        if samples.is_empty() {
            self.finished = true;
            return None;
        }
        let sample_start = self.next_start;
        let sample_end = sample_start + samples.len();
        self.next_start = sample_end;
        Some(Ok(AudioChunk {
            samples,
            sample_start,
            sample_end,
        }))
    }
}

struct SpeechSoniqoFileChunkIterator {
    chunks: Pin<Box<dyn Stream<Item = Result<AudioChunk, anlg_audio_chunking::Error>>>>,
    async_runtime: tokio::runtime::Handle,
    _file: tempfile::NamedTempFile,
}

impl SpeechSoniqoFileChunkIterator {
    fn new(
        file: tempfile::NamedTempFile,
        async_runtime: &tokio::runtime::Handle,
    ) -> std::result::Result<Self, String> {
        let source = anlg_audio_utils::source_from_path(file.path()).map_err(|e| e.to_string())?;
        let chunks =
            source.speech_chunks(SpeechChunkingConfig::speech(SONIQO_SPEECH_REDEMPTION_TIME));

        Ok(Self {
            chunks: Box::pin(chunks),
            async_runtime: async_runtime.clone(),
            _file: file,
        })
    }
}

impl Iterator for SpeechSoniqoFileChunkIterator {
    type Item = std::result::Result<AudioChunk, String>;

    fn next(&mut self) -> Option<Self::Item> {
        self.async_runtime
            .block_on(self.chunks.as_mut().next())
            .map(|chunk| chunk.map_err(|error| error.to_string()))
    }
}

enum SoniqoFileChunkIterator {
    Fixed(FixedSoniqoFileChunkIterator),
    SpeechAware(SpeechSoniqoFileChunkIterator),
}

impl SoniqoFileChunkIterator {
    fn new(
        file: tempfile::NamedTempFile,
        strategy: SoniqoChunkStrategy,
        async_runtime: &tokio::runtime::Handle,
    ) -> std::result::Result<Self, String> {
        match strategy {
            SoniqoChunkStrategy::Fixed { max_samples } => {
                FixedSoniqoFileChunkIterator::new(file, max_samples).map(Self::Fixed)
            }
            SoniqoChunkStrategy::SpeechAware => {
                SpeechSoniqoFileChunkIterator::new(file, async_runtime).map(Self::SpeechAware)
            }
        }
    }
}

impl Iterator for SoniqoFileChunkIterator {
    type Item = std::result::Result<AudioChunk, String>;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Self::Fixed(chunks) => chunks.next(),
            Self::SpeechAware(chunks) => chunks.next(),
        }
    }
}

pub(super) fn soniqo_language_hint(language: Option<&str>) -> Option<String> {
    let language = language?.trim();
    if language.is_empty() {
        return None;
    }

    language
        .split(['-', '_'])
        .next()
        .filter(|value| !value.is_empty())
        .map(|value| value.to_lowercase())
}

pub(super) fn soniqo_batch_progress(completed_chunks: usize, total_chunks: usize) -> f64 {
    if total_chunks == 0 {
        return SONIQO_PROGRESS_PLANNED;
    }

    let ratio = completed_chunks as f64 / total_chunks as f64;
    (SONIQO_PROGRESS_PLANNED + ratio * SONIQO_PROGRESS_RANGE).min(SONIQO_PROGRESS_MAX)
}

// Combines an explicit exact count with an explicit min/max range into a
// single `SpeakerBounds`, preferring the exact count when both are somehow
// given. `min_speakers`/`max_speakers` alone (no exact) become an open range
// so the diarizer can infer the count within those bounds instead of forcing
// one specific number.
pub(super) fn requested_speaker_bounds(
    num_speakers: Option<u32>,
    min_speakers: Option<u32>,
    max_speakers: Option<u32>,
) -> Option<anlg_transcribe_soniqo::SpeakerBounds> {
    if let Some(exact) = num_speakers {
        return Some(anlg_transcribe_soniqo::SpeakerBounds::exact(exact as usize));
    }

    if min_speakers.is_none() && max_speakers.is_none() {
        return None;
    }

    Some(anlg_transcribe_soniqo::SpeakerBounds::range(
        min_speakers.map(|value| value as usize).unwrap_or(2),
        max_speakers.map(|value| value as usize),
    ))
}

fn shift_bounds_down_by_one(
    bounds: anlg_transcribe_soniqo::SpeakerBounds,
) -> anlg_transcribe_soniqo::SpeakerBounds {
    anlg_transcribe_soniqo::SpeakerBounds {
        exact: bounds.exact.map(|value| value.saturating_sub(1)),
        minimum: bounds.minimum.saturating_sub(1),
        maximum: bounds.maximum.map(|value| value.saturating_sub(1)),
    }
}

pub(super) fn soniqo_diarization_speaker_bounds(
    bounds: Option<anlg_transcribe_soniqo::SpeakerBounds>,
    active_channels: &[bool],
    channel_index: usize,
) -> Option<anlg_transcribe_soniqo::SpeakerBounds> {
    let bounds = bounds?;
    if !active_channels.get(channel_index).copied().unwrap_or(false) {
        return None;
    }

    let resolved = match active_channels.len() {
        1 => bounds,
        2 if channel_index == 0 && !active_channels[1] => bounds,
        2 if channel_index == 1 => shift_bounds_down_by_one(bounds),
        _ => return None,
    };

    (resolved.minimum >= 2).then_some(resolved)
}

pub(super) fn soniqo_requested_diarization_bounds(
    requested: Option<anlg_transcribe_soniqo::SpeakerBounds>,
    active_channels: &[bool],
) -> Option<anlg_transcribe_soniqo::SpeakerBounds> {
    if requested.is_some() {
        return requested;
    }

    // With no system audio, the microphone may contain an in-person
    // conversation rather than only the device owner. A conservative
    // 2-to-4-speaker range gives those recordings separation — including an
    // occasional third or fourth participant — without clustering ordinary
    // calls, whose mic/system channel split is already authoritative.
    let microphone_only = active_channels.first().copied().unwrap_or(false)
        && !active_channels.get(1).copied().unwrap_or(false);
    microphone_only.then(|| anlg_transcribe_soniqo::SpeakerBounds::range(2, Some(4)))
}

pub(super) fn collect_soniqo_channel_transcripts<I>(
    transcripts: I,
) -> std::result::Result<Vec<anlg_transcribe_soniqo::FileTranscript>, String>
where
    I: IntoIterator<Item = std::result::Result<anlg_transcribe_soniqo::FileTranscript, String>>,
{
    let mut output = Vec::new();
    let mut successful_channels = 0usize;
    let mut failed_channels = 0usize;

    for transcript in transcripts {
        match transcript {
            Ok(transcript) => {
                successful_channels += 1;
                output.push(transcript);
            }
            Err(error) => {
                failed_channels += 1;
                tracing::warn!(
                    anarlog.stt.provider.name = "soniqo",
                    error = %error,
                    "soniqo_channel_transcription_failed"
                );
                output.push(anlg_transcribe_soniqo::FileTranscript::new(
                    String::new(),
                    0.05,
                ));
            }
        }
    }

    if successful_channels == 0 && failed_channels > 0 {
        return Err(format!(
            "Soniqo failed to transcribe all {failed_channels} audio channel(s)."
        ));
    }

    Ok(output)
}

fn soniqo_channel_plan(
    model: anlg_transcribe_soniqo::SoniqoModel,
    channel_index: usize,
    channel: ResampledChannelFile,
    is_direct_mic: bool,
) -> SoniqoChannelPlan {
    let duration_seconds = channel.sample_count as f64 / TARGET_SAMPLE_RATE as f64;
    let sample_count = channel.sample_count;
    let chunk_strategy = soniqo_chunk_strategy(model);
    let (strategy_label, chunk_count) = match chunk_strategy {
        SoniqoChunkStrategy::Fixed { max_samples } => {
            ("fixed", Some(sample_count.div_ceil(max_samples)))
        }
        SoniqoChunkStrategy::SpeechAware => ("speech-aware", None),
    };
    tracing::info!(
        anarlog.stt.provider.name = "soniqo",
        anarlog.stt.model = %model,
        channel.index = channel_index,
        channel.duration_seconds = duration_seconds,
        channel.sample_count = sample_count,
        chunk.strategy = strategy_label,
        chunk.count = chunk_count.unwrap_or_default(),
        chunk.count_known = chunk_count.is_some(),
        "soniqo_channel_chunked"
    );

    SoniqoChannelPlan {
        channel_index,
        duration_seconds,
        is_direct_mic,
        chunk_strategy,
        channel,
    }
}

pub(super) fn soniqo_chunk_strategy(
    model: anlg_transcribe_soniqo::SoniqoModel,
) -> SoniqoChunkStrategy {
    if model.batch_model() == anlg_transcribe_soniqo::SoniqoModel::ParakeetBatch {
        SoniqoChunkStrategy::Fixed {
            max_samples: SONIQO_PARAKEET_MAX_CHUNK_SAMPLES,
        }
    } else {
        SoniqoChunkStrategy::SpeechAware
    }
}

fn diarize_soniqo_channel_file(
    model: anlg_transcribe_soniqo::SoniqoModel,
    channel_index: usize,
    channel: &ResampledChannelFile,
    speaker_bounds: anlg_transcribe_soniqo::SpeakerBounds,
    progress: Option<&SoniqoProgressReporter>,
) -> std::result::Result<Vec<anlg_transcribe_soniqo::DiarizationSegment>, String> {
    ensure_local_batch_running(progress)?;
    ensure_soniqo_diarization_within_limit(channel.sample_count)?;
    let mut reader = hound::WavReader::open(channel.file.path()).map_err(|e| e.to_string())?;
    let samples = reader
        .samples::<f32>()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    ensure_local_batch_running(progress)?;
    let segments = diarize_soniqo_channel(model, channel_index, &samples, speaker_bounds);
    ensure_local_batch_running(progress)?;
    Ok(segments)
}

pub(super) fn ensure_soniqo_diarization_within_limit(
    sample_count: usize,
) -> std::result::Result<(), String> {
    if sample_count <= SONIQO_DIARIZATION_MAX_SAMPLES {
        return Ok(());
    }
    Err(
        "Soniqo speaker diarization is limited to recordings up to 10 minutes to prevent excessive memory use. Retry without an exact speaker count or use another transcription provider."
            .to_string(),
    )
}

pub(super) fn soniqo_diarization_plan_within_limit(
    channel_sample_counts: &[usize],
    active_channels: &[bool],
    bounds: Option<anlg_transcribe_soniqo::SpeakerBounds>,
) -> bool {
    channel_sample_counts
        .iter()
        .enumerate()
        .all(|(channel_index, sample_count)| {
            match soniqo_diarization_speaker_bounds(bounds, active_channels, channel_index) {
                Some(_) => *sample_count <= SONIQO_DIARIZATION_MAX_SAMPLES,
                None => true,
            }
        })
}

fn diarize_soniqo_channel(
    model: anlg_transcribe_soniqo::SoniqoModel,
    channel_index: usize,
    samples: &[f32],
    speaker_bounds: anlg_transcribe_soniqo::SpeakerBounds,
) -> Vec<anlg_transcribe_soniqo::DiarizationSegment> {
    let started_at = Instant::now();
    match anlg_transcribe_soniqo::diarize_samples(model, samples, speaker_bounds) {
        Ok(segments) => {
            let raw_count = segments.len();
            let segments = anlg_transcribe_soniqo::smooth_diarization_segments(
                segments,
                SONIQO_DIARIZATION_MIN_SEGMENT_SECONDS,
            );
            tracing::info!(
                anarlog.stt.provider.name = "soniqo",
                anarlog.stt.model = %model,
                channel.index = channel_index,
                speaker.minimum = speaker_bounds.minimum,
                speaker.maximum = speaker_bounds.maximum.unwrap_or_default(),
                speaker.exact = speaker_bounds.exact.unwrap_or_default(),
                segment.count = segments.len(),
                segment.count_before_smoothing = raw_count,
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "soniqo_channel_diarization_completed"
            );
            segments
        }
        Err(error) => {
            tracing::warn!(
                anarlog.stt.provider.name = "soniqo",
                anarlog.stt.model = %model,
                channel.index = channel_index,
                speaker.minimum = speaker_bounds.minimum,
                speaker.maximum = speaker_bounds.maximum.unwrap_or_default(),
                speaker.exact = speaker_bounds.exact.unwrap_or_default(),
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                error = %error,
                "soniqo_channel_diarization_failed"
            );
            Vec::new()
        }
    }
}

fn transcribe_soniqo_channel_chunks(
    model: anlg_transcribe_soniqo::SoniqoModel,
    plan: SoniqoChannelPlan,
    language: Option<&str>,
    progress: Option<&SoniqoProgressReporter>,
    async_runtime: &tokio::runtime::Handle,
) -> std::result::Result<anlg_transcribe_soniqo::FileTranscript, String> {
    transcribe_soniqo_channel_chunks_with(
        model,
        plan,
        language,
        progress,
        async_runtime,
        transcribe_soniqo_samples,
    )
}

fn transcribe_soniqo_channel_chunks_with<F>(
    model: anlg_transcribe_soniqo::SoniqoModel,
    plan: SoniqoChannelPlan,
    language: Option<&str>,
    progress: Option<&SoniqoProgressReporter>,
    async_runtime: &tokio::runtime::Handle,
    mut transcribe: F,
) -> std::result::Result<anlg_transcribe_soniqo::FileTranscript, String>
where
    F: FnMut(
        anlg_transcribe_soniqo::SoniqoModel,
        &[f32],
        Option<&str>,
    ) -> std::result::Result<anlg_transcribe_soniqo::FileTranscript, String>,
{
    let mut transcript_chunks = Vec::new();
    let mut successful_chunks = 0usize;
    let mut failed_chunks = 0usize;
    let SoniqoChannelPlan {
        channel_index,
        duration_seconds,
        is_direct_mic,
        chunk_strategy,
        channel,
    } = plan;
    let mut chunks = SoniqoFileChunkIterator::new(channel.file, chunk_strategy, async_runtime)?;
    let mut next_chunk_index = 0usize;

    loop {
        ensure_local_batch_running(progress)?;
        let Some(chunk) = chunks.next() else {
            break;
        };
        ensure_local_batch_running(progress)?;
        let chunk = chunk?;
        let chunk_index = next_chunk_index;
        next_chunk_index += 1;
        let chunk_duration_ms =
            (chunk.sample_end - chunk.sample_start) * 1000 / TARGET_SAMPLE_RATE as usize;
        let chunk_rms = audio_rms(&chunk.samples);
        if is_direct_mic && chunk_rms < SONIQO_DIRECT_MIC_MIN_RMS {
            tracing::info!(
                anarlog.stt.provider.name = "soniqo",
                anarlog.stt.model = %model,
                channel.index = channel_index,
                chunk.index = chunk_index,
                audio.rms = chunk_rms,
                audio.minimum_rms = SONIQO_DIRECT_MIC_MIN_RMS,
                "soniqo_direct_mic_chunk_skipped"
            );
            continue;
        }

        let chunk_started_at = Instant::now();
        tracing::info!(
            anarlog.stt.provider.name = "soniqo",
            anarlog.stt.model = %model,
            channel.index = channel_index,
            chunk.index = chunk_index,
            chunk.sample_start = chunk.sample_start,
            chunk.sample_end = chunk.sample_end,
            chunk.sample_count = chunk.samples.len(),
            chunk.duration_ms = chunk_duration_ms,
            "soniqo_chunk_native_inference_start"
        );

        let transcribed = transcribe(model, &chunk.samples, language);
        ensure_local_batch_running(progress)?;
        let text = match transcribed {
            Ok(transcript) => {
                successful_chunks += 1;
                transcript.text
            }
            Err(e) => {
                failed_chunks += 1;
                tracing::warn!(
                    anarlog.stt.provider.name = "soniqo",
                    anarlog.stt.model = %model,
                    channel.index = channel_index,
                    chunk.index = chunk_index,
                    elapsed_ms = chunk_started_at.elapsed().as_millis() as u64,
                    error = %e,
                    "soniqo_chunk_native_inference_failed"
                );
                continue;
            }
        };

        tracing::info!(
            anarlog.stt.provider.name = "soniqo",
            anarlog.stt.model = %model,
            channel.index = channel_index,
            chunk.index = chunk_index,
            elapsed_ms = chunk_started_at.elapsed().as_millis() as u64,
            transcript.text_chars = text.chars().count(),
            "soniqo_chunk_native_inference_completed"
        );

        let text = text.trim();
        if !text.is_empty() {
            transcript_chunks.push(anlg_transcribe_soniqo::FileTranscriptChunk {
                text: text.to_string(),
                start_seconds: chunk.sample_start as f64 / TARGET_SAMPLE_RATE as f64,
                duration_seconds: (chunk.sample_end - chunk.sample_start) as f64
                    / TARGET_SAMPLE_RATE as f64,
            });
        }
    }

    if successful_chunks == 0 && failed_chunks > 0 {
        return Err(format!(
            "Soniqo failed to transcribe all {failed_chunks} chunk(s) for channel {channel_index}."
        ));
    }

    if failed_chunks > 0 {
        tracing::warn!(
            anarlog.stt.provider.name = "soniqo",
            anarlog.stt.model = %model,
            channel.index = channel_index,
            chunk.success_count = successful_chunks,
            chunk.failed_count = failed_chunks,
            "soniqo_channel_completed_with_chunk_failures"
        );
    }

    if transcript_chunks.is_empty() {
        return Ok(anlg_transcribe_soniqo::FileTranscript::new(
            String::new(),
            duration_seconds,
        ));
    }

    Ok(anlg_transcribe_soniqo::FileTranscript::from_chunks(
        transcript_chunks,
        duration_seconds,
    ))
}

pub(super) fn audio_rms(samples: &[f32]) -> f64 {
    if samples.is_empty() {
        return 0.0;
    }

    let sum_of_squares = samples
        .iter()
        .map(|sample| f64::from(*sample).powi(2))
        .sum::<f64>();
    (sum_of_squares / samples.len() as f64).sqrt()
}

fn transcribe_soniqo_samples(
    model: anlg_transcribe_soniqo::SoniqoModel,
    samples: &[f32],
    language: Option<&str>,
) -> std::result::Result<anlg_transcribe_soniqo::FileTranscript, String> {
    let file = tempfile::Builder::new()
        .prefix("soniqo_channel_")
        .suffix(".wav")
        .tempfile()
        .map_err(|e| e.to_string())?;
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    {
        let mut writer = hound::WavWriter::create(file.path(), spec).map_err(|e| e.to_string())?;
        for sample in samples {
            writer.write_sample(*sample).map_err(|e| e.to_string())?;
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }

    anlg_transcribe_soniqo::transcribe_file(model, file.path(), language).map_err(|e| e.to_string())
}

#[cfg(test)]
mod cancellation_tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;

    struct TestRuntime {
        cancelled: Arc<AtomicBool>,
    }

    impl BatchRuntime for TestRuntime {
        fn emit(&self, _event: BatchEvent) {}

        fn is_cancelled(&self) -> bool {
            self.cancelled.load(Ordering::Acquire)
        }
    }

    #[tokio::test]
    async fn cancellation_after_native_inference_skips_remaining_chunks() {
        let file = tempfile::Builder::new().suffix(".wav").tempfile().unwrap();
        let mut writer = hound::WavWriter::create(
            file.path(),
            hound::WavSpec {
                channels: 1,
                sample_rate: TARGET_SAMPLE_RATE,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .unwrap();
        for sample in [0.1f32, 0.2, 0.3] {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();

        let cancelled = Arc::new(AtomicBool::new(false));
        let progress = SoniqoProgressReporter {
            runtime: Arc::new(TestRuntime {
                cancelled: cancelled.clone(),
            }),
            session_id: "cancel-test".to_string(),
        };
        let plan = SoniqoChannelPlan {
            channel_index: 0,
            duration_seconds: 3.0 / TARGET_SAMPLE_RATE as f64,
            is_direct_mic: false,
            chunk_strategy: SoniqoChunkStrategy::Fixed { max_samples: 1 },
            channel: ResampledChannelFile {
                file,
                sample_count: 3,
                rms: 0.1,
            },
        };
        let mut calls = 0usize;

        let error = transcribe_soniqo_channel_chunks_with(
            anlg_transcribe_soniqo::SoniqoModel::ParakeetBatch,
            plan,
            None,
            Some(&progress),
            &tokio::runtime::Handle::current(),
            |_, _, _| {
                calls += 1;
                cancelled.store(true, Ordering::Release);
                Ok(anlg_transcribe_soniqo::FileTranscript::new(
                    "first".to_string(),
                    1.0,
                ))
            },
        )
        .expect_err("cancellation should stop before the next chunk");

        assert_eq!(calls, 1);
        assert_eq!(error, LOCAL_BATCH_CANCELLED);
    }
}
