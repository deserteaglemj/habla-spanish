import Testing
@testable import CallTranslatorCore

@Test func isolatedRouteAcceptsPhysicalMicrophoneAndIndependentCallOutput() throws {
    try IsolatedAudioRouting.validate(microphoneID: 1, microphoneIsVirtual: false,
                                     injectionID: 2, callOutputDeviceIDs: [3, 4])
}

@Test func isolatedRouteRejectsReturnedCallerAudioAndVirtualNearInput() {
    #expect(throws: IsolatedAudioRouting.Failure.self) {
        try IsolatedAudioRouting.validate(microphoneID: 1, microphoneIsVirtual: false,
                                         injectionID: 2, callOutputDeviceIDs: [3, 2])
    }
    #expect(throws: IsolatedAudioRouting.Failure.self) {
        try IsolatedAudioRouting.validate(microphoneID: 2, microphoneIsVirtual: true,
                                         injectionID: 2, callOutputDeviceIDs: [3])
    }
    #expect(throws: IsolatedAudioRouting.Failure.self) {
        try IsolatedAudioRouting.validate(microphoneID: 1, microphoneIsVirtual: false,
                                         injectionID: 2, callOutputDeviceIDs: [])
    }
}

@Test func captureGenerationRejectsLateFramesAcrossStopAndRestart() {
    let gate = AudioCaptureGeneration()
    let first = gate.begin()
    #expect(gate.accepts(first))
    gate.cancel()
    #expect(!gate.accepts(first))
    let second = gate.begin()
    #expect(!gate.accepts(first))
    #expect(gate.accepts(second))
    gate.cancel()
    #expect(!gate.accepts(second))
}
