import Foundation

public struct TranscriptEntry: Codable, Equatable {
    public let timestamp: Date
    public let speaker: Speaker
    public let original: String
    public let translated: String

    public enum Speaker: String, Codable {
        case him, farSide
    }

    public init(timestamp: Date, speaker: Speaker, original: String, translated: String) {
        self.timestamp = timestamp
        self.speaker = speaker
        self.original = original
        self.translated = translated
    }
}

/// Per-call transcript store. In-memory during the call; atomic JSON+MD flush on end.
public final class TranscriptStore {
    private let directory: URL
    private var calls: [UUID: (started: Date, entries: [TranscriptEntry])] = [:]
    private let queue = DispatchQueue(label: "transcriptstore") // serialize access
    private let encoder: JSONEncoder

    public init(directory: URL) {
        self.directory = directory
        self.encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
    }

    @discardableResult
    public func startCall(now: Date = Date()) -> UUID {
        let id = UUID()
        queue.sync {
            calls[id] = (now, [])
        }
        return id
    }

    public func append(_ entry: TranscriptEntry, callID: UUID) throws {
        try queue.sync {
            guard calls[callID] != nil else { throw StoreError.unknownCall(callID) }
            calls[callID]?.entries.append(entry)
        }
    }

    public func entries(callID: UUID) -> [TranscriptEntry] {
        queue.sync { calls[callID]?.entries ?? [] }
    }

    public func renderMarkdown(callID: UUID) -> String {
        queue.sync {
            guard let call = calls[callID] else { return "" }
            return renderEntries(call.entries, started: call.started)
        }
    }

    private func renderEntries(_ entries: [TranscriptEntry], started: Date) -> String {
        var lines: [String] = ["# Call transcript \(started.description)"]
        for e in entries {
            let offset = offsetString(from: e.timestamp, callStart: started)
            let who = e.speaker == .him ? "HIM (EN)" : "THEM (ES)"
            lines.append("## [\(offset)] \(who): \(e.original)")
            lines.append("> \(e.translated)")
            lines.append("")
        }
        return lines.joined(separator: "\n")
    }

    /// Atomically writes <ISO-date>-<short-id>.json + .md. Throws on failure; target files never partial.
    public func flush(callID: UUID) throws {
        // The ENTIRE publish sequence (invalidate → stage → replace) runs inside
        // the serialization queue: concurrent flush calls would otherwise share
        // the same staging paths and interleave their replaceItemAt calls.
        try queue.sync {
            guard let call = calls[callID] else { throw StoreError.unknownCall(callID) }
            let payload = Payload(started: call.started, entries: call.entries)
            let data = try encoder.encode(payload)
            let md = renderMarkdownLocked(callID: callID)
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd"
            df.timeZone = .current
            let baseName = "\(df.string(from: call.started))-\(callID.uuidString.prefix(8))"
            try Self.publish(data, markdown: md, baseName: baseName, to: directory)
        }
    }

    private static let sharedManifestEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private static func publish(_ json: Data, markdown: String, baseName: String, to directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let jsonURL = directory.appendingPathComponent("\(baseName).json")
        let mdURL = directory.appendingPathComponent("\(baseName).md")
        let manifestURL = directory.appendingPathComponent("\(baseName).manifest.json")
        let tmpJSON = directory.appendingPathComponent(".\(baseName).json.staging")
        let tmpMD = directory.appendingPathComponent(".\(baseName).md.staging")
        let tmpManifest = directory.appendingPathComponent(".\(baseName).manifest.staging")
        // Fail-closed invalidation: every manifest-removal error aborts BEFORE any
        // payload write, except a genuinely absent manifest (first flush). This
        // exact-error match (not a fileExists pre-check) also avoids a TOCTOU where
        // the manifest disappears between check and remove.
        do {
            try FileManager.default.removeItem(at: manifestURL)
        } catch let nsError as NSError where nsError.domain == NSCocoaErrorDomain && nsError.code == NSFileNoSuchFileError {
            // first flush: Cocoa's canonical not-found. Domain AND code are both
            // required ; NSPOSIXErrorDomain also admits code 4 (EINTR), which must
            // NOT be treated as "manifest absent" (stage-5 finding).
        } catch {
            throw StoreError.invalidationFailed(underlying: error)
        }
        for stale in [tmpJSON, tmpMD, tmpManifest] { try? FileManager.default.removeItem(at: stale) }
        do {
            try json.write(to: tmpJSON)
            try Data(markdown.utf8).write(to: tmpMD)
            let manifest = try Self.sharedManifestEncoder.encode(Manifest(files: ["\(baseName).json", "\(baseName).md"]))
            try manifest.write(to: tmpManifest)
            _ = try FileManager.default.replaceItemAt(jsonURL, withItemAt: tmpJSON)
            _ = try FileManager.default.replaceItemAt(mdURL, withItemAt: tmpMD)
            _ = try FileManager.default.replaceItemAt(manifestURL, withItemAt: tmpManifest)
        } catch {
            // Clean only our staging files; whatever was published stays, and the
            // manifest is already gone, so the bundle reads as incomplete.
            try? FileManager.default.removeItem(at: tmpJSON)
            try? FileManager.default.removeItem(at: tmpMD)
            try? FileManager.default.removeItem(at: tmpManifest)
            throw error
        }
    }

    private func renderMarkdownLocked(callID: UUID) -> String {
        guard let call = calls[callID] else { return "" }
        return renderEntries(call.entries, started: call.started)
    }

    private func offsetString(from date: Date, callStart: Date) -> String {
        let s = max(0, Int(date.timeIntervalSince(callStart)))
        return String(format: "%02d:%02d", s / 60, s % 60)
    }


    public enum StoreError: Error, Equatable {
        case unknownCall(UUID)
        case invalidationFailed(underlying: Error)

        public static func == (lhs: StoreError, rhs: StoreError) -> Bool {
            switch (lhs, rhs) {
            case let (.unknownCall(a), .unknownCall(b)): return a == b
            case (.invalidationFailed, .invalidationFailed): return true
            default: return false
            }
        }
    }

    private struct Manifest: Codable {
        let files: [String]
    }

    private struct Payload: Codable {
        let started: Date
        let entries: [TranscriptEntry]
    }
}
