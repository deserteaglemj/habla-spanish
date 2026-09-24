import Foundation

/// Pure policy: when may the app speak English locally, and when is the far-side
/// lane paused so the app never transcribes its own synthesized Spanish?
public struct AudioPolicy {
    public let outputIsHeadphones: Bool
    public let ttsSpeaking: Bool

    public init(outputIsHeadphones: Bool, ttsSpeaking: Bool) {
        self.outputIsHeadphones = outputIsHeadphones
        self.ttsSpeaking = ttsSpeaking
    }

    /// English voice to the user is allowed only on headphones and only while
    /// no other TTS is active (one voice at a time).
    public var maySpeakEnglishLocally: Bool {
        outputIsHeadphones && !ttsSpeaking
    }

    /// While our Spanish TTS plays into the mic device, the far-side recognizer
    /// must be paused or it would hear and transcribe our own voice.
    public var farSideLanePaused: Bool {
        ttsSpeaking
    }
}
