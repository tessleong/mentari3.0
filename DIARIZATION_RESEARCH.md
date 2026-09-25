# Diarization Research

Follows `DIARIZATION_AUDIT.md`. Covers the 7 repositories originally named for investigation, plus what was actually implemented as a result. All of this research is about a third-party dependency this app **already has** (`github.com/soniqo/speech-swift`, pinned at `v0.0.22` in `crates/transcribe-soniqo/swift-lib/Package.swift`) — verified by fetching its source and docs directly at that exact pinned tag, not from a newer branch.

## Headline finding

Five of the seven repositories on the original list are **already integrated, working, and documented inside `speech-swift`**, the Apache-2.0-licensed toolkit this app already depends on for its local ASR. None of them needed independent research, licensing review, or porting — the work was tracing what the dependency already offers and wiring more of it through this app's own ~1400-line Swift bridge (`crates/transcribe-soniqo/swift-lib/src/lib.swift`), which today only ever calls one of the three diarization engines it has access to.

## Comparison table

| Model | In `speech-swift`? | Approach | Overlap handling | Streaming | Speaker-count | HW | License | Wired into this app? |
|---|---|---|---|---|---|---|---|---|
| **Pyannote** (classic 2-stage) | Yes | Segmentation → WeSpeaker embedding → clustering | Powerset decoding models overlap | No | Inferred or exact | MLX/CoreML | Model-dependent (pyannote weights) | No |
| **Community-1** (pyannote-derived) | Yes, **currently used** | PyanNet seg → masked WeSpeaker embed → AHC → PLDA → VBx | Powerset decoding models overlap | No | `Community1SpeakerBounds`: exact, or **min/max range with inference** | CoreML (Neural Engine) | `aufklarer/Pyannote-Community-1-CoreML`, CC BY 4.0 | **Partially** — only ever called with a forced exact count, never the range mode |
| **NeMo Sortformer** | Yes | End-to-end neural, per-frame speaker activity, up to 4 speakers | Native (multi-label per frame) | **Yes**, with stable Arrival-Order speaker-cache IDs across a session | Fixed at up to 4, no exact count needed | CoreML (Neural Engine) | `nvidia/diar_streaming_sortformer_4spk-v2`, converted | No |
| **WeSpeaker** (embedding model) | Yes — it's the embedding stage inside Community-1 | ResNet34-LM, 6.6M params, 256-dim | N/A (embedding, not diarization) | N/A | N/A | MLX or CoreML | `aufklarer/WeSpeaker-ResNet34-LM-{MLX,CoreML}` | Yes, indirectly (used by Community-1) |
| **MOSS-Transcribe-Diarize** | Yes | End-to-end joint transcript + timestamp + speaker generation (0.9B, Whisper-frontend + Qwen3 decoder) | Native to the joint generation | No (offline/autoregressive only) | Anonymous per-recording labels (`[S01]`, `[S02]`, …) | MLX or CoreML (Neural Engine) | Upstream MOSS license (not independently re-verified) | No |
| **openSMILE** | Not present | Acoustic feature extraction (pitch, prosody, jitter/shimmer) | N/A | N/A | N/A | CPU | Apache 2.0 (openSMILE upstream) | No — and per the original request, add only if testing shows it materially helps; no such testing has been done |
| **inaSpeechSegmenter** | Not present | Speech/music/gender segmentation | N/A | N/A | N/A | CPU | MIT (upstream) | No — gender must stay weak/optional evidence only per the original request, never primary identity |
| **SpeechBrain** | Not present | General speech-processing toolkit (PyTorch) | N/A | N/A | N/A | GPU/CPU (PyTorch) | Apache 2.0 (upstream) | No — this app has **no Python/PyTorch runtime anywhere**; adopting SpeechBrain would mean introducing an entirely new runtime class, not just a library |

## Why this changes the plan

The original plan (Pipeline A–D, benchmark 4 architectures from scratch) assumed the 7 candidates were unknowns requiring independent evaluation. In practice:

