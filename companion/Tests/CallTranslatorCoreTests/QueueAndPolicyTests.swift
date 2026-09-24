import Testing
import Foundation
@testable import CallTranslatorCore

// MARK: - TranslationQueue

final class MockService: TranslationServicing, @unchecked Sendable {
    var delays: [Double]
    var failTexts: Set<String> = []
    private(set) var startedOrder: [String] = []
    private let lock = NSLock()
    private(set) var maxObservedConcurrent = 0
    private var current = 0

    init(delays: [Double]) { self.delays = delays }

    func translate(_ text: String, from: Locale.Language, to: Locale.Language) async throws -> String {
        lock.lock()
        startedOrder.append(text)
        current += 1
        maxObservedConcurrent = max(maxObservedConcurrent, current)
        let d = delays.isEmpty ? 0.01 : delays.removeFirst()
        let fail = failTexts.contains(text)
        lock.unlock()
        try await Task.sleep(nanoseconds: UInt64(d * 1_000_000_000))
        lock.lock()
        current -= 1
        lock.unlock()
        if fail { throw URLError(.badServerResponse) }
        return "ES: \(text)"
    }
}

/// A synchronized box so @Sendable closures can record results safely.
final class Box<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [T] = []
    func append(_ t: T) { lock.lock(); items.append(t); lock.unlock() }
    var values: [T] { lock.lock(); defer { lock.unlock() }; return items }
}

func awaitGroup(_ group: DispatchGroup) async {
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
        group.notify(queue: .global()) { cont.resume() }
    }
}

@Test func queueIsStrictFIFO() async throws {
    let mock = MockService(delays: [0.02, 0.02, 0.02])
    let q = TranslationQueue(service: mock, maxConcurrent: 1)
    let results = Box<String>()
    let group = DispatchGroup()
    for t in ["one", "two", "three"] {
        group.enter()
        await q.enqueue(t, from: Locale.Language(languageCode: "en"), to: Locale.Language(languageCode: "es")) { r in
            if case .success(let v) = r { results.append(v) }
            group.leave()
        }
    }
    await awaitGroup(group)
    #expect(results.values == ["ES: one", "ES: two", "ES: three"])
}

@Test func failureDoesNotKillQueue() async throws {
    let mock = MockService(delays: [0.01, 0.01])
    mock.failTexts = ["bad"]
    let q = TranslationQueue(service: mock, maxConcurrent: 1)
    let okBad = Box<Bool>(); let okGood = Box<Bool>()
    let group = DispatchGroup()
    group.enter()
    await q.enqueue("bad", from: Locale.Language(languageCode: "en"), to: Locale.Language(languageCode: "es")) { r in
        okBad.append((try? r.get()) != nil); group.leave()
    }
    group.enter()
    await q.enqueue("good", from: Locale.Language(languageCode: "en"), to: Locale.Language(languageCode: "es")) { r in
        okGood.append((try? r.get()) != nil); group.leave()
    }
    await awaitGroup(group)
    #expect(okBad.values == [false])
    #expect(okGood.values == [true])
}

@Test func maxConcurrentRespected() async throws {
    let mock = MockService(delays: [0.05, 0.05, 0.05, 0.05])
    let q = TranslationQueue(service: mock, maxConcurrent: 2)
    let group = DispatchGroup()
    for t in ["a", "b", "c", "d"] {
        group.enter()
        await q.enqueue(t, from: Locale.Language(languageCode: "en"), to: Locale.Language(languageCode: "es")) { _ in group.leave() }
    }
    await awaitGroup(group)
    #expect(mock.maxObservedConcurrent <= 2)
}

// MARK: - AudioPolicy

@Test func speakersNeverGetEnglishVoice() {
    #expect(AudioPolicy(outputIsHeadphones: false, ttsSpeaking: false).maySpeakEnglishLocally == false)
    #expect(AudioPolicy(outputIsHeadphones: false, ttsSpeaking: true).maySpeakEnglishLocally == false)
}

@Test func headphonesGetEnglishOnlyWhenQuiet() {
    #expect(AudioPolicy(outputIsHeadphones: true, ttsSpeaking: false).maySpeakEnglishLocally == true)
    #expect(AudioPolicy(outputIsHeadphones: true, ttsSpeaking: true).maySpeakEnglishLocally == false)
}

@Test func farSidePausedExactlyWhileTTSSpeaks() {
    #expect(AudioPolicy(outputIsHeadphones: true, ttsSpeaking: true).farSideLanePaused == true)
    #expect(AudioPolicy(outputIsHeadphones: false, ttsSpeaking: true).farSideLanePaused == true)
    #expect(AudioPolicy(outputIsHeadphones: true, ttsSpeaking: false).farSideLanePaused == false)
}
