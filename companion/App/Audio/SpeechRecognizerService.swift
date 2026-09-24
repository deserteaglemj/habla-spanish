import Speech
import AVFoundation

struct RecognitionLifetime {
    private var token: UInt64 = 0
    private var active = false
    private(set) var acceptsBuffers = false
    mutating func begin() -> UInt64 { token &+= 1; active = true; acceptsBuffers = true; return token }
    mutating func finish() { acceptsBuffers = false }
    mutating func cancel() { token &+= 1; active = false; acceptsBuffers = false }
    func accepts(_ candidate: UInt64) -> Bool { active && candidate == token }
    var currentToken: UInt64 { token }
}

/// feed may run on a capture queue. Consumer callbacks are delivered on main.
/// Recognition never falls back to a cloud service.
final class SpeechRecognizerService {
    private let locale: Locale
    private let lock = NSLock()
    private var lifetime = RecognitionLifetime()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var finalTimeout: DispatchWorkItem?
    var onPartial: ((String) -> Void)?
    var onFinal: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    init(localeIdentifier: String) { locale = Locale(identifier: localeIdentifier) }
    deinit { cancelStream() }

    func requestAuth() async -> Bool {
        let status = await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        return status == .authorized
    }

    func prepare() { lock.withLock { recognizer = SFSpeechRecognizer(locale: locale) } }

    static func requireLocalRecognition(authorized: Bool, available: Bool, supportsOnDevice: Bool) throws {
        guard authorized else { throw STTError.permissionDenied }
        guard available else { throw STTError.unavailable }
        guard supportsOnDevice else { throw STTError.onDeviceUnavailable }
    }

    func startStream() throws {
        cancelStream()
        let recognizer = lock.withLock { self.recognizer }
        try Self.requireLocalRecognition(authorized: SFSpeechRecognizer.authorizationStatus() == .authorized,
                                         available: recognizer?.isAvailable == true,
                                         supportsOnDevice: recognizer?.supportsOnDeviceRecognition == true)
        guard let recognizer else { throw STTError.unavailable }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = true
        let token = lock.withLock { request = req; return lifetime.begin() }
        let newTask = recognizer.recognitionTask(with: req) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let final = result?.isFinal == true
            DispatchQueue.main.async { [weak self] in
                guard let self, self.lock.withLock({ self.lifetime.accepts(token) }) else { return }
                if let text, final {
                    self.settle(token)
                    self.onFinal?(text)
                } else if let error {
                    self.settle(token)
                    self.onError?(error)
                } else if let text {
                    self.onPartial?(text)
                }
            }
        }
        lock.withLock {
            if lifetime.accepts(token) { task = newTask } else { newTask.cancel() }
        }
    }

    func feed(_ buffer: AVAudioPCMBuffer) {
        lock.withLock { if lifetime.acceptsBuffers { request?.append(buffer) } }
    }

    /// Ends audio but retains the task while awaiting its real final result.
    func finishStream() {
        let work: DispatchWorkItem? = lock.withLock {
            guard lifetime.acceptsBuffers else { return nil }
            lifetime.finish()
            request?.endAudio()
            task?.finish()
            let token = lifetime.currentToken
            let work = DispatchWorkItem { [weak self] in
                guard let self else { return }
                let waiting = self.lock.withLock { self.lifetime.accepts(token) && !self.lifetime.acceptsBuffers }
                guard waiting else { return }
                self.cancelStream()
                self.onError?(STTError.finalizationTimedOut)
            }
            finalTimeout = work
            return work
        }
        if let work { DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work) }
    }

    func endStream() { finishStream() }

    func cancelStream() {
        let previous = lock.withLock {
            lifetime.cancel()
            finalTimeout?.cancel(); finalTimeout = nil
            let previous = task
            task = nil
            request = nil
            return previous
        }
        previous?.cancel()
    }

    private func settle(_ token: UInt64) {
        lock.withLock {
            guard lifetime.accepts(token) else { return }
            lifetime.cancel()
            finalTimeout?.cancel(); finalTimeout = nil
            request = nil
            task = nil
        }
    }

    enum STTError: Error, LocalizedError {
        case unavailable, permissionDenied, onDeviceUnavailable, finalizationTimedOut
        var errorDescription: String? {
            switch self {
            case .unavailable: return "Speech recognition is unavailable for this language. Try again after its language assets are ready."
            case .permissionDenied: return "Allow Speech Recognition for Habla in System Settings."
            case .onDeviceUnavailable: return "On-device speech recognition is not available for this language. No audio was sent to a cloud service."
            case .finalizationTimedOut: return "Speech recognition did not finish. Please try the turn again."
            }
        }
    }
}
