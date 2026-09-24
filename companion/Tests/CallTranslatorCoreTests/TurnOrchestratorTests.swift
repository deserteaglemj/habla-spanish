import Testing
@testable import CallTranslatorCore

@Test func pttHappyCycle() {
    var states: [OrchestratorState] = []
    var stops = 0
    let o = TurnOrchestrator(onStateChange: { states.append($0) }, ttsStopRequested: { stops += 1 })
    #expect(o.handle(.pushToTalkDown) == .capturingHisUtterance)
    #expect(o.handle(.pushToTalkUp) == .translating)
    #expect(o.handle(.translationReady("Hola")) == .speakingIntoCall)
    #expect(o.handle(.ttsFinished) == .idle)
    #expect(states == [.capturingHisUtterance, .translating, .speakingIntoCall, .idle])
    #expect(stops == 0)
}

@Test func pttInterruptsSpeakingTTS() {
    var stops = 0
    let o = TurnOrchestrator(onStateChange: { _ in }, ttsStopRequested: { stops += 1 })
    _ = o.handle(.pushToTalkDown)
    _ = o.handle(.pushToTalkUp)
    _ = o.handle(.translationReady("Hola"))
    #expect(o.handle(.pushToTalkDown) == .capturingHisUtterance)
    #expect(stops == 1)
}

@Test func pttInterruptsTranslating() {
    let o = TurnOrchestrator()
    _ = o.handle(.pushToTalkDown)
    _ = o.handle(.pushToTalkUp)
    #expect(o.handle(.pushToTalkDown) == .capturingHisUtterance)
    #expect(o.state == .capturingHisUtterance)
}

@Test func invalidTransitionsIgnored() {
    let o = TurnOrchestrator()
    #expect(o.handle(.pushToTalkUp) == .idle)
    #expect(o.handle(.translationReady("x")) == .idle)
    #expect(o.handle(.ttsFinished) == .idle)
    _ = o.handle(.pushToTalkDown)
    #expect(o.handle(.pushToTalkDown) == .capturingHisUtterance) // re-press no-op
    #expect(o.handle(.ttsFinished) == .capturingHisUtterance)
}
