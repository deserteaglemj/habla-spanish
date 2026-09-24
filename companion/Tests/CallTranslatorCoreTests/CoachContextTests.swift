import Foundation
import Testing
@testable import CallTranslatorCore

@Test func coachContextRetainsCurrentInputAndRecentConversation() throws {
    let history = (0..<100).map { CoachTurn(role: $0.isMultiple(of: 2) ? .user : .assistant, text: "Turn \($0) about travel") }
    let context = try CoachContext(text: "Quiero cambiar de tema.", topic: "travel", level: "A2", history: history, memory: "Practice past tense.")
    #expect(context.text == "Quiero cambiar de tema.")
    #expect(context.history.last?.text == "Turn 99 about travel")
    #expect(context.history.count <= 8)
    #expect(context.prompt.utf8.count <= CoachContext.maximumPromptBytes)
    #expect(context.prompt.contains("Practice past tense."))
}

@Test func coachContextRejectsEmptyAndOversizedInputWithoutTruncatingIt() {
    #expect(throws: CoachContext.ValidationError.self) { try CoachContext(text: "   ", topic: "", level: "A1") }
    #expect(throws: CoachContext.ValidationError.self) { try CoachContext(text: String(repeating: "界", count: 800), topic: "", level: "A1") }
}

@Test func coachContextBoundsUnicodeMemoryAndHistory() throws {
    let history = (0..<50).map { _ in CoachTurn(role: .user, text: String(repeating: "🙂", count: 1000)) }
    let context = try CoachContext(text: "Hola", topic: String(repeating: "tema ", count: 200), level: "B1", history: history, memory: String(repeating: "á", count: 2000))
    #expect(context.memory.utf8.count <= 700)
    #expect(context.prompt.utf8.count <= CoachContext.maximumPromptBytes)
    #expect(!context.prompt.contains("�"))
}

@Test func coachContextHasNoLifetimeTurnLimit() throws {
    for turn in [0, 100, 10000] {
        let context = try CoachContext(text: "Turn \(turn)", topic: "cooking", level: "A2", history: [CoachTurn(role: .assistant, text: "¿Qué cocinas?")])
        #expect(context.text == "Turn \(turn)")
    }
}

@Test func coachContextRejectsOversizedEscapedCurrentInput() {
    #expect(throws: CoachContext.ValidationError.self) {
        try CoachContext(text: String(repeating: "\u{0001}", count: 1900), topic: "", level: "A1")
    }
}

@Test func latestCoachMessageComesAfterHistoryMemoryAndOldTopic() throws {
    let latest = "Ahora quiero hablar de viajes. Me gusta la playa. ¿Qué puedo hacer allí?"
    let context = try CoachContext(text: latest, topic: "Comida", level: "A2", history: [.init(role: .user, text: "Quiero hablar de comida"), .init(role: .assistant, text: "Puedes preparar una ensalada.")], memory: "The learner likes cooking.")
    #expect(context.prompt.hasSuffix("\"\(latest)\""))
    let current = try #require(context.prompt.range(of: latest))
    let oldReply = try #require(context.prompt.range(of: "Puedes preparar una ensalada."))
    #expect(current.lowerBound > oldReply.upperBound)
}
