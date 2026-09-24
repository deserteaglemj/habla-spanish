import Foundation
import CallTranslatorCore
import Translation

struct TranslationAvailability: Codable, Sendable {
    let available: Bool
    let reason: String?
}

/// Uses installed on-device assets. Downloads belong to the explicit setup view.
actor AppleTranslationService: TranslationServicing {
    private var active: [UUID: TranslationSession] = [:]
    private var generation: UInt64 = 0

    func availability() async -> TranslationAvailability {
        let status = await LanguageAvailability().status(from: Locale.Language(identifier: "en"), to: Locale.Language(identifier: "es"))
        switch status {
        case .installed: return TranslationAvailability(available: true, reason: nil)
        case .supported: return TranslationAvailability(available: false, reason: "Download English and Spanish translation languages in setup first.")
        case .unsupported: return TranslationAvailability(available: false, reason: "On-device English and Spanish translation is unavailable on this Mac.")
        @unknown default: return TranslationAvailability(available: false, reason: "Translation availability could not be confirmed.")
        }
    }

    nonisolated static func validate(text: String, from: Locale.Language, to: Locale.Language) throws {
        let source = from.languageCode?.identifier
        let target = to.languageCode?.identifier
        guard (source == "en" && target == "es") || (source == "es" && target == "en") else { throw TranslationError.unsupportedPair }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw TranslationError.emptyInput }
        guard text.utf8.count <= 8000 else { throw TranslationError.inputTooLong }
    }

    func translate(_ text: String, from: Locale.Language, to: Locale.Language) async throws -> String {
        try Self.validate(text: text, from: from, to: to)
        try Task.checkCancellation()
        let currentGeneration = generation
        let status = await LanguageAvailability().status(from: from, to: to)
        guard case .installed = status else { throw TranslationError.assetsNotInstalled }
        guard currentGeneration == generation else { throw CancellationError() }
        let session: TranslationSession
        if #available(macOS 26.4, *) {
            session = TranslationSession(installedSource: from, target: to, preferredStrategy: .lowLatency)
        } else {
            session = TranslationSession(installedSource: from, target: to)
        }
        let id = UUID()
        active[id] = session
        defer { active.removeValue(forKey: id) }
        let response = try await withTaskCancellationHandler {
            try await session.translate(text)
        } onCancel: {
            Task { await self.cancelRequest(id) }
        }
        try Task.checkCancellation()
        guard currentGeneration == generation else { throw CancellationError() }
        guard !response.targetText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw TranslationError.emptyOutput }
        return response.targetText
    }

    private func cancelRequest(_ id: UUID) { active[id]?.cancel() }
    func cancel() {
        generation &+= 1
        for session in active.values { session.cancel() }
        active.removeAll()
    }

    enum TranslationError: Error, LocalizedError {
        case unsupportedPair, emptyInput, inputTooLong, assetsNotInstalled, emptyOutput
        var errorDescription: String? {
            switch self {
            case .unsupportedPair: return "Choose English to Spanish or Spanish to English."
            case .emptyInput: return "No speech was recognized. Please try again."
            case .inputTooLong: return "Translate a shorter passage, up to 8,000 bytes."
            case .assetsNotInstalled: return "English and Spanish translation assets are not installed. Use language setup first."
            case .emptyOutput: return "The local translator returned no translation. Please try again."
            }
        }
    }
}
