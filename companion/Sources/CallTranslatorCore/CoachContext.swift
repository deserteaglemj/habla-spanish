import Foundation

public struct CoachTurn: Codable, Equatable, Sendable {
    public enum Role: String, Codable, Sendable { case user, assistant }
    public let role: Role
    public let text: String
    public init(role: Role, text: String) { self.role = role; self.text = text }
}

/// A fresh model context per response avoids a lifetime conversation quota.
/// Old turns leave the prompt, while an explicit learner-visible memory remains.
public struct CoachContext: Sendable {
    public static let maximumPromptBytes = 5000
    public static let maximumInputBytes = 2000
    public let text: String
    public let topic: String
    public let level: String
    public let history: [CoachTurn]
    public let memory: String
    public let prompt: String

    public init(text: String, topic: String, level: String, history: [CoachTurn] = [], memory: String = "", compact: Bool = false) throws {
        let input = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { throw ValidationError.emptyInput }
        guard input.utf8.count <= Self.maximumInputBytes else { throw ValidationError.inputTooLong }
        guard ["A1", "A2", "B1", "B2", "C1", "C2"].contains(level) else { throw ValidationError.invalidLevel }
        self.text = input
        let boundedTopic = Self.prefix(topic, bytes: compact ? 100 : 200)
        let boundedMemory = Self.prefix(memory, bytes: compact ? 250 : 700)
        self.topic = boundedTopic
        self.level = level
        self.memory = boundedMemory
        var recent = compact ? [] : history.suffix(8).map { CoachTurn(role: $0.role, text: Self.prefix($0.text, bytes: 650)) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        func serialize(_ turns: [CoachTurn]) throws -> String {
            struct Background: Encodable { let level: String; let initialTopic: String; let learnerMemory: String; let earlierTurns: [CoachTurn] }
            let data = try encoder.encode(Background(level: level, initialTopic: boundedTopic, learnerMemory: boundedMemory, earlierTurns: turns))
            let current = try encoder.encode(input)
            return """
            BACKGROUND ONLY. Earlier turns and notes help with continuity. Do not answer an earlier turn. The initial topic is only a starting suggestion.
            \(String(decoding: data, as: UTF8.self))

            CURRENT LEARNER MESSAGE. Answer this message now. A new topic or question here takes priority over every older topic and memory note.
            \(String(decoding: current, as: UTF8.self))
            """
        }
        var serialized = try serialize(recent)
        while serialized.utf8.count > Self.maximumPromptBytes, !recent.isEmpty {
            recent.removeFirst()
            serialized = try serialize(recent)
        }
        guard serialized.utf8.count <= Self.maximumPromptBytes else { throw ValidationError.inputTooLong }
        self.history = recent
        self.prompt = serialized
    }

    public static func prefix(_ value: String, bytes: Int) -> String {
        var result = ""
        var count = 0
        for character in value {
            let size = String(character).utf8.count
            guard count + size <= bytes else { break }
            result.append(character)
            count += size
        }
        return result
    }

    public enum ValidationError: Error, LocalizedError {
        case emptyInput, inputTooLong, invalidLevel
        public var errorDescription: String? {
            switch self {
            case .emptyInput: return "Say or type a message before sending it."
            case .inputTooLong: return "Send a shorter message, up to 2,000 bytes, so the local coach can keep your full message."
            case .invalidLevel: return "Choose a Spanish level from A1 to C2."
            }
        }
    }
}
