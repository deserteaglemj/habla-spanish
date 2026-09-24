import Foundation
import CoreFoundation

public enum BridgePolicy {
    public static let commands: Set<String> = ["snapshot", "permissions", "prepareTranslation", "startCall", "endCall", "pttDown", "pttUp", "translateText", "coachReply", "coachMicStart", "coachMicStop", "stopSpeech", "speak", "openTranscriptFolder"]
    public static func allows(scheme: String, host: String, mainFrame: Bool) -> Bool {
        mainFrame && scheme == "habla-app" && host == "bundle"
    }
    public static func allowsDownload(urlScheme: String, sourceScheme: String, sourceHost: String, mainFrame: Bool, requestedDownload: Bool) -> Bool {
        requestedDownload && urlScheme == "blob" && allows(scheme: sourceScheme, host: sourceHost, mainFrame: mainFrame)
    }
    public static func resource(path: String, root: URL) throws -> URL {
        let decoded = path.removingPercentEncoding ?? path
        let parts = decoded.split(separator: "/")
        guard !parts.contains(where: { $0.hasPrefix(".") || $0.contains("\\") }), !decoded.contains("\0") else { throw BridgeError.invalidResource }
        let base = root.resolvingSymlinksInPath().standardizedFileURL
        let target = base.appendingPathComponent(decoded == "/" ? "index.html" : decoded).resolvingSymlinksInPath().standardizedFileURL
        guard target.path.hasPrefix(base.path + "/") else { throw BridgeError.invalidResource }
        return target
    }
    public static func command(_ body: [String: Any]) throws -> String {
        guard let version = body["version"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(), version.doubleValue == 1,
              let command = body["command"] as? String, commands.contains(command),
              Set(body.keys).isSubset(of: ["version", "command", "payload"]),
              body["payload"] == nil || body["payload"] is [String: Any] else { throw BridgeError.invalidCommand }
        return command
    }
    public static func text(_ body: [String: Any], key: String, limit: Int = 8000, allowEmpty: Bool = false) throws -> String {
        guard let value = body[key] as? String, value.utf8.count <= limit,
              allowEmpty || !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw BridgeError.invalidPayload }
        return value
    }
    public enum BridgeError: LocalizedError {
        case invalidResource, invalidCommand, invalidPayload
        public var errorDescription: String? { "Habla rejected an invalid app request." }
    }
}

public struct PushToTalkShortcut {
    public enum Action: Equatable { case press, release }
    public private(set) var held = false
    public init() {}
    public mutating func key(keyCode: UInt16, option: Bool, down: Bool, repeatEvent: Bool) -> Action? {
        guard keyCode == 49 else { return nil }
        if !down, held { held = false; return .release }
        guard down, option, !repeatEvent, !held else { return nil }
        held = true; return .press
    }
    public mutating func modifiers(option: Bool) -> Action? {
        guard held, !option else { return nil }
        held = false; return .release
    }
    public mutating func reset() { held = false }
}
