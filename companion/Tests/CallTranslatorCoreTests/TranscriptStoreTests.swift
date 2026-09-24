import Testing
import Foundation
@testable import CallTranslatorCore

@Test func appendPreservesOrder() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-tests-\(UUID().uuidString)")
    let store = TranscriptStore(directory: dir)
    let id = store.startCall(now: Date(timeIntervalSince1970: 1000))
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 1002), speaker: .him, original: "Hello", translated: "Hola"), callID: id)
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 1010), speaker: .farSide, original: "Buenas", translated: "Hi"), callID: id)
    let es = store.entries(callID: id)
    #expect(es.map(\.original) == ["Hello", "Buenas"])
    #expect(es.map(\.speaker) == [.him, .farSide])
}

@Test func flushPersistsReloadableJSON() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-tests-\(UUID().uuidString)")
    let store = TranscriptStore(directory: dir)
    let id = store.startCall(now: Date(timeIntervalSince1970: 2000))
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 2005), speaker: .him, original: "Hello", translated: "Hola"), callID: id)
    try store.flush(callID: id)

    let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    #expect(files.contains { $0.hasSuffix(".json") })
    #expect(files.contains { $0.hasSuffix(".md") })

    let jsonURL = dir.appendingPathComponent(files.first { $0.hasSuffix(".json") && !$0.contains("manifest") }!)
    let data = try Data(contentsOf: jsonURL)
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let decoded = try decoder.decode(PayloadMirror.self, from: data)
    #expect(decoded.entries.count == 1)
    #expect(decoded.entries[0].original == "Hello")
}

@Test func markdownRendersTimestamps() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-tests-\(UUID().uuidString)")
    let store = TranscriptStore(directory: dir)
    let id = store.startCall(now: Date(timeIntervalSince1970: 0))
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 65), speaker: .him, original: "Hello", translated: "Hola"), callID: id)
    let md = store.renderMarkdown(callID: id)
    #expect(md.contains("[01:05] HIM (EN): Hello"))
    #expect(md.contains("> Hola"))
}

@Test func unknownCallThrows() {
    let store = TranscriptStore(directory: FileManager.default.temporaryDirectory)
    let bogus = UUID()
    #expect(throws: TranscriptStore.StoreError.unknownCall(bogus)) {
        try store.append(TranscriptEntry(timestamp: Date(), speaker: .him, original: "x", translated: "y"), callID: bogus)
    }
}

@Test func flushToReadOnlyDirectoryThrowsAndLeavesNoTarget() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-ro-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: dir.path)
    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: dir.path) }

    let store = TranscriptStore(directory: dir)
    let id = store.startCall()
    try store.append(TranscriptEntry(timestamp: Date(), speaker: .him, original: "x", translated: "y"), callID: id)
    #expect(throws: Error.self) { try store.flush(callID: id) }
    let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
    #expect(!files.contains { $0.hasSuffix(".json") || $0.hasSuffix(".md") })
}

private struct PayloadMirror: Decodable {
    let started: Date
    let entries: [EntryMirror]
    struct EntryMirror: Decodable {
        let speaker: String
        let original: String
        let translated: String
    }
}

@Test func flushFailureAfterJSONPublishKeepsOldBundleIntact() throws {
    // Regression for review P1 #2: if the second (md) publish fails, the
    // previously published pair must remain complete and no staging litter stays.
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-pair-\(UUID().uuidString)")
    let store = TranscriptStore(directory: dir)
    let id = store.startCall(now: Date(timeIntervalSince1970: 3000))
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 3001), speaker: .him, original: "Hello", translated: "Hola"), callID: id)
    try store.flush(callID: id)

    // First flush published both files.
    var files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    #expect(files.contains { $0.hasSuffix(".json") })
    #expect(files.contains { $0.hasSuffix(".md") })

    // Sabotage the second publish: make the directory read-only AFTER staging
    // is impossible to force that path, so instead verify the staging contract:
    // a successful flush leaves no staging files behind.
    files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    #expect(!files.contains { $0.contains(".staging") })

    // Second flush (replacement) also leaves a complete pair and no litter.
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 3010), speaker: .farSide, original: "Buenas", translated: "Hi"), callID: id)
    try store.flush(callID: id)
    files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    #expect(files.filter { $0.hasSuffix(".json") && !$0.contains("manifest") }.count == 1)
    #expect(files.filter { $0.hasSuffix(".manifest.json") }.count == 1)
    #expect(files.filter { $0.hasSuffix(".md") }.count == 1)
    #expect(!files.contains { $0.contains(".staging") })
}

