import Foundation

/// Device IDs include the leaves of aggregate output devices.
public enum IsolatedAudioRouting {
    public enum Failure: Error, LocalizedError {
        case physicalMicrophoneRequired, independentOutputRequired, echoRoute
        public var errorDescription: String? {
            switch self {
            case .physicalMicrophoneRequired: return "Choose a physical microphone for your voice."
            case .independentOutputRequired: return "Start the call's audio first, then choose its active audio source."
            case .echoRoute: return "The call's speaker output includes its virtual microphone. Choose physical speakers or headphones in the calling app to prevent returned echo."
            }
        }
    }
    public static func validate(microphoneID: UInt32, microphoneIsVirtual: Bool,
                                injectionID: UInt32, callOutputDeviceIDs: [UInt32]) throws {
        guard microphoneID != 0, !microphoneIsVirtual, microphoneID != injectionID else { throw Failure.physicalMicrophoneRequired }
        guard !callOutputDeviceIDs.isEmpty else { throw Failure.independentOutputRequired }
        guard injectionID != 0, !callOutputDeviceIDs.contains(injectionID) else { throw Failure.echoRoute }
    }
}

/// A capture lifetime token prevents queued audio from reaching a replacement recognizer.
public final class AudioCaptureGeneration: @unchecked Sendable {
    private let lock = NSLock()
    private var generation: UInt64 = 0
    private var active = false
    public init() {}
    public func begin() -> UInt64 { lock.withLock { generation &+= 1; active = true; return generation } }
    public func cancel() { lock.withLock { active = false; generation &+= 1 } }
    public func accepts(_ token: UInt64) -> Bool { lock.withLock { active && generation == token } }
}
