import Foundation

/// Turn state machine for the near-side lane.
/// All side effects are injected callbacks; this type never touches audio.
public enum OrchestratorEvent: Equatable {
    case pushToTalkDown
    case pushToTalkUp
    case translationReady(String)
    case ttsFinished
    case reset
}

public enum OrchestratorState: Equatable {
    case idle
    case capturingHisUtterance
    case translating
    case speakingIntoCall
}

public final class TurnOrchestrator {
    public private(set) var state: OrchestratorState = .idle
    private let onStateChange: (OrchestratorState) -> Void
    private let ttsStopRequested: () -> Void

    public init(onStateChange: @escaping (OrchestratorState) -> Void = { _ in },
                ttsStopRequested: @escaping () -> Void = {}) {
        self.onStateChange = onStateChange
        self.ttsStopRequested = ttsStopRequested
    }

    @discardableResult
    public func handle(_ event: OrchestratorEvent, now: Date = Date()) -> OrchestratorState {
        let (next, stopTTS): (OrchestratorState, Bool)
        switch (state, event) {
        case (_, .reset):
            next = .idle; stopTTS = state == .speakingIntoCall
        // Happy cycle
        case (.idle, .pushToTalkDown):
            next = .capturingHisUtterance; stopTTS = false
        case (.capturingHisUtterance, .pushToTalkUp):
            next = .translating; stopTTS = false
        case (.translating, .translationReady):
            next = .speakingIntoCall; stopTTS = false
        case (.speakingIntoCall, .ttsFinished):
            next = .idle; stopTTS = false
        // Human interrupts machine
        case (.speakingIntoCall, .pushToTalkDown):
            next = .capturingHisUtterance; stopTTS = true
        case (.translating, .pushToTalkDown):
            next = .capturingHisUtterance; stopTTS = false
        // Re-press while already capturing, or junk events: ignore
        case (.capturingHisUtterance, .pushToTalkDown),
             (.idle, .pushToTalkUp), (.idle, .translationReady), (.idle, .ttsFinished),
             (.capturingHisUtterance, .translationReady), (.capturingHisUtterance, .ttsFinished),
             (.translating, .pushToTalkUp), (.translating, .ttsFinished),
             (.speakingIntoCall, .pushToTalkUp), (.speakingIntoCall, .translationReady):
            next = state; stopTTS = false
        }

        if stopTTS { ttsStopRequested() }
        if next != state {
            state = next
            onStateChange(next)
        }
        return state
    }
}
