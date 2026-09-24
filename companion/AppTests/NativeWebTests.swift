import AppKit
import Foundation
import Testing
import WebKit
import CallTranslatorCore
@testable import CallTranslatorApp

@Test func nativeExportFilenameIsSafeAndUnique() {
    let name = HablaBridge.exportFilename(suggestedFilename: "../../private\\name.json", now: Date(timeIntervalSince1970: 0), identifier: UUID())
    #expect(name.hasSuffix(".json"))
    #expect(!name.contains("/"))
    #expect(!name.contains("\\"))
    #expect(!name.hasPrefix("."))
    let other = HablaBridge.exportFilename(suggestedFilename: "../../private\\name.json", now: Date(timeIntervalSince1970: 0), identifier: UUID())
    #expect(name != other)
}

@Test func nativeExportDestinationStaysInPrivateDirectoryAndNeverOverwrites() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("habla-export-path-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let id = UUID(), date = Date(timeIntervalSince1970: 0)
    let path = try HablaBridge.exportDestination(suggestedFilename: "../habla.json", directory: root, now: date, identifier: id)
    #expect(path.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL)
    try Data("existing".utf8).write(to: path)
    #expect(throws: (any Error).self) { try HablaBridge.exportDestination(suggestedFilename: "../habla.json", directory: root, now: date, identifier: id) }
    #expect(try String(contentsOf: path, encoding: .utf8) == "existing")
    let permissions = try FileManager.default.attributesOfItem(atPath: root.path)[.posixPermissions] as? NSNumber
    #expect(permissions?.intValue == 0o700)
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["HABLA_WEB_ROOT"] != nil))
@MainActor func nativeBundledWebRendersStoresProgressAndReachesBridge() async throws {
    _ = NSApplication.shared
    let path = try #require(ProcessInfo.processInfo.environment["HABLA_WEB_ROOT"])
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.setURLSchemeHandler(BundleSchemeHandler(resourceRoot: URL(fileURLWithPath: path)), forURLScheme: "habla-app")
    let destination = FileManager.default.temporaryDirectory.appendingPathComponent("habla-export-probe-\(UUID().uuidString).txt")
    let model = AppModel()
    let bridge = HablaBridge(model: model, chooseExportDestination: { _, _, completion in
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { completion(destination) }
    }, revealExport: { _ in })
    configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "habla")
    let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 800), configuration: configuration)
    view.navigationDelegate = bridge
    view.load(URLRequest(url: URL(string: "habla-app://bundle/index.html#coach")!))
    var rendered = false
    for _ in 0..<100 {
        try await Task.sleep(nanoseconds: 100_000_000)
        rendered = (try? await view.evaluateJavaScript("document.querySelector('#root')?.children.length > 0")) as? Bool == true
        if rendered { break }
    }
    #expect(rendered)
    let storage = try await view.evaluateJavaScript("localStorage.setItem('habla.native.probe', 'ok'); localStorage.getItem('habla.native.probe')") as? String
    #expect(storage == "ok")
    let reply = try await view.callAsyncJavaScript("return await window.webkit.messageHandlers.habla.postMessage({version: 1, command: 'snapshot'});", arguments: [:], in: nil, contentWorld: .page) as? [String: Any]
    #expect(reply?["ok"] as? Bool == true)
    let result = reply?["result"] as? [String: Any]
    #expect(result?["version"] as? Int == 1)
    print("HABLA_WEB_PROBE: rendered=\(rendered), storage=\(storage ?? "missing"), bridge=\(reply?["ok"] ?? false)")
    _ = try? await view.evaluateJavaScript("localStorage.removeItem('habla.native.probe')")
    _ = try await view.evaluateJavaScript("var a = document.createElement('a'); var exportURL = URL.createObjectURL(new Blob(['habla-native-export'], {type:'text/plain'})); a.href = exportURL; a.download = 'habla-export.txt'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(exportURL), 1000);")
    var saved = false
    for _ in 0..<50 {
        saved = (try? String(contentsOf: destination, encoding: .utf8)) == "habla-native-export"
        if saved || model.lastError != nil { break }
        try await Task.sleep(nanoseconds: 100_000_000)
    }
    #expect(model.lastError == nil)
    #expect(saved)
    #expect(try String(contentsOf: destination, encoding: .utf8) == "habla-native-export")
    try? FileManager.default.removeItem(at: destination)
    print("HABLA_DOWNLOAD_PROBE: productionBridgeSaved=\(saved)")
    let exportDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("habla-default-export-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: exportDirectory) }
    var revealed: [URL] = []
    let defaultBridge = HablaBridge(model: model, exportDirectory: exportDirectory, revealExport: { revealed.append($0) })
    view.navigationDelegate = defaultBridge
    for index in 1...2 {
        _ = try await view.evaluateJavaScript("var b = document.createElement('a'); b.href = URL.createObjectURL(new Blob(['private export \(index)'], {type:'application/json'})); b.download = 'habla-conversation.json'; document.body.append(b); b.click(); b.remove();")
        for _ in 0..<50 {
            if revealed.count == index || model.lastError != nil { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
    }
    #expect(revealed.count == 2)
    #expect(model.lastError == nil)
    if revealed.count == 2 {
        #expect(revealed[0] != revealed[1])
        #expect(try String(contentsOf: revealed[0], encoding: .utf8) == "private export 1")
        #expect(try String(contentsOf: revealed[1], encoding: .utf8) == "private export 2")
    }
    print("HABLA_DEFAULT_EXPORT_PROBE: uniqueExportsRevealed=\(revealed.count)")
}
