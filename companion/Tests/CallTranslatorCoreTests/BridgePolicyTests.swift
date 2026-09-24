import Testing
import Foundation
@testable import CallTranslatorCore

@Test func bridgeRejectsRemoteAndSubframeMessages() {
    #expect(BridgePolicy.allows(scheme: "habla-app", host: "bundle", mainFrame: true))
    #expect(!BridgePolicy.allows(scheme: "https", host: "habla-spanish-nu.vercel.app", mainFrame: true))
    #expect(!BridgePolicy.allows(scheme: "habla-app", host: "bundle", mainFrame: false))
    #expect(!BridgePolicy.allows(scheme: "habla-app", host: "other", mainFrame: true))
}

@Test func bundledResourcesCannotEscapeRoot() throws {
    let root = URL(fileURLWithPath: "/tmp/habla-bundle")
    #expect(try BridgePolicy.resource(path: "/assets/main.js", root: root).path == "/tmp/habla-bundle/assets/main.js")
    #expect(throws: (any Error).self) { try BridgePolicy.resource(path: "/../secret", root: root) }
    #expect(throws: (any Error).self) { try BridgePolicy.resource(path: "/%2e%2e/secret", root: root) }
    #expect(throws: (any Error).self) { try BridgePolicy.resource(path: "/.env", root: root) }
}

@Test func bridgeBoundsCommandsAndText() throws {
    #expect(try BridgePolicy.command(["version": 1, "command": "snapshot"]) == "snapshot")
    #expect(throws: (any Error).self) { try BridgePolicy.command(["version": 2, "command": "snapshot"]) }
    #expect(throws: (any Error).self) { try BridgePolicy.command(["version": 1, "command": "exec"]) }
    #expect(throws: (any Error).self) { try BridgePolicy.text(["text": String(repeating: "a", count: 9000)], key: "text") }
}

@Test func bridgeRejectsBooleanVersionAndMalformedPayload() {
    #expect(throws: (any Error).self) { try BridgePolicy.command(["version": true, "command": "snapshot"]) }
    #expect(throws: (any Error).self) { try BridgePolicy.command(["version": 1, "command": "snapshot", "payload": "invalid"]) }
}

@Test func nativeDownloadRequiresTrustedMainFrameBlob() {
    #expect(BridgePolicy.allowsDownload(urlScheme: "blob", sourceScheme: "habla-app", sourceHost: "bundle", mainFrame: true, requestedDownload: true))
    #expect(!BridgePolicy.allowsDownload(urlScheme: "https", sourceScheme: "habla-app", sourceHost: "bundle", mainFrame: true, requestedDownload: true))
    #expect(!BridgePolicy.allowsDownload(urlScheme: "blob", sourceScheme: "https", sourceHost: "example.com", mainFrame: true, requestedDownload: true))
    #expect(!BridgePolicy.allowsDownload(urlScheme: "blob", sourceScheme: "habla-app", sourceHost: "bundle", mainFrame: false, requestedDownload: true))
}

@Test func shortcutReleasesWhenOptionIsReleasedBeforeSpace() {
    var shortcut = PushToTalkShortcut()
    let down = shortcut.key(keyCode: 49, option: true, down: true, repeatEvent: false)
    #expect(down == .press)
    let up = shortcut.key(keyCode: 49, option: false, down: false, repeatEvent: false)
    #expect(up == .release)
    #expect(!shortcut.held)
    let ordinary = shortcut.key(keyCode: 49, option: false, down: true, repeatEvent: false)
    #expect(ordinary == nil)
}

@Test func shortcutModifierReleaseCancelsHeldCapture() {
    var shortcut = PushToTalkShortcut()
    _ = shortcut.key(keyCode: 49, option: true, down: true, repeatEvent: false)
    let release = shortcut.modifiers(option: false)
    #expect(release == .release)
    let duplicate = shortcut.key(keyCode: 49, option: false, down: false, repeatEvent: false)
    #expect(duplicate == nil)
}
