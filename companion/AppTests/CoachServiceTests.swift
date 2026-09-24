import Foundation
import Testing
@testable import CallTranslatorApp

@Test @MainActor func coachReturnsActualGeneratorOutputAndUpdatedMemory() async throws {
    let coach = AppleCoachService(availability: { CoachAvailability(available: true, reason: nil) }, generate: { context in
        #expect(context.text == "Me gusta cocinar.")
        return CoachReply(text: "¿Qué plato preparas?", memory: "Practice cooking vocabulary.")
    })
    let result = try await coach.reply(text: "Me gusta cocinar.", topic: "cooking", level: "A2")
    #expect(result.text == "¿Qué plato preparas?")
    #expect(result.memory == "Practice cooking vocabulary.")
}

@Test @MainActor func coachUnavailableDoesNotGenerateCannedAnswer() async {
    let coach = AppleCoachService(availability: { CoachAvailability(available: false, reason: "Enable Apple Intelligence.") }, generate: { _ in
        Issue.record("Unavailable coach must not generate")
        return CoachReply(text: "unexpected", memory: "")
    })
    await #expect(throws: AppleCoachService.CoachError.self) {
        try await coach.reply(text: "Hola", topic: "travel", level: "A1")
    }
}

@Test @MainActor func coachCancellationDiscardsLateGeneratorResult() async {
    var continuation: CheckedContinuation<CoachReply, Never>?
    let coach = AppleCoachService(availability: { CoachAvailability(available: true, reason: nil) }, generate: { _ in
        await withCheckedContinuation { continuation = $0 }
    })
    let pending = Task { try await coach.reply(text: "Hola", topic: "travel", level: "A1") }
    while continuation == nil { await Task.yield() }
    coach.cancel()
    continuation?.resume(returning: CoachReply(text: "Old reply", memory: "Old memory"))
    await #expect(throws: CancellationError.self) { try await pending.value }
}

@Test @MainActor func coachRejectsConcurrentTurns() async {
    var continuation: CheckedContinuation<CoachReply, Never>?
    let coach = AppleCoachService(availability: { CoachAvailability(available: true, reason: nil) }, generate: { _ in
        await withCheckedContinuation { continuation = $0 }
    })
    let pending = Task { try await coach.reply(text: "Hola", topic: "travel", level: "A1") }
    while continuation == nil { await Task.yield() }
    await #expect(throws: AppleCoachService.CoachError.self) { try await coach.reply(text: "Otra", topic: "travel", level: "A1") }
    continuation?.resume(returning: CoachReply(text: "Hola", memory: ""))
    _ = try? await pending.value
}

@Test func coachReplyDoesNotRepeatGeneratedQuestion() {
    #expect(AppleCoachService.assemble(text: "Me encanta cocinar. ¿Qué cocinas?", question: "¿Qué cocinas?") == "Me encanta cocinar. ¿Qué cocinas?")
    #expect(AppleCoachService.assemble(text: "Hola.", question: "¿Cómo estás?") == "Hola. ¿Cómo estás?")
}
