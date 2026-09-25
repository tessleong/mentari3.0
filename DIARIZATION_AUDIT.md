# Diarization Audit

Scope: step 1–2 of the diarization improvement plan — audit the *existing* audio/transcription/speaker-attribution architecture before any new work. No code changed. No external repos (MOSS, pyannote-audio upstream, NeMo, WeSpeaker, openSMILE, inaSpeechSegmenter, SpeechBrain) were installed or benchmarked in this pass.

## Headline finding

This is **not** a greenfield diarization problem. The app already has three layered, Rust-native, on-device systems working together:

1. **Soniqo** (the primary local ASR engine, `crates/transcribe-soniqo`) does its own embedding-based acoustic diarization and emits `speaker_index` per segment.
2. **A local ONNX WeSpeaker embedding extractor** (`crates/embedding`) — a direct, already-working answer to research item #4 (WeSpeaker) in the request.
3. **A voiceprint identity-matching layer** (`crates/voiceprint` + `plugins/transcription/src/voiceprint.rs`) that takes those embeddings and conservatively maps them to *known people* across sessions, with encrypted storage.

There is also unused, dead-end code for a fourth path (local ONNX pyannote), and a cloud pyannote integration that already exists as an interchangeable provider — meaning the "swappable diarization provider" architecture the request asks for is already precedented in this codebase's design, just not formalized as a named `DiarizationProvider` trait.

## 1. Audio capture path

`ChannelProfile` (`apps/desktop/src/stt/live-segment.ts`) has three values:

- `DirectMic = 0` — the user's own mic (self, in a remote-call context)
- `RemoteParty = 1` — system/loopback audio (the other side of a call)
- `MixedCapture = 2` — **the in-person, single-mic, multiple-speakers case** — this is where an actual clinical-encounter recording lands

