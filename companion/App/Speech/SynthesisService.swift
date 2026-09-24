import AVFoundation

/// Speaks Spanish into the virtual mic device (BlackHole) and English to the default output.
/// Tracks OUTSTANDING UTTERANCE OBJECTS so `speaking` stays true while any
/// utterance remains; the feedback guard depends on this invariant.
///
/// Identity model (stage-5 finding): the delegate hands back the exact
/// AVSpeechUtterance instance, so reference identity is the token. stop()
/// clears the outstanding set; a late didCancel/didFinish from a stopped
/// generation therefore finds nothing to remove and is discarded ; it can
/// never consume a newer utterance's completion.
///
/// Concurrency: @MainActor; delegate callbacks arrive off-main and hop via
/// Task { @MainActor }. AVSpeechSynthesizer is not Sendable ; all access is
/// pinned to the main actor.
@MainActor
final class SynthesisService: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var outstanding: Set<ObjectIdentifier> = []

    private(set) var speaking = false
    var onFinished: (() -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// Speak `text` with the given voice code on the system default output.
    func speak(_ text: String, voiceCode: String, rate: Float = 0.5) {
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(identifier: voiceCode)
        u.rate = rate
        speak(u)
    }

    /// Speak a caller-owned utterance (tests settle the exact identity via
    /// delegate callbacks; production uses the string overload).
    func speak(_ u: AVSpeechUtterance) {
        outstanding.insert(ObjectIdentifier(u))
        speaking = true
        synthesizer.speak(u)
    }

    func stop() {
        // Synchronous force-drain: clear every outstanding identity so late
        // platform callbacks (which may arrive only for the active utterance)
        // can neither strand `speaking` nor steal a future utterance's slot.
        synthesizer.stopSpeaking(at: .immediate)
        outstanding.removeAll()
        if speaking {
            speaking = false
            onFinished?()
        }
    }

    private func utteranceSettled(_ u: AVSpeechUtterance) {
        // Unknown identity = stale callback from before a stop() → discard.
        guard outstanding.remove(ObjectIdentifier(u)) != nil else { return }
        if outstanding.isEmpty {
            speaking = false
            onFinished?()
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.utteranceSettled(utterance) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.utteranceSettled(utterance) }
    }
}
