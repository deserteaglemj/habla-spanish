import Foundation

public protocol TranslationServicing: Sendable {
    func translate(_ text: String, from: Locale.Language, to: Locale.Language) async throws -> String
}

/// FIFO translation queue. maxConcurrent = 1 guarantees strict utterance order.
/// A failing item never kills the queue; its error goes to its own completion.
public actor TranslationQueue {
    private let service: TranslationServicing
    private let maxConcurrent: Int
    private var pending: [Item] = []
    private var inFlight = 0

    private struct Item {
        let text: String
        let from: Locale.Language
        let to: Locale.Language
        let completion: @Sendable (Result<String, Error>) -> Void
    }

    public init(service: TranslationServicing, maxConcurrent: Int = 1) {
        self.service = service
        self.maxConcurrent = max(1, maxConcurrent)
    }

    public func enqueue(_ text: String, from: Locale.Language, to: Locale.Language,
                        completion: @escaping @Sendable (Result<String, Error>) -> Void) {
        pending.append(Item(text: text, from: from, to: to, completion: completion))
        pump()
    }

    private func pump() {
        while inFlight < maxConcurrent, !pending.isEmpty {
            let item = pending.removeFirst()
            inFlight += 1
            Task {
                defer { Task { self.finishOne() } } // Task inherits actor isolation; no hop needed
                do {
                    let out = try await service.translate(item.text, from: item.from, to: item.to)
                    item.completion(.success(out))
                } catch {
                    item.completion(.failure(error))
                }
            }
        }
    }

    private func finishOne() {
        inFlight -= 1
        pump()
    }
}
