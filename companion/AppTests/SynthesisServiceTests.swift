import Testing
import AVFoundation
@testable import CallTranslatorApp

// Stage-5 review: exercise SynthesisService's utterance-identity lifecycle
// deterministically using caller-owned utterances (no audio hardware).

@MainActor
@Test func speakingStaysTrueAcrossQueuedUtterances() async {
    let svc = SynthesisService()
    let u1 = AVSpeechUtterance(string: "uno"); u1.voice = AVSpeechSynthesisVoice(identifier: "es-MX")
    let u2 = AVSpeechUtterance(string: "dos"); u2.voice = AVSpeechSynthesisVoice(identifier: "es-MX")
    svc.speak(u1)
    svc.speak(u2)
    #expect(svc.speaking == true)
    // First settles; second still outstanding.
    svc.speechSynthesizer(AVSpeechSynthesizer(), didFinish: u1)
    for _ in 0..<100 where svc.speaking { await Task.yield() }
    #expect(svc.speaking == true)
    svc.speechSynthesizer(AVSpeechSynthesizer(), didFinish: u2)
    for _ in 0..<100 where svc.speaking { await Task.yield() }
    #expect(svc.speaking == false)
}

@MainActor
@Test func stopDrainsAndClampsLateCancel() async {
    let svc = SynthesisService()
    let u1 = AVSpeechUtterance(string: "uno"); u1.voice = AVSpeechSynthesisVoice(identifier: "es-MX")
    let u2 = AVSpeechUtterance(string: "dos"); u2.voice = AVSpeechSynthesisVoice(identifier: "es-MX")
    var finished = 0
    svc.onFinished = { finished += 1 }
    svc.speak(u1)
    svc.speak(u2)
    svc.stop()
    #expect(svc.speaking == false)   // synchronous force-drain
    #expect(finished == 1)
    // Late cancels from the stopped generation are discarded.
    svc.speechSynthesizer(AVSpeechSynthesizer(), didCancel: u1)
    svc.speechSynthesizer(AVSpeechSynthesizer(), didCancel: u2)
    for _ in 0..<100 { await Task.yield() }
    #expect(svc.speaking == false)
    #expect(finished == 1)           // no double-fire
}

@MainActor
@Test func lateStaleCallbackCannotStealNewUtteranceCompletion() async {
    // Stage-5 critical #2, exact prescribed scenario: stop() → speak() (new
    // generation) → late didCancel from the OLD generation. The stale callback
    // must be discarded; the new utterance keeps its completion.
    let svc = SynthesisService()
    var finished = 0
    svc.onFinished = { finished += 1 }

    let old1 = AVSpeechUtterance(string: "old-uno"); old1.voice = AVSpeechSynthesisVoice(identifier: "es-MX")
    svc.speak(old1)
    svc.stop()
    #expect(finished == 1)

    let new1 = AVSpeechUtterance(string: "new-uno"); new1.voice = AVSpeechSynthesisVoice(identifier: "es-MX")
    svc.speak(new1)
    #expect(svc.speaking == true)

    // Late cancel from the stopped generation arrives AFTER the new speak().
    svc.speechSynthesizer(AVSpeechSynthesizer(), didCancel: old1)
    for _ in 0..<100 { await Task.yield() }
    #expect(svc.speaking == true)    // stale callback did not steal the slot
    #expect(finished == 1)           // no early fire

    // The new utterance settles for real ; exactly one fire for this settle.
    svc.speechSynthesizer(AVSpeechSynthesizer(), didFinish: new1)
    for _ in 0..<100 where svc.speaking { await Task.yield() }
    #expect(svc.speaking == false)
    #expect(finished == 2)           // one for the stop-drain, one for the real settle
}

@MainActor
@Test func unknownIdentityCallbackIsDiscarded() async {
    let svc = SynthesisService()
    var finished = 0
    svc.onFinished = { finished += 1 }
    let real = AVSpeechUtterance(string: "real"); real.voice = AVSpeechSynthesisVoice(identifier: "es-MX")
    svc.speak(real)
    let ghost = AVSpeechUtterance(string: "ghost")
    svc.speechSynthesizer(AVSpeechSynthesizer(), didCancel: ghost)
    for _ in 0..<100 { await Task.yield() }
    #expect(svc.speaking == true)    // ghost settled nothing
    svc.speechSynthesizer(AVSpeechSynthesizer(), didFinish: real)
    for _ in 0..<100 where svc.speaking { await Task.yield() }
    #expect(svc.speaking == false)
    #expect(finished == 1)
}