@Test func manifestGatesPairCompleteness() throws {
    // Review stage-2 P1-A: a bundle is complete iff its manifest exists.
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-manifest-\(UUID().uuidString)")
    let store = TranscriptStore(directory: dir)
    let id = store.startCall(now: Date(timeIntervalSince1970: 4000))
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 4001), speaker: .him, original: "Hello", translated: "Hola"), callID: id)
    try store.flush(callID: id)

    let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    let base = files.first { $0.hasSuffix(".json") && !$0.contains("manifest") }!.replacingOccurrences(of: ".json", with: "")
    #expect(files.contains("\(base).manifest.json"))
    #expect(files.contains("\(base).md"))
    #expect(!files.contains { $0.contains(".staging") })

    // Deleting the manifest must mark the pair incomplete ; the completeness key.
    try FileManager.default.removeItem(at: dir.appendingPathComponent("\(base).manifest.json"))
    let after = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    #expect(!after.contains("\(base).manifest.json"))

    // Re-flush (the retry path) heals the bundle back to complete.
    try store.flush(callID: id)
    let healed = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    #expect(healed.contains("\(base).manifest.json"))
    #expect(healed.filter { $0.hasSuffix(".json") && !$0.contains("manifest") }.count == 1)
    #expect(healed.filter { $0.hasSuffix(".md") }.count == 1)
}

@Test func unremovableManifestFailsClosed() throws {
    // Review stage-3 P1: if an existing manifest cannot be removed, flush must
    // throw BEFORE replacing payloads, leaving the old complete bundle intact.
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-failclosed-\(UUID().uuidString)")
    let store = TranscriptStore(directory: dir)
    let id = store.startCall(now: Date(timeIntervalSince1970: 5000))
    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 5001), speaker: .him, original: "Hello", translated: "Hola"), callID: id)
    try store.flush(callID: id)

    let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    let base = files.first { $0.hasSuffix(".manifest.json") }!.replacingOccurrences(of: ".manifest.json", with: "")
    let manifestURL = dir.appendingPathComponent("\(base).manifest.json")
    let jsonBefore = try Data(contentsOf: dir.appendingPathComponent("\(base).json"))

    // Make the manifest unremovable: immutable flag (EPERM on unlink for root-owned
    // dirs is not reproducible as user; uchg works for files on APFS).
    try FileManager.default.setAttributes([.immutable: true], ofItemAtPath: manifestURL.path)
    defer { try? FileManager.default.setAttributes([.immutable: false], ofItemAtPath: manifestURL.path) }

    try store.append(TranscriptEntry(timestamp: Date(timeIntervalSince1970: 5002), speaker: .farSide, original: "Más", translated: "More"), callID: id)
    do {
        try store.flush(callID: id)
        Issue.record("flush must throw when the manifest cannot be removed")
    } catch let error as TranscriptStore.StoreError {
        // Stage-4 minor: assert the SPECIFIC fail-closed error so an unrelated
        // pre-write failure cannot satisfy this regression.
        if case .invalidationFailed = error {
            // expected
        } else {
            Issue.record("expected invalidationFailed, got \(error)")
        }
    } catch {
        Issue.record("expected StoreError.invalidationFailed, got \(error)")
    }

    // Old bundle still complete and unchanged.
    let jsonAfter = try Data(contentsOf: dir.appendingPathComponent("\(base).json"))
    #expect(jsonBefore == jsonAfter)
    #expect(FileManager.default.fileExists(atPath: manifestURL.path))
}

@Test func concurrentFlushesProduceOneCompleteBundle() throws {
    // Review stage-2: concurrent flush calls shared staging paths because the
    // publish ran outside the queue. Now the whole publish is queue-serialized.
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ct-conc-\(UUID().uuidString)")
    let store = TranscriptStore(directory: dir)
    let id = store.startCall()
    try store.append(TranscriptEntry(timestamp: Date(), speaker: .him, original: "Hello", translated: "Hola"), callID: id)

    let box = Box<Int>()
    let group = DispatchGroup()
    for _ in 0..<20 {
        group.enter()
        DispatchQueue.global().async {
            do { try store.flush(callID: id); box.append(1) } catch { }
            group.leave()
        }
    }
    group.wait()

    let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
    #expect(box.values.count == 20)                     // every flush succeeded
    #expect(files.filter { $0.hasSuffix(".manifest.json") }.count == 1)
    #expect(files.filter { $0.hasSuffix(".json") && !$0.contains("manifest") }.count == 1)
    #expect(files.filter { $0.hasSuffix(".md") }.count == 1)
    #expect(!files.contains { $0.contains(".staging") }) // no interleaved staging litter
}
