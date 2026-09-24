import Foundation

/// Frames are still fed to recognition until this requests a final result. The
/// recognizer's final text, not a partial transcript, is the translation boundary.
public struct SpeechSegmenter {
    public enum Action: Equatable { case none, finalize, restartEmpty }
    private var streamStarted: TimeInterval?
    private var speechStarted: TimeInterval?
    private var lastVoice: TimeInterval?
    private var previousFrame: TimeInterval?
    private var voicedDuration: TimeInterval = 0
    private var requested = false
    public init() {}
    public mutating func reset() { self = SpeechSegmenter() }
    public mutating func recognizedTextChanged(at time: TimeInterval) {
        guard !requested, time.isFinite else { return }
        if streamStarted == nil { streamStarted = time }
        if speechStarted == nil { speechStarted = time }
        lastVoice = time
    }
    public mutating func observe(level: Double, at time: TimeInterval, hasText: Bool) -> Action {
        guard !requested, time.isFinite, level.isFinite else { return .none }
        if streamStarted == nil { streamStarted = time }
        let elapsed = max(0, min(0.1, time - (previousFrame ?? time)))
        previousFrame = time
        if !hasText, voicedDuration < 0.18, let lastVoice, time - lastVoice >= 0.85 {
            // Discard an isolated click rather than let it age the next real utterance.
            speechStarted = nil; self.lastVoice = nil; voicedDuration = 0
        }
        if level >= 0.04 {
            if speechStarted == nil { speechStarted = time }
            lastVoice = time; voicedDuration += elapsed
        } else if hasText, speechStarted == nil {
            // A recognizer can hear a quiet voice that falls below the level threshold.
            speechStarted = time; lastVoice = time
        }
        let enoughSpeech = hasText || voicedDuration >= 0.18
        let quiet = lastVoice.map { time - $0 >= 0.85 } ?? false
        let longTurn = speechStarted.map { time - $0 >= 12 } ?? false
        let streamLimit = time - (streamStarted ?? time) >= 50
        if enoughSpeech && (quiet || longTurn || streamLimit) { requested = true; return .finalize }
        if streamLimit { requested = true; return .restartEmpty }
        return .none
    }
}
