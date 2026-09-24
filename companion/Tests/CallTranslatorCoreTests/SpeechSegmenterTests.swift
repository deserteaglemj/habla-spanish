import Testing
@testable import CallTranslatorCore

@Test func silentCallDoesNotCreateRepeatedEmptyTurns() {
    var segmenter = SpeechSegmenter()
    for second in 0..<50 { #expect(segmenter.observe(level: 0, at: Double(second), hasText: false) == .none) }
    #expect(segmenter.observe(level: 0, at: 50, hasText: false) == .restartEmpty)
    #expect(segmenter.observe(level: 0, at: 51, hasText: false) == .none)
}
@Test func finalizationWaitsForTrailingSilenceAndOccursOnlyOnce() {
    var segmenter = SpeechSegmenter()
    for tick in 0..<10 { #expect(segmenter.observe(level: 0.12, at: Double(tick) / 10, hasText: true) == .none) }
    #expect(segmenter.observe(level: 0, at: 1.5, hasText: true) == .none)
    #expect(segmenter.observe(level: 0, at: 1.8, hasText: true) == .finalize)
    #expect(segmenter.observe(level: 0, at: 2, hasText: true) == .none)
    segmenter.reset()
    #expect(segmenter.observe(level: 0.2, at: 3, hasText: true) == .none)
}
@Test func continuousSpeechHasABoundedUtteranceLength() {
    var segmenter = SpeechSegmenter()
    for tick in 0..<120 { #expect(segmenter.observe(level: 0.2, at: Double(tick) / 10, hasText: true) == .none) }
    #expect(segmenter.observe(level: 0.2, at: 12, hasText: true) == .finalize)
}
@Test func quietRecognizedWordsStillFinalizeWithoutWaitingAMinute() {
    var segmenter = SpeechSegmenter()
    #expect(segmenter.observe(level: 0.001, at: 0, hasText: true) == .none)
    #expect(segmenter.observe(level: 0.001, at: 0.9, hasText: true) == .finalize)
}

@Test func oldBriefNoiseDoesNotCutOffTheNextSpokenTurn() {
    var segmenter = SpeechSegmenter()
    #expect(segmenter.observe(level: 0.2, at: 0, hasText: false) == .none)
    #expect(segmenter.observe(level: 0, at: 1, hasText: false) == .none)
    for tick in 0..<10 {
        #expect(segmenter.observe(level: 0.2, at: 30 + Double(tick) / 10, hasText: tick > 2) == .none)
    }
}

@Test func evolvingQuietTranscriptExtendsTheSpeechBoundary() {
    var segmenter = SpeechSegmenter()
    for tick in 0..<10 {
        let time = Double(tick) / 2
        segmenter.recognizedTextChanged(at: time)
        #expect(segmenter.observe(level: 0.001, at: time, hasText: true) == .none)
    }
    #expect(segmenter.observe(level: 0.001, at: 5.4, hasText: true) == .finalize)
}
