import Foundation
import Testing
@testable import CallTranslatorCore

@Test func speechFinishesOnlyAfterLastDevicePlayback() {
    var drain = AudioPlaybackDrain()
    let token = UUID(); drain.begin(token)
    let first = drain.enqueue(token), second = drain.enqueue(token)
    #expect(first); #expect(second)
    #expect(drain.synthesisEnded(token) == .waiting)
    #expect(drain.played(token) == .waiting)
    #expect(drain.played(token) == .drained)
    #expect(drain.played(token) == .stale)
}
@Test func endedSynthesisWithoutAudioIsNotSuccessfulPlayback() {
    var drain = AudioPlaybackDrain()
    let token = UUID(); drain.begin(token)
    #expect(drain.synthesisEnded(token) == .empty)
}
@Test func cancelledSpeechCannotSettleReplacementPlayback() {
    var drain = AudioPlaybackDrain()
    let old = UUID(); drain.begin(old); _ = drain.enqueue(old)
    drain.cancel()
    let current = UUID(); drain.begin(current); _ = drain.enqueue(current)
    #expect(drain.played(old) == .stale)
    #expect(drain.synthesisEnded(old) == .stale)
    #expect(drain.synthesisEnded(current) == .waiting)
    #expect(drain.played(current) == .drained)
}
