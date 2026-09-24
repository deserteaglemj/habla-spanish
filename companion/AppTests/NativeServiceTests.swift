import Foundation
import Testing
@testable import CallTranslatorApp

@Test func speechRecognitionRejectsCloudFallback() {
    #expect(throws: SpeechRecognizerService.STTError.self) {
        try SpeechRecognizerService.requireLocalRecognition(authorized: true, available: true, supportsOnDevice: false)
    }
    #expect(throws: SpeechRecognizerService.STTError.self) {
        try SpeechRecognizerService.requireLocalRecognition(authorized: false, available: true, supportsOnDevice: true)
    }
}

@Test func speechRecognitionAllowsAuthorizedOnDeviceStream() throws {
    try SpeechRecognizerService.requireLocalRecognition(authorized: true, available: true, supportsOnDevice: true)
}

@Test func recognitionLifetimeRejectsOldCallbacksButAcceptsFinalAfterFinish() {
    var lifetime = RecognitionLifetime()
    let first = lifetime.begin()
    lifetime.finish()
    #expect(lifetime.accepts(first))
    #expect(!lifetime.acceptsBuffers)
    let second = lifetime.begin()
    #expect(!lifetime.accepts(first))
    #expect(lifetime.accepts(second))
    lifetime.cancel()
    #expect(!lifetime.accepts(second))
}

@Test func translationRejectsOtherLanguagePairsAndEmptyInput() {
    #expect(throws: AppleTranslationService.TranslationError.self) {
        try AppleTranslationService.validate(text: "bonjour", from: Locale.Language(identifier: "fr"), to: Locale.Language(identifier: "es"))
    }
    #expect(throws: AppleTranslationService.TranslationError.self) {
        try AppleTranslationService.validate(text: " ", from: Locale.Language(identifier: "en"), to: Locale.Language(identifier: "es"))
    }
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["HABLA_LOCAL_MODEL_PROBE"] == "1"))
@MainActor func realLocalServicesProduceSpanishWithoutDownloads() async throws {
    let translator = AppleTranslationService()
    let readiness = await translator.availability()
    #expect(readiness.available)
    let translated = try await translator.translate("Good morning. I would like to practice Spanish.", from: Locale.Language(identifier: "en"), to: Locale.Language(identifier: "es"))
    #expect(translated != "Good morning. I would like to practice Spanish.")
    #expect(!translated.isEmpty)
    print("HABLA_TRANSLATION_PROBE: \(translated)")
    let coach = AppleCoachService()
    #expect(coach.availability.available)
    let reply = try await coach.reply(text: "Hola, quiero practicar conversaciones sobre viajes.", topic: "travel", level: "A2")
    #expect(!reply.text.isEmpty)
    #expect(reply.text.contains("?"))
    #expect(!reply.memory.isEmpty)
    print("HABLA_COACH_PROBE: \(reply.text)")
    print("HABLA_MEMORY_PROBE: \(reply.memory)")
    let followUp = try await coach.reply(text: "Quiero hablar de cocinar, no de viajes. Me gusta el arroz.", topic: "travel", level: "A2", history: [.init(role: .user, text: "Hola, quiero practicar conversaciones sobre viajes."), .init(role: .assistant, text: reply.text)], memory: reply.memory)
    #expect(!followUp.text.isEmpty)
    #expect(followUp.text.contains("?"))
    print("HABLA_TOPIC_CHANGE_PROBE: \(followUp.text)")
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["HABLA_TOPIC_PROBE"] == "1"))
@MainActor func realCoachFollowsLatestTravelRequestAfterCooking() async throws {
    let first = "Hola, quiero practicar español hablando de comida. ¿Qué puedo preparar para cenar?"
    let latest = "Ahora quiero hablar de viajes. Me gusta la playa. ¿Qué puedo hacer allí?"
    for run in 1...3 {
        let coach = AppleCoachService()
        let cooking = try await coach.reply(text: first, topic: "Comida y cocina", level: "A2")
        let travel = try await coach.reply(text: latest, topic: "Comida y cocina", level: "A2", history: [.init(role: .user, text: first), .init(role: .assistant, text: cooking.text)], memory: cooking.memory)
        print("HABLA_COOKING_PROBE_\(run): \(cooking.text)")
        print("HABLA_BEACH_PROBE_\(run): \(travel.text)")
        let lower = travel.text.lowercased()
        #expect(["playa", "nadar", "arena", "mar", "surf", "sol", "costa", "buce", "pasear"].contains(where: lower.contains))
    }
}