- **Pipeline B** (current ASR + pyannote) and **Pipeline D** (primary diarizer + persistent embeddings) are **already how this app is built** — Soniqo's local ASR plus a separate WeSpeaker-based persistent-identity layer (`crates/embedding` + `crates/voiceprint`, audited separately in `DIARIZATION_AUDIT.md`).
- **Pipeline A** (MOSS end-to-end) and **Pipeline C** (NeMo/Sortformer) are both sitting in the same dependency, unused by this app but real, documented, and already CoreML-converted for Apple Silicon.
- A genuine from-scratch benchmark harness (DER, speaker confusion, overlap, short-utterance accuracy) also already exists upstream (`speech-swift`'s `diarization-bench` Swift executable, RTTM-based, with published NVIDIA Sortformer baselines in its own `docs/benchmarks/diarization.md`).

Given that, the highest-leverage next step wasn't "build new infrastructure" — it was fixing the narrowest, most concrete gap the audit found: Community-1 already supports an inferred min/max speaker range, and this app's bridge was never asking for one.

## What was implemented

**Problem:** for an ad-hoc, in-person recording with no participants attached (no explicit speaker count known), the pipeline defaulted to forcing `exact_speakers = 2`. A genuine third person (family member, nurse, interpreter) — the request's explicitly called-out "occasionally a third person" case — would get folded into one of the two clusters instead of recognized as their own speaker.

**Fix:** threaded a proper `SpeakerBounds { exact, minimum, maximum }` concept end-to-end, mirroring `speech-swift`'s own `Community1SpeakerBounds(exact:minimum:maximum:)` API exactly, so JSON round-trips across the Rust↔Swift FFI boundary without translation:

- `crates/transcribe-soniqo/src/types.rs` — new `SpeakerBounds` type (`exact()`/`range()` constructors).
- `crates/transcribe-soniqo/src/lib.rs`, `src/platform/{macos,unsupported}.rs` — `diarize_samples` now takes `SpeakerBounds` instead of a bare `exact_speakers: usize`; the "must exactly match the request" validation only applies when an exact count was actually requested.
- `crates/transcribe-soniqo/swift-lib/src/lib.swift` — `diarizeAudioJSON`/`_soniqo_diarize_audio` now take a JSON-encoded bounds payload, decoded into `Community1SpeakerBounds` and passed straight through to the pipeline.
- `crates/listener2-core/src/batch/simple/local.rs` — the request already carried `min_speakers`/`max_speakers` all the way from the TS layer (`useRunBatch.ts`) into `ListenParams`, but the Soniqo-specific local batch path only ever read `num_speakers`, silently ignoring the other two. Now reads all three; when nothing is known and the capture is mic-only (the in-person case), it defaults to a **2-to-4 speaker range** instead of a hardcoded exact 2.

No TypeScript changes were needed — `min_speakers`/`max_speakers` were already exposed end-to-end from the UI/API layer; they simply never reached the Soniqo-specific code path before.

**Verified:** `cargo test -p transcribe-soniqo --lib` (32/32 passed) and `cargo test -p listener2-core --lib` (64/65 passed — the one failure, `apple_speech_language_support_reflects_installed_framework`, is a pre-existing, unrelated, environment-specific Apple Speech Korean-language-pack check untouched by this change). New tests added for the range-default behavior, the exact-vs-range precedence rule, and the per-channel bounds-shifting math for the two-channel (mic + system audio) case.

## Benchmark: real inference, synthetic test audio

Real or de-identified clinical audio wasn't available, so this uses **fully-scripted, synthesized** conversations instead: macOS `say`, with a different system voice per speaker, rendered utterance-by-utterance and mixed onto one 16kHz mono timeline with exactly-known ground truth (ground truth comes from the synthesis script itself, not manual annotation). Nothing here is real patient data, or any recording of a real person.

- Generator: `crates/transcribe-soniqo/tests/fixtures/diarization/synthesize.py`.
- Fixtures: 4 scenarios as WAV + ground-truth JSON, committed under `crates/transcribe-soniqo/tests/fixtures/diarization/`.
- Harness: `crates/transcribe-soniqo/tests/diarization_bench.rs` — calls the exact `diarize_samples` function this fix modified, directly, with real on-device Community-1 inference (the actual downloaded 611MB Parakeet-batch + Community-1-CoreML models on this machine). Scores frame-level (50ms) speaker accuracy against ground truth, using a brute-force optimal-permutation mapping between predicted speaker indices and ground-truth labels (tractable at ≤4 speakers; a real DER scorer would additionally score miss/false-alarm and true overlapping-speech frames, which this simplified version does not — it only scores frames where the ground truth has exactly one active speaker).
- Reproduce: `cargo test -p transcribe-soniqo --test diarization_bench -- --ignored --nocapture` (real inference, ~35s; requires the model already downloaded locally, which it is on this machine).

### Results

| Scenario | Old: forced `exact(2)` | New: `range(2,4)` | Reference: `exact(known count)` |
|---|---:|---:|---:|
| `clean_two_speaker` (2 speakers, clean turns) | 7.7% err | 7.7% err | — |
| `short_utterances_and_interruption` (2 speakers, "yeah"/"okay" backchannels + one interruption) | 2.1% err | 2.1% err | — |
| `similar_voices_two_speaker` (2 same-gender US voices) | 7.7% err | 7.7% err | — |
| `three_speaker` (clinician + patient + family member) | 29.6% err, **only 2 speakers found** | 29.6% err, **only 2 speakers found** | **16.1% err, 3 speakers found** |

### What this actually shows

- **No regression.** For every 2-speaker scenario, the new default (`range(2,4)`) produces byte-identical results to the old hardcoded `exact(2)` behavior. The fix doesn't cost anything in the common case.
- **The fix alone did not auto-discover the third speaker.** With no hint beyond `range(2,4)`, the pipeline's own inference still settled on 2 clusters for the 3-speaker recording — same 29.6% error as before. A follow-up experiment (`range(3,4)` — raising just the *minimum*, without giving the *exact* count) reproduced the same good 16.1%-error, 3-speakers-found result as supplying the true exact count. So **the model does respect a raised minimum as a genuine floor**; it just won't reach for a third cluster on its own when 2 is a "good enough" fit and no signal says otherwise.
- **Practical implication:** this fix removes a hard ceiling (2-speaker recordings are unaffected; the model *can* return 3–4 when it's confident enough on its own) and is a large, real improvement (29.6%→16.1% error) *whenever an actual speaker count becomes available* — e.g. once participants are attached to the session. It is **not** a guaranteed fix for a silent, low-airtime third speaker with zero external signal; that remains a genuine model-inference limitation, not a bug in this change. Teaching the app to *suspect* a third speaker without being told (e.g. cross-referencing the persistent voiceprint registry for a third recognized voice) is a real, separate follow-up idea, not implemented here.
- **Caveat on synthetic audio:** TTS voices are cleaner and acoustically more stable than real human speech (no real background noise, consistent prosody, no genuine vocal-tract similarity between "similar" voices beyond both being coded as the same OS-level voice family). Real clinical recordings — especially the interruption/overlap and similar-pitch cases — should be expected to score worse than these numbers, not better. These results demonstrate the *mechanism* works correctly and is non-regressive; they are not a substitute for evaluating against real or realistic clinical audio before relying on the numbers themselves.
