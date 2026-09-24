import SwiftUI
import WebKit
import Translation
import CallTranslatorCore

@main
struct CallTranslatorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene { Settings { EmptyView() } }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let model = AppModel()
    private var window: NSWindow?
    private var webView: WKWebView?
    private var bridge: HablaBridge?
    private var hotkeys: [Any] = []
    private var shortcut = PushToTalkShortcut()
    private var prepareWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "habla."
        let menu = NSMenu()
        for (title, action) in [("Open Habla", #selector(show)), ("End call and save", #selector(endCall)), ("Open transcripts", #selector(openFolder))] {
            let item = menu.addItem(withTitle: title, action: action, keyEquivalent: ""); item.target = self
        }
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = menu
        model.prepareTranslation = { [weak self] in self?.showTranslationPreparation() }
        show()
        if let monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged], handler: { [weak self] event in
            self?.handleHotkey(event) == true ? nil : event
        }) { hotkeys.append(monitor) }
        if let monitor = NSEvent.addGlobalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged], handler: { [weak self] event in
            _ = self?.handleHotkey(event)
        }) { hotkeys.append(monitor) }
    }
    private func handleHotkey(_ event: NSEvent) -> Bool {
        guard model.callActive else { shortcut.reset(); return false }
        let action = event.type == .flagsChanged
            ? shortcut.modifiers(option: event.modifierFlags.contains(.option))
            : shortcut.key(keyCode: event.keyCode, option: event.modifierFlags.contains(.option), down: event.type == .keyDown, repeatEvent: event.isARepeat)
        guard let action else { return false }
        Task {
            do { if action == .press { try await model.pttDown() } else { model.pttUp() } }
            catch { shortcut.reset(); model.lastError = error.localizedDescription }
        }
        return true
    }
    @objc func show() {
        if window == nil {
            let configuration = WKWebViewConfiguration()
            let bridge = HablaBridge(model: model)
            configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "habla")
            configuration.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "habla-app")
            let view = WKWebView(frame: .zero, configuration: configuration)
            view.navigationDelegate = bridge
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1220, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "Habla"; window.minSize = NSSize(width: 390, height: 600)
            window.isReleasedWhenClosed = false; window.contentView = view; window.center()
            self.window = window; self.webView = view; self.bridge = bridge
            view.load(URLRequest(url: URL(string: "habla-app://bundle/index.html#today")!))
        }
        window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    @objc private func endCall() { model.endCall() }
    @objc private func openFolder() { model.openFolder() }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        model.endCall()
        if model.hasUnsavedCall {
            show(); return .terminateCancel
        }
        model.stopAll(); return .terminateNow
    }
    func applicationDidResignActive(_ notification: Notification) {
        if shortcut.held { shortcut.reset(); model.pttUp() }
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first, url.scheme == "habla", let route = url.host, ["today", "coach", "calls", "missions"].contains(route) else { return }
        show(); webView?.load(URLRequest(url: URL(string: "habla-app://bundle/index.html#\(route)")!))
    }
    private func showTranslationPreparation() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 430, height: 260), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Prepare Spanish translation"; window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: TranslationPreparation())
        prepareWindow = window; window.center(); window.makeKeyAndOrderFront(nil)
    }
}

private struct TranslationPreparation: View {
    @State private var status = "Prepare the Apple English and Spanish language packs for offline translation."
    @State private var configuration: TranslationSession.Configuration?
    var body: some View {
        VStack(spacing: 20) {
            Text("English ⇄ Spanish").font(.title2)
            Text(status).multilineTextAlignment(.center)
            Button("Prepare languages") { configuration = .init(source: .init(identifier: "en"), target: .init(identifier: "es")) }
        }.padding(28).translationTask(configuration) { session in
            do { try await session.prepareTranslation(); status = "Languages are ready. Close this window and refresh readiness in Habla." }
            catch { status = error.localizedDescription }
        }
    }
}

