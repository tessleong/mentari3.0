use super::*;

#[test]
fn parses_model_id() {
    assert_eq!(
        MODEL_ID.parse::<AppleSpeechModel>().unwrap(),
        AppleSpeechModel::Default
    );
    assert!("soniqo-parakeet-batch".parse::<AppleSpeechModel>().is_err());
}

#[test]
fn local_model_requires_matching_base_url() {
    assert!(local_model_from_request(LOCAL_BASE_URL, MODEL_ID).is_some());
    assert!(local_model_from_request("soniqo://local", MODEL_ID).is_none());
    assert!(local_model_from_request(LOCAL_BASE_URL, "whisper-tiny").is_none());
}

#[test]
fn locale_matching_widens_only_for_bare_language_tags() {
    assert!(locale_matches("en-US", "en"));
    assert!(locale_matches("en-US", "en-US"));
    assert!(locale_matches("en-US", "EN-us"));
    assert!(!locale_matches("en-US", "en-GB"));
    assert!(!locale_matches("ko-KR", "en"));
}

#[test]
fn session_locale_requires_a_system_settings_language() {
    // Off macOS there are no preferred locales, so nothing resolves.
    if !cfg!(target_os = "macos") {
        let korean: anlg_language::Language = "ko".parse().unwrap();
        assert_eq!(resolve_session_locale(&[korean]), None);
        return;
    }

    let Ok(preferred) = preferred_locales() else {
        return;
    };

    // A language the user has not added never resolves, whatever Apple supports.
    let unsupported: anlg_language::Language = "hi".parse().unwrap();
    assert_eq!(resolve_session_locale(&[unsupported]), None);

    if let Some(first) = preferred.first() {
        let base = first.split('-').next().unwrap();
        let language: anlg_language::Language = base.parse().unwrap();
        assert_eq!(
            resolve_session_locale(&[language]).as_deref(),
            Some(first.as_str())
        );

        // No requested language falls back to the primary System Settings language.
        assert_eq!(resolve_session_locale(&[]).as_deref(), Some(first.as_str()));
        assert_eq!(settings_locale().unwrap(), *first);
    }
}

#[test]
fn settings_locale_requires_macos_system_languages() {
    if !cfg!(target_os = "macos") {
        assert!(matches!(settings_locale(), Err(Error::UnsupportedPlatform)));
    }
}

#[test]
fn final_partials_keep_native_word_timings() {
    let partial = LivePartial {
        source: "system".to_string(),
        text: "hello world".to_string(),
        is_final: true,
        start: 1.0,
        end: 2.0,
        words: vec![
            Word {
                text: "hello".to_string(),
                start: 1.0,
                end: 1.4,
                confidence: Some(0.9),
            },
            Word {
                text: "world".to_string(),
                start: 1.5,
                end: 2.0,
                confidence: None,
            },
        ],
    };

    let stream::StreamResponse::TranscriptResponse {
        channel,
        channel_index,
        ..
    } = partial.into_stream_response()
    else {
        panic!("expected transcript response");
    };

    let words = &channel.alternatives[0].words;
    assert_eq!(channel_index, vec![1, 2]);
    assert_eq!(words.len(), 2);
    assert_eq!(words[0].start, 1.0);
    assert_eq!(words[0].end, 1.4);
    assert_eq!(words[0].confidence, 0.9);
    assert_eq!(words[1].start, 1.5);
    assert_eq!(words[1].confidence, 1.0);
}

#[test]
fn volatile_partials_synthesize_word_timings() {
    let partial = LivePartial {
        source: "microphone".to_string(),
        text: "one two".to_string(),
        is_final: false,
        start: 0.0,
        end: 1.0,
        words: vec![],
    };

    let stream::StreamResponse::TranscriptResponse { channel, .. } = partial.into_stream_response()
    else {
        panic!("expected transcript response");
    };

    let words = &channel.alternatives[0].words;
    assert_eq!(words.len(), 2);
    assert_eq!(words[0].start, 0.0);
    assert_eq!(words[1].start, 0.5);
}

#[test]
fn batch_response_reports_native_timing_source() {
    let response = batch_response_from_transcripts(vec![FileTranscript {
        text: "hello  world".to_string(),
        duration_seconds: 2.0,
        words: vec![Word {
            text: "hello".to_string(),
            start: 0.0,
            end: 0.5,
            confidence: Some(0.8),
        }],
        speaker_segments: Vec::new(),
    }]);

    assert_eq!(
        response.results.channels[0].alternatives[0].transcript,
        "hello world"
    );
    assert_eq!(response.metadata["timing_source"], "native");
    assert_eq!(response.metadata["duration"], 2.0);
    assert_eq!(response.metadata["diarized"], false);
    assert_eq!(response.results.channels[0].alternatives[0].words.len(), 1);
}

#[test]
fn speaker_for_word_picks_the_segment_containing_the_word_midpoint() {
    let segments = [
        DiarizationSegment {
            start_seconds: 0.0,
            end_seconds: 2.0,
            speaker_index: 0,
        },
        DiarizationSegment {
            start_seconds: 2.0,
            end_seconds: 4.0,
            speaker_index: 1,
        },
    ];

    assert_eq!(speaker_for_word(&segments, 0.0, 1.0), Some(0));
    assert_eq!(speaker_for_word(&segments, 1.8, 2.2), Some(1));
    assert_eq!(speaker_for_word(&segments, 3.0, 3.5), Some(1));
}

#[test]
fn speaker_for_word_is_none_outside_any_segment() {
    let segments = [DiarizationSegment {
        start_seconds: 1.0,
        end_seconds: 2.0,
        speaker_index: 0,
    }];

    assert_eq!(speaker_for_word(&segments, 5.0, 5.5), None);
    assert_eq!(speaker_for_word(&[], 0.0, 1.0), None);
}

#[test]
fn batch_response_attributes_words_by_diarization_segment() {
    let response = batch_response_from_transcripts(vec![FileTranscript {
        text: "hi there doctor".to_string(),
        duration_seconds: 4.0,
        words: vec![
            Word {
                text: "hi".to_string(),
                start: 0.0,
                end: 0.5,
                confidence: Some(1.0),
            },
            Word {
                text: "there".to_string(),
                start: 2.5,
                end: 3.0,
                confidence: Some(1.0),
            },
        ],
        speaker_segments: vec![
            DiarizationSegment {
                start_seconds: 0.0,
                end_seconds: 2.0,
                speaker_index: 0,
            },
            DiarizationSegment {
                start_seconds: 2.0,
                end_seconds: 4.0,
                speaker_index: 1,
            },
        ],
    }]);

    let words = &response.results.channels[0].alternatives[0].words;
    assert_eq!(words[0].speaker, Some(0));
    assert_eq!(words[1].speaker, Some(1));
    assert_eq!(response.metadata["diarized"], true);
}