`crates/voiceprint/src/matching.rs` test fixtures use domain strings `"direct_mic"` / `"system_audio"` (lines ~296–313), confirming the two capture contexts are kept as separate embedding "domains" that are never cross-matched — a voice captured on the mic channel is never confused with a voice captured on system audio. This part of the pipeline was not traced further this pass (not needed to answer the audit's core questions).

## 2. ASR engines

- **`transcribe-soniqo`** (`crates/transcribe-soniqo/src/platform/macos.rs`) is the active local/on-device engine. Its `types.rs` defines `DiarizationSegment { start_seconds, end_seconds, speaker_index }` and a `smooth_diarization_segments` post-pass (verified directly, `types.rs:66–124`) that folds any segment shorter than a minimum duration into its neighbor when both neighbors agree on a different speaker — explicitly to kill the "flickering Speaker 1 / Speaker 2 / Speaker 1" pattern the request describes under "short utterances." The code comment states plainly: *"Embedding-based diarization is at its least reliable on short segments."* This confirms Soniqo does real embedding-based diarization today, not a placeholder.
- **`transcribe-speechanalyzer`** wraps Apple's on-device SpeechAnalyzer (macOS 15+). Whether it emits its own diarization was not confirmed this pass.
- **`owhisper-client`** is an adapter layer over ~15 cloud ASR providers (Soniox, Deepgram, AssemblyAI, Speechmatics, Gladia, Google Cloud, Azure Speech, ElevenLabs, and others), each in its own `adapter/<name>/` module — plus **`adapter/pyannote/batch.rs`**, confirming pyannote is *already* wired in as one interchangeable provider under this exact adapter pattern.
- Word-level timestamps: not directly re-verified this pass, but `TranscriptRow`/`speaker_hints` plumbing referenced in `enhance-transform.ts` implies per-word start/end already flows through the pipeline.
- Network exposure: Soniqo and SpeechAnalyzer are on-device; any of the ~15 `owhisper-client` cloud adapters are network calls only when the user explicitly selects that provider.

## 3. Existing diarization / speaker-attribution mechanism

More exists than "nothing" or "manual only":

- **Primary diarizer**: Soniqo's built-in embedding diarization + smoothing (above).
- **Identity layer** (a separate concern from raw diarization — matching acoustic embeddings to *specific known people* across sessions): `crates/embedding` is a local ONNX WeSpeaker extractor. Verified directly (`crates/embedding/src/onnx/mod.rs:1–26`): it explicitly ports **pyannote.audio's `ONNXWeSpeakerPretrainedSpeakerEmbedding`** (1.15× waveform scaling, 0.5 mask threshold — both values and the comment citing pyannote are in the source). Runs via `ort` (ONNX Runtime) with CoreML acceleration. Model weights are bundled in-binary (`crates/embedding/src/onnx/embedding.onnx`). Zero network calls.
- **`crates/voiceprint`**: pure-math layer. `select_speaker_spans` picks clean, non-overlapping, single-speaker spans per `(channel, speaker_index)` from transcript words; `matching.rs` does conservative mutual-best-match identity assignment via cosine similarity with a score floor (0.62) and a margin requirement (0.08) — it refuses to guess when a match is ambiguous. Heavily unit-tested (7 tests in `matching.rs`, 6 in `lib.rs`).
- **`plugins/transcription/src/voiceprint.rs`** (1377 lines) is the live glue: extracts candidate voiceprints from a transcript, calls the embedding extractor, encrypts and stores embeddings via a secret store, matches against known exemplars scoped by capture domain, and writes results back as `speaker_hints` via `write_speaker_assignment_hints`.
- **Dead/orphaned**: `crates/pyannote-local` (ONNX segmentation + embedding, using `knf-rs`/`simsimd`) is only depended on by `crates/transcribe-whisper-local`, which nothing else in the workspace depends on. Reads as a superseded earlier attempt at a fully-local pyannote port.
- **Cloud alternative**: `crates/pyannote-cloud` + `crates/api-pyannote` (an openapi-generated HTTP client + axum service) is a separate, hosted pyannote path, distinct from the local ONNX one.

## 4. Where speaker gets attached to words

`speaker_hints` (JSON) is the persistence mechanism for both automatic voiceprint matches and manual corrections from the transcript UI (`speaker-assign.tsx`), reconciled against `speaker_index_from_transcript` (`voiceprint.rs:930`). The exact granularity of that reconciliation — whether it can split a single ASR-emitted sentence across two speakers mid-sentence, which the request calls out as "extremely important" — was **not confirmed this pass** and is the most important open question before recommending an architecture change.

## 5. Existing tests

- `crates/voiceprint/src/matching.rs` — 7 tests: cosine similarity, unique-match arbitration, ambiguous-margin rejection.
- `crates/voiceprint/src/lib.rs` — 6 tests: span selection, overlap subtraction, long-span truncation.
- `crates/transcribe-soniqo/src/types.rs` (`diarization_smoothing_tests`) — blip-removal smoothing, verified directly.
- **No DER (diarization error rate) or benchmark harness exists anywhere in the repo.**

## 6. Runtime/dependency reality check

**There is no Python or PyTorch anywhere in this repository.** All local ML inference is Rust-native via `crates/onnx` (a thin wrapper around `ort` v2.0.0-rc.10 + `ndarray`), used today by `crates/embedding` and `crates/vad` (Silero VAD). This is the single most important constraint for the rest of the plan:

- **pyannote-audio**: already has local ONNX precedent in this exact repo (`crates/pyannote-local`, currently unused/dead) and a working cloud integration. Lowest-friction path of the five external libraries named in the request.
- **NVIDIA NeMo**: worth noting — Soniqo's batch/diarization ASR model (`ParakeetBatch`, HF repo `aufklarer/Parakeet-TDT-v3-CoreML-INT8-30s`, confirmed present locally at `~/Library/Caches/qwen3-speech/models/aufklarer/Parakeet-TDT-v3-CoreML-INT8-30s`, 611MB) **is itself a NeMo Parakeet-TDT model**, already converted to CoreML and running on-device — so NeMo's *ASR* has real local precedent here via a third-party CoreML conversion, even though NeMo's *diarization* component (Sortformer) does not and is PyTorch-only.
- **WeSpeaker (upstream Python repo)**: moot — its most relevant model is *already running locally* via the pyannote-ported ONNX path in `crates/embedding`, so there is no gap to fill here rather than re-porting the same idea a second way.
- **SpeechBrain**: PyTorch-only, no existing bridge.
- **openSMILE**: C++ (not Python), so technically portable, but the request itself says not to add it unless testing shows it materially helps — and there's no core diarization gap it would address here.
- **MOSS-Transcribe-Diarize**: end-to-end model, no existing precedent of any kind in this repo. Would need to be evaluated from a completely cold start (find weights, license, format, inference cost) before it's even known whether it's runnable in this environment at all.

## 7. Correction: the ad-hoc in-person case already defaults to 2 speakers

An earlier pass of this audit claimed diarization never runs for a walk-in encounter with no participants attached, based on `getSessionSpeakerCount` (`apps/desktop/src/stt/useRunBatch.ts:680-693`) returning `undefined` in that case. That claim was **incomplete** — it stopped tracing one layer too early. The actual local-batch pipeline (`crates/listener2-core/src/batch/simple/local.rs`) has its own fallback:

- `soniqo_requested_diarization_speakers` (`local.rs:754-769`): when no explicit speaker count is known (`requested: None`) **and** the capture is microphone-only (one active channel, no active system-audio channel — exactly the in-person scenario), it defaults to `Some(2)`. Directly tested: `soniqo_diarization_defaults_mic_only_conversations_to_two_speakers` (`batch/simple/tests.rs:670-684`) asserts `soniqo_requested_diarization_speakers(None, &[true, false]) == Some(2)`.
- So for a genuine single-mic in-person recording, diarization **does** run today with a sensible 2-speaker default, with no participants required.

**What remains a real, narrower gap**: that default is hardcoded to exactly 2, never 3+. For the request's explicitly-called-out "occasionally a third person" case (family member, nurse, interpreter) in an unscheduled encounter with no participants attached, the third voice would still get forced into one of two clusters rather than recognized as its own speaker. That's a legitimate, smaller thing to potentially address later (e.g. via the persistent voiceprint layer noticing an unrecognized profile), not "diarization doesn't run."

## What this means for next steps

The request's own framing ("Do not assume the current system is worse," "Reuse existing infrastructure where sensible," "Do not make irreversible architecture changes without understanding the existing system") points toward a different starting move than the one implied by "investigate 7 repos and benchmark 4 pipelines from scratch": the honest gap here is not *missing diarization*, it's **no benchmark harness to know whether the existing Soniqo + voiceprint stack is actually good enough** for the stated clinical failure modes (speaker swaps, short back-channel utterances, overlap, doctor/patient stability over 10–60 minutes). Building that harness against real or synthetic two-speaker clinical-style audio, and running the *existing* pipeline through it first, would produce a real baseline number before any external model is worth downloading — and would directly reuse work already sitting in this repo instead of duplicating it.