@MainActor
final class HablaBridge: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKDownloadDelegate {
    typealias ExportDestinationChooser = (String, NSWindow?, @escaping (URL?) -> Void) -> Void
    private let model: AppModel
    private let chooseExportDestination: ExportDestinationChooser?
    private let exportDirectory: URL
    private let revealExport: (URL) -> Void
    private var downloads: [ObjectIdentifier: WKDownload] = [:]
    private var exportDestinations: [ObjectIdentifier: URL] = [:]
    private weak var downloadWindow: NSWindow?
    init(model: AppModel, chooseExportDestination: ExportDestinationChooser? = nil, exportDirectory: URL? = nil, revealExport: @escaping (URL) -> Void = { NSWorkspace.shared.activateFileViewerSelecting([$0]) }) {
        self.model = model
        self.chooseExportDestination = chooseExportDestination
        self.exportDirectory = exportDirectory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Habla/Exports", isDirectory: true)
        self.revealExport = revealExport
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        guard BridgePolicy.allows(scheme: origin.protocol, host: origin.host, mainFrame: message.frameInfo.isMainFrame),
              let body = message.body as? [String: Any], JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body), data.count <= 32000 else { replyHandler(nil, "Untrusted app request."); return }
        Task {
            do {
                let command = try BridgePolicy.command(body)
                let payload = body["payload"] as? [String: Any] ?? [:]
                let result = try await model.command(command, payload: payload)
                replyHandler(["ok": true, "result": result], nil)
            } catch { replyHandler(["ok": false, "error": error.localizedDescription], nil) }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let source = navigationAction.sourceFrame.securityOrigin
        if BridgePolicy.allowsDownload(urlScheme: url.scheme ?? "", sourceScheme: source.protocol, sourceHost: source.host, mainFrame: navigationAction.sourceFrame.isMainFrame, requestedDownload: navigationAction.shouldPerformDownload) {
            downloadWindow = webView.window
            decisionHandler(.download); return
        }
        if url.scheme == "habla-app", url.host == "bundle", navigationAction.targetFrame?.isMainFrame == true { decisionHandler(.allow); return }
        if url.scheme == "https", navigationAction.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        downloads[ObjectIdentifier(download)] = download
        download.delegate = self
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let key = ObjectIdentifier(download)
        let ready: (URL?) -> Void = { [weak self] url in
            if let url { self?.exportDestinations[key] = url }
            completionHandler(url)
        }
        if let chooseExportDestination { chooseExportDestination(suggestedFilename, downloadWindow, ready) }
        else {
            do { ready(try Self.exportDestination(suggestedFilename: suggestedFilename, directory: exportDirectory)) }
            catch { model.lastError = "Export was not saved: " + error.localizedDescription; ready(nil) }
        }
    }
    nonisolated static func exportFilename(suggestedFilename: String, now: Date = Date(), identifier: UUID = UUID()) -> String {
        let proposed = URL(fileURLWithPath: suggestedFilename)
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        let rawStem = proposed.deletingPathExtension().lastPathComponent
        let cleaned = String(rawStem.unicodeScalars.prefix(80).map { allowed.contains($0) ? Character(String($0)) : "-" })
        let stem = cleaned.trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        let ext = ["json", "txt", "csv", "md"].contains(proposed.pathExtension.lowercased()) ? proposed.pathExtension.lowercased() : "json"
        let timestamp = ISO8601DateFormatter().string(from: now).replacingOccurrences(of: ":", with: "-")
        return "\(stem.isEmpty ? "habla-export" : stem)-\(timestamp)-\(identifier.uuidString.lowercased()).\(ext)"
    }
    nonisolated static func exportDestination(suggestedFilename: String, directory: URL, now: Date = Date(), identifier: UUID = UUID()) throws -> URL {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let target = directory.appendingPathComponent(exportFilename(suggestedFilename: suggestedFilename, now: now, identifier: identifier))
        guard !FileManager.default.fileExists(atPath: target.path) else { throw CocoaError(.fileWriteFileExists) }
        // WKDownload also refuses an existing destination, protecting the gap
        // between this check and its actual write without replacing any file.
        return target
    }
    func downloadDidFinish(_ download: WKDownload) {
        let key = ObjectIdentifier(download)
        downloads.removeValue(forKey: key)
        guard let url = exportDestinations.removeValue(forKey: key) else { return }
        do {
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
            revealExport(url)
        } catch { model.lastError = "Export saved, but its private file permissions could not be set: " + error.localizedDescription }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        exportDestinations.removeValue(forKey: ObjectIdentifier(download))
        model.lastError = "Export was not saved: " + error.localizedDescription
    }
}

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let resourceRoot: URL?
    init(resourceRoot: URL? = Bundle.main.resourceURL?.appendingPathComponent("HablaWeb")) {
        self.resourceRoot = resourceRoot
        super.init()
    }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        do {
            guard let url = task.request.url, url.scheme == "habla-app", url.host == "bundle", task.request.httpMethod == "GET", let root = resourceRoot else { throw BridgePolicy.BridgeError.invalidResource }
            let file = try BridgePolicy.resource(path: url.path, root: root)
            var data = try Data(contentsOf: file)
            let mime: String
            switch file.pathExtension {
            case "html":
                mime = "text/html"
                let policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' habla-app:; script-src 'self' habla-app:; style-src 'self' 'unsafe-inline' habla-app:; font-src 'self' habla-app:; img-src 'self' data: habla-app:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">"
                data = Data((String(decoding: data, as: UTF8.self).replacingOccurrences(of: "<head>", with: "<head>" + policy)).utf8)
            case "js": mime = "text/javascript"
            case "css": mime = "text/css"
            case "svg": mime = "image/svg+xml"
            case "woff2": mime = "font/woff2"
            case "png": mime = "image/png"
            default: mime = "application/octet-stream"
            }
            task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: mime.hasPrefix("text/") ? "utf-8" : nil))
            task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
