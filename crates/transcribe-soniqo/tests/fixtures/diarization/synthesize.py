#!/usr/bin/env python3
"""Synthesize small, fully-scripted multi-speaker test conversations with
known ground truth, for benchmarking the local Soniqo diarization pipeline.

Uses macOS `say` (distinct system voices per speaker) + pure-stdlib audio
handling (aifc/wave) + numpy for resampling/mixing, since sox/ffmpeg/soundfile
are not available in this environment.
"""

import json
import os
import subprocess
import sys
import wave

import numpy as np

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_SR = 16_000
GAP_SECONDS = 0.35  # natural pause between normal turns


def synth_clip(voice: str, text: str, index: int) -> np.ndarray:
    wav_path = os.path.join(OUT_DIR, f"_clip_{index:03d}.wav")
    subprocess.run(
        [
            "say",
            "-v",
            voice,
            "-o",
            wav_path,
            "--file-format=WAVE",
            f"--data-format=LEI16@{TARGET_SR}",
            text,
        ],
        check=True,
    )
    with wave.open(wav_path, "rb") as f:
        assert f.getframerate() == TARGET_SR
        assert f.getsampwidth() == 2
        n_channels = f.getnchannels()
        raw = f.readframes(f.getnframes())
    os.remove(wav_path)

    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)

    return samples


def build_scenario(name: str, voices: dict, script: list):
    """script: list of (speaker, text, overlap_seconds_with_previous | None)."""
    timeline = np.zeros(0, dtype=np.float32)
    ground_truth = []
    cursor = 0.0

    for index, (speaker, text, overlap) in enumerate(script):
        clip = synth_clip(voices[speaker], text, index)
        clip_duration = len(clip) / TARGET_SR

        if overlap is not None and index > 0:
            start = max(0.0, cursor - overlap)
        else:
            start = cursor

        start_sample = int(round(start * TARGET_SR))
        end_sample = start_sample + len(clip)
        if end_sample > len(timeline):
            timeline = np.pad(timeline, (0, end_sample - len(timeline)))
        timeline[start_sample:end_sample] += clip

        ground_truth.append(
            {
                "speaker": speaker,
                "start": round(start, 3),
                "end": round(start + clip_duration, 3),
                "text": text,
            }
        )
        cursor = max(cursor + clip_duration, start + clip_duration) + GAP_SECONDS

    peak = np.abs(timeline).max() if len(timeline) else 1.0
    if peak > 0.98:
        timeline = timeline * (0.98 / peak)

    wav_path = os.path.join(OUT_DIR, f"{name}.wav")
    pcm16 = np.clip(timeline * 32767.0, -32768, 32767).astype("<i2")
    with wave.open(wav_path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(TARGET_SR)
        f.writeframes(pcm16.tobytes())

    speakers = sorted({segment["speaker"] for segment in ground_truth})
    meta = {
        "name": name,
        "sampleRate": TARGET_SR,
        "durationSeconds": round(len(timeline) / TARGET_SR, 3),
        "speakerCount": len(speakers),
        "speakers": speakers,
        "segments": ground_truth,
    }
    with open(os.path.join(OUT_DIR, f"{name}.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(
        f"{name}: {meta['durationSeconds']}s, {len(ground_truth)} utterances, "
        f"{len(speakers)} speakers -> {wav_path}"
    )


VOICES_2SPK = {"clinician": "Samantha", "patient": "Fred"}
VOICES_3SPK = {"clinician": "Samantha", "patient": "Fred", "family": "Daniel"}
VOICES_SIMILAR = {"clinician": "Samantha", "patient": "Kathy"}


def main():
    build_scenario(
        "clean_two_speaker",
        VOICES_2SPK,
        [
            ("clinician", "So what brings you in today?", None),
            ("patient", "I've been getting short of breath at night.", None),
            ("clinician", "How long has that been going on?", None),
            ("patient", "About three weeks now, maybe a little longer.", None),
            (
                "clinician",
                "Does it happen when you're lying flat, or also sitting up?",
                None,
            ),
            (
                "patient",
                "Mostly when I'm lying flat, especially after I've eaten.",
                None,
            ),
            (
                "clinician",
                "Have you noticed any swelling in your legs or ankles?",
                None,
            ),
            ("patient", "Yeah, actually, my ankles have been a bit puffy.", None),
        ],
    )

    build_scenario(
        "short_utterances_and_interruption",
        VOICES_2SPK,
        [
            (
                "clinician",
                "Let's go over your medications. Are you still taking the lisinopril?",
                None,
            ),
            ("patient", "Yeah.", None),
            ("clinician", "Once a day, in the morning?", None),
            ("patient", "Right.", None),
            (
                "clinician",
                "Any side effects, dizziness, cough, anything like that?",
                None,
            ),
            (
                "patient",
                "No, not really. Well, actually, sometimes I get a little",
                None,
            ),
            # Deliberate interruption: clinician cuts in before patient finishes.
            ("clinician", "A cough, or more like a tickle in your throat?", 0.4),
            ("patient", "Exactly, a tickle. Yeah, that's it.", 0.2),
            (
                "clinician",
                "Okay, that's a known side effect. We can switch you to something else.",
                None,
            ),
        ],
    )

    build_scenario(
        "three_speaker",
        VOICES_3SPK,
        [
            (
                "clinician",
                "Good afternoon. And you must be here with your daughter today?",
                None,
            ),
            (
                "patient",
                "Yes, this is my daughter, she's been helping me keep track of things.",
                None,
            ),
            (
                "family",
                "Hi, yeah, I just wanted to sit in since she mentioned the dizziness again.",
                None,
            ),
            (
                "clinician",
                "Of course, glad you're here. When did the dizziness start?",
                None,
            ),
            ("patient", "Maybe two weeks ago, on and off.", None),
            ("family", "It's been worse in the mornings, from what I've seen.", None),
            (
                "clinician",
                "Does it feel like the room is spinning, or more like lightheadedness?",
                None,
            ),
            ("patient", "More lightheaded, like I might fall over.", None),
            ("family", "She did almost fall in the kitchen last Tuesday.", None),
            (
                "clinician",
                "Okay, that's important. Let's check your blood pressure sitting and standing.",
                None,
            ),
        ],
    )

    build_scenario(
        "similar_voices_two_speaker",
        VOICES_SIMILAR,
        [
            (
                "clinician",
                "Let's talk about your sleep. How many hours are you getting?",
                None,
            ),
            ("patient", "Honestly, maybe five or six, and it's not great sleep.", None),
            ("clinician", "Do you wake up during the night?", None),
            ("patient", "Yeah, a few times, and it's hard to fall back asleep.", None),
            (
                "clinician",
                "Any snoring, or has anyone mentioned you stop breathing?",
                None,
            ),
            (
                "patient",
                "My husband says I snore, but I don't think I stop breathing.",
                None,
            ),
        ],
    )


if __name__ == "__main__":
    sys.exit(main())
