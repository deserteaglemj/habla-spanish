import Foundation
import AppKit
import AVFoundation
import Speech
import CoreAudio
import CallTranslatorCore

/// Capture queues never touch the main-actor model. Replacements are synchronized,
/// and the recognizer itself rejects callbacks from a cancelled stream.
private final class RecognitionForwarder: @unchecked Sendable {
    private let lock = NSLock()
    private weak var recognizer: SpeechRecognizerService?
    private var paused = false
    private var holding = false
    private var backlog = PCMFrameBacklog()
    private var overflow: (() -> Void)?
    func onOverflow(_ action: @escaping () -> Void) { lock.withLock { overflow = action } }
    func set(_ recognizer: SpeechRecognizerService?) {
        lock.withLock {
            self.recognizer = recognizer; holding = false
            if recognizer == nil { _ = backlog.takeAll() }
            else if !paused { for buffer in backlog.takeAll() { recognizer?.feed(buffer) } }
        }
    }
    func beginHolding() -> SpeechRecognizerService? {
        lock.withLock {
            guard !holding else { return nil }
            holding = true
            let prior = recognizer; recognizer = nil
            return prior
        }
    }
    func setPaused(_ value: Bool) {
        lock.withLock {
            paused = value
            if !paused, !holding, let recognizer { for buffer in backlog.takeAll() { recognizer.feed(buffer) } }
        }
    }
    func feed(_ buffer: AVAudioPCMBuffer) {
        let failure: (() -> Void)? = lock.withLock {
            guard !paused else { return nil }
            if holding {
                guard backlog.append(buffer) else { paused = true; return overflow }
            } else { recognizer?.feed(buffer) }
            return nil
        }
        failure?()
    }
}

@MainActor
final class AppModel {
    var state = "idle"
    var lastError: String?
    var prepareTranslation: (() -> Void)?
    private(set) var callActive = false
    private var startingCall = false
    var hasUnsavedCall: Bool { pendingStore != nil }
    private var startedAt = Date()
    private var callGeneration = UUID()
    private var turnGeneration = UUID()
    private var nearDraft = ""
    private var nearFinalWaitingForRelease: String?
    private var farDraft = ""
    private var coachDraft = ""
    private var coachFinal = false
    private var coachListening = false
    private var coachFinalizing = false
    private var coachGeneration = UUID()
    private var coachCaptureError: String?
    private var farLevel: Double = 0
    private var inputID: AudioDeviceID = 0
    private var injectionID: AudioDeviceID = 0
    private var processID: AudioObjectID = 0
    private let farForwarder = RecognitionForwarder()
    private var lines: [CallLine] = []
    private let translation = AppleTranslationService()
    private lazy var queue = TranslationQueue(service: translation)
    private let coach = AppleCoachService()
    private let localSpeech = SynthesisService()
    private let routedSpeech = RoutedSpeechService()
    private var near: SpeechRecognizerService?
    private var far: SpeechRecognizerService?
    private var coachRecognizer: SpeechRecognizerService?
    private var mic: MicCapture?
    private var farCapture: FarSideCapture?
    private var turnTask: Task<Void, Never>?
    private var finalTimeout: Task<Void, Never>?
    private var farRestart: Task<Void, Never>?
    private var farSegmenter = SpeechSegmenter()
    private var farFinalizing = false
    private var farFailures = 0
    private var farPendingTranslations = 0
    private var pendingStore: (TranscriptStore, UUID)?
    private lazy var orchestrator = TurnOrchestrator(onStateChange: { [weak self] phase in
        self?.state = String(describing: phase)
    }, ttsStopRequested: { [weak self] in self?.routedSpeech.stop() })

    struct CallLine {
        let id: UUID
        let at: Date
        let side: String
        let original: String
        var translated: String
        var status: String
        var json: [String: Any] { ["id": id.uuidString, "at": ISO8601DateFormatter().string(from: at), "side": side, "original": original, "translated": translated, "status": status] }
    }
    struct AppError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }
    func command(_ command: String, payload: [String: Any]) async throws -> [String: Any] {
        switch command {
        case "snapshot": return await snapshot()
        case "permissions":
            let micAllowed = await AVCaptureDevice.requestAccess(for: .audio)
            let speech = await SpeechRecognizerService(localeIdentifier: "es-MX").requestAuth()
            return ["microphone": micAllowed, "speech": speech]
        case "prepareTranslation": prepareTranslation?(); return [:]
        case "startCall": try await startCall(payload); return [:]
        case "endCall": endCall(); if let lastError { throw AppError(message: lastError) }; return [:]
        case "pttDown": try await pttDown(); return [:]
        case "pttUp": pttUp(); return [:]
        case "translateText":
            let text = try BridgePolicy.text(payload, key: "text")
            let direction = payload["direction"] as? String ?? "en-es"
            guard ["en-es", "es-en"].contains(direction) else { throw BridgePolicy.BridgeError.invalidPayload }
            return ["text": try await translation.translate(text, from: .init(identifier: direction == "en-es" ? "en" : "es"), to: .init(identifier: direction == "en-es" ? "es" : "en"))]
        case "coachReply":
            guard !callActive, !coachListening, !coachFinalizing else { throw AppError(message: "Finish microphone capture or end your call first.") }
            let text = try BridgePolicy.text(payload, key: "text", limit: 2000)
            let topic = try BridgePolicy.text(payload, key: "topic", limit: 200, allowEmpty: true)
            let memory = try BridgePolicy.text(payload, key: "memory", limit: 700, allowEmpty: true)
            let level = try BridgePolicy.text(payload, key: "level", limit: 2)
            guard ["A1", "A2", "B1"].contains(level), let raw = payload["history"] as? [[String: Any]], raw.count <= 8 else { throw BridgePolicy.BridgeError.invalidPayload }
            let history = try raw.map { item -> CoachTurn in
                guard let role = item["role"] as? String, let roleValue = CoachTurn.Role(rawValue: role) else { throw BridgePolicy.BridgeError.invalidPayload }
                return CoachTurn(role: roleValue, text: try BridgePolicy.text(item, key: "text", limit: 4000))
            }
            let reply = try await coach.reply(text: text, topic: topic, level: level, history: history, memory: memory)
            return ["text": reply.text, "memory": reply.memory]
        case "coachMicStart": try startCoachMic(payload); return [:]
        case "coachMicStop":
            return try await stopCoachMic()
        case "stopSpeech":
            localSpeech.stop(); coach.cancel(); return [:]
        case "speak":
            guard !callActive, !coachListening, !coachFinalizing else { throw AppError(message: "Finish listening before playing a reply.") }
            let text = try BridgePolicy.text(payload, key: "text")
            localSpeech.stop()
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "es-MX")
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
            localSpeech.speak(utterance); return [:]
        case "openTranscriptFolder": openFolder(); return [:]
        default: throw BridgePolicy.BridgeError.invalidCommand
        }
    }
    func snapshot() async -> [String: Any] {
        let ai = coach.availability
        let languages = await translation.availability()
        var value: [String: Any] = ["version": 1, "coach": ["available": ai.available, "reason": ai.reason ?? ""], "translation": ["available": languages.available, "reason": languages.reason ?? ""], "callActive": callActive, "state": state, "error": lastError ?? "", "nearDraft": nearDraft, "farDraft": farDraft, "coachDraft": coachDraft, "coachFinal": coachFinal, "coachListening": coachListening, "speaking": localSpeech.speaking, "farLevel": farLevel, "lines": lines.suffix(80).map(\.json), "microphonePermission": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized, "speechPermission": SFSpeechRecognizer.authorizationStatus() == .authorized]
        do {
            let devices = try AudioDevices.snapshot()
            let data = try JSONEncoder().encode(devices)
            value["devices"] = try JSONSerialization.jsonObject(with: data)
        } catch { value["deviceError"] = error.localizedDescription }
        return value
    }
    private func requirePermissions() throws {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized, SFSpeechRecognizer.authorizationStatus() == .authorized else { throw AppError(message: "Allow microphone and speech access using the permissions button first.") }
    }
    private func deviceID(_ payload: [String: Any], key: String) throws -> AudioDeviceID {
        guard let number = payload[key] as? NSNumber, number.doubleValue > 0, number.doubleValue <= Double(UInt32.max), number.doubleValue.rounded() == number.doubleValue else { throw BridgePolicy.BridgeError.invalidPayload }
        return number.uint32Value
    }
    private func startCoachMic(_ payload: [String: Any]) throws {
        guard !callActive, !hasUnsavedCall else { throw AppError(message: "End and save the call before starting a conversation.") }
        try requirePermissions()
        let devices = try AudioDevices.snapshot()
        let selected = (payload["inputID"] as? NSNumber)?.uint32Value ?? devices.inputs.first(where: { !$0.isVirtual })?.id ?? 0
        guard devices.inputs.contains(where: { $0.id == selected && !$0.isVirtual }) else { throw AppError(message: "Choose a physical microphone.") }
        coach.cancel(); localSpeech.stop(); mic?.stop(); coachRecognizer?.cancelStream()
        coachGeneration = UUID(); let generation = coachGeneration
        coachDraft = ""; coachFinal = false; coachFinalizing = false; coachCaptureError = nil
        let recognizer = SpeechRecognizerService(localeIdentifier: "es-MX")
        recognizer.onPartial = { [weak self] text in guard self?.coachGeneration == generation else { return }; self?.coachDraft = text }
        recognizer.onFinal = { [weak self] text in
            guard self?.coachGeneration == generation else { return }
            self?.coachDraft = text; self?.coachFinal = true; self?.coachListening = false; self?.mic?.stop(); self?.mic = nil
        }
        recognizer.onError = { [weak self] error in
            guard self?.coachGeneration == generation else { return }
            self?.coachCaptureError = error.localizedDescription
            self?.lastError = error.localizedDescription; self?.coachListening = false; self?.mic?.stop(); self?.mic = nil
        }
        recognizer.prepare(); try recognizer.startStream()
        let capture = MicCapture(onBuffer: { [weak recognizer] buffer in recognizer?.feed(buffer) }, onError: { [weak self, weak recognizer] error in
            guard self?.coachGeneration == generation else { return }
            recognizer?.cancelStream(); self?.coachCaptureError = error.localizedDescription
            self?.lastError = error.localizedDescription; self?.coachListening = false
        })
        do { try capture.start(deviceID: selected) } catch { recognizer.cancelStream(); throw error }
        coachRecognizer = recognizer; mic = capture; coachListening = true; lastError = nil
    }
    private func stopCoachMic() async throws -> [String: Any] {
        guard !callActive else { throw AppError(message: "End the call before using conversation microphone controls.") }
        let generation = coachGeneration
        mic?.stop(); mic = nil; coachListening = false
        guard let recognizer = coachRecognizer else { return ["text": coachDraft, "final": coachFinal] }
        coachFinalizing = true
        recognizer.finishStream()
        let deadline = Date().addingTimeInterval(8)
        do {
            while !coachFinal, coachCaptureError == nil, Date() < deadline, coachGeneration == generation {
                try await Task.sleep(nanoseconds: 50_000_000)
            }
        } catch {
            if coachGeneration == generation {
                recognizer.cancelStream(); coachGeneration = UUID(); coachFinalizing = false
            }
            throw error
        }
        guard coachGeneration == generation else { throw CancellationError() }
        if !coachFinal {
            recognizer.cancelStream(); coachGeneration = UUID()
            lastError = coachCaptureError ?? "Speech did not finalize. Review the draft before sending it."
        }
        coachFinalizing = false; coachRecognizer = nil
        return ["text": coachDraft, "final": coachFinal]
    }
    private func startCall(_ payload: [String: Any]) async throws {
        guard !callActive, !hasUnsavedCall, !startingCall else { throw AppError(message: "Finish current call setup, or end and save the current call before starting another.") }
        startingCall = true
        defer { startingCall = false }
        let setupGeneration = callGeneration
        guard payload["consent"] as? Bool == true else { throw AppError(message: "Confirm that everyone knows translation and a local transcript are enabled.") }
        try requirePermissions()
        let devices = try AudioDevices.snapshot()
        let input = try deviceID(payload, key: "inputID")
        let injection = try deviceID(payload, key: "injectionID")
        let process = try deviceID(payload, key: "processID")
        guard let inputDevice = devices.inputs.first(where: { $0.id == input }), devices.virtualOutputs.contains(where: { $0.id == injection && $0.name.localizedCaseInsensitiveContains("BlackHole") }), let processDevice = devices.processes.first(where: { $0.id == process }) else { throw AppError(message: "Refresh devices and choose your physical microphone, BlackHole and call app.") }
        try IsolatedAudioRouting.validate(microphoneID: input, microphoneIsVirtual: inputDevice.isVirtual,
                                          injectionID: injection, callOutputDeviceIDs: processDevice.outputDeviceIDs)
        try AudioDevices.validateFarRoute(processID: process, injectionID: injection)
        guard payload["physicalOutputConfirmed"] as? Bool == true else { throw AppError(message: "Set the calling app speaker to physical speakers or headphones, never the virtual device.") }
        let readiness = await translation.availability()
        guard readiness.available else { throw AppError(message: readiness.reason ?? "Prepare translation languages first.") }
        guard callGeneration == setupGeneration, !callActive, !hasUnsavedCall else { throw AppError(message: "Call setup was cancelled or another call needs saving.") }
        stopAll()
        inputID = input; injectionID = injection; processID = process; lines = []; nearDraft = ""; farDraft = ""; lastError = nil
        startedAt = Date(); callGeneration = UUID(); callActive = true; state = "idle"; farFailures = 0
        do {
            try startFarRecognition()
            let forwarding = farForwarder, generation = callGeneration
            forwarding.onOverflow { [weak self] in
                DispatchQueue.main.async {
                    guard let self, self.callGeneration == generation else { return }
                    self.stopAll(); self.lastError = "Call recognition fell behind and was paused. End and save the call before restarting."; self.state = "audio paused"
                }
            }
            forwarding.setPaused(false)
            let capture = FarSideCapture(onBuffer: { buffer in forwarding.feed(buffer) }, onLevel: { [weak self] level in
                Task { @MainActor in
                    guard let self, self.callGeneration == generation else { return }
                    self.farLevel = level
                    if !self.farFinalizing, !self.routedSpeech.speaking {
                        switch self.farSegmenter.observe(level: level, at: ProcessInfo.processInfo.systemUptime, hasText: !self.farDraft.isEmpty) {
                        case .none: break
                        case .finalize:
                            self.farFinalizing = true
                            self.farForwarder.beginHolding()?.finishStream()
                        case .restartEmpty:
                            _ = self.farForwarder.beginHolding()
                            do { try self.startFarRecognition() }
                            catch { self.stopAll(); self.lastError = error.localizedDescription; self.state = "audio paused" }
                        }
                    }
                }
            }, onError: { [weak self] error in
                guard let self, self.callGeneration == generation else { return }
                self.stopAll(); self.lastError = error.localizedDescription; self.state = "audio paused"
            })
            try capture.start(processID: process, injectionDeviceID: injection); farCapture = capture
        } catch { stopAll(); callActive = false; state = "idle"; throw error }
    }
    private func startFarRecognition() throws {
        far?.cancelStream()
        let generation = callGeneration
        let recognizer = SpeechRecognizerService(localeIdentifier: "es-MX")
        recognizer.onPartial = { [weak self] text in
            guard let self, self.callGeneration == generation else { return }
            if !text.isEmpty, self.farDraft != text {
                self.farSegmenter.recognizedTextChanged(at: ProcessInfo.processInfo.systemUptime)
            }
            self.farDraft = text
        }
        recognizer.onFinal = { [weak self] text in
            guard let self, self.callActive, self.callGeneration == generation else { return }
            _ = self.farForwarder.beginHolding(); self.farFinalizing = true; self.farFailures = 0
            self.farDraft = ""; self.translateFar(text, generation: generation); self.restartFar(generation)
        }
        recognizer.onError = { [weak self] error in
            guard let self, self.callActive, self.callGeneration == generation else { return }
            _ = self.farForwarder.beginHolding(); self.farFinalizing = true; self.farFailures += 1
            if !self.farDraft.isEmpty {
                self.lines.append(CallLine(id: UUID(), at: Date(), side: "them", original: self.farDraft, translated: "", status: "unfinished")); self.farDraft = ""
            }
            self.lastError = "Far-side speech: " + error.localizedDescription
            if self.farFailures >= 3 {
                self.stopAll(); self.state = "audio paused"
                self.lastError = "Call recognition failed repeatedly. End and save the call, then check Speech Recognition access."
                return
            }
            self.restartFar(generation, delay: 2_000_000_000)
        }
        recognizer.prepare(); try recognizer.startStream(); far = recognizer
        farSegmenter.reset(); farFinalizing = false; farForwarder.set(recognizer)
    }
    private func restartFar(_ generation: UUID, delay: UInt64 = 150_000_000) {
        farRestart?.cancel()
        farRestart = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard !Task.isCancelled, let self, self.callActive, self.callGeneration == generation else { return }
            do { try self.startFarRecognition() }
            catch { self.stopAll(); self.lastError = error.localizedDescription; self.state = "audio paused" }
        }
    }
    private func translateFar(_ text: String, generation: UUID) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard farPendingTranslations < 4 else {
            lines.append(CallLine(id: UUID(), at: Date(), side: "them", original: text, translated: "", status: "untranslated"))
            lastError = "Translation is behind the conversation. The original speech is retained in the transcript."
            return
        }
        farPendingTranslations += 1
        let id = UUID(); lines.append(CallLine(id: id, at: Date(), side: "them", original: text, translated: "", status: "translating"))
        Task {
            await queue.enqueue(text, from: .init(identifier: "es"), to: .init(identifier: "en")) { [weak self] result in
                Task { @MainActor in
                    guard let self else { return }
                    self.farPendingTranslations = max(0, self.farPendingTranslations - 1)
                    guard self.callActive, self.callGeneration == generation, let index = self.lines.firstIndex(where: { $0.id == id }) else { return }
                    switch result {
                    case .success(let translated): self.lines[index].translated = translated; self.lines[index].status = "translated"
                    case .failure(let error): self.lines[index].status = "untranslated"; self.lastError = error.localizedDescription
                    }
                }
            }
        }
    }
    func pttDown() async throws {
        guard callActive else { throw AppError(message: "Start the call translator first.") }
        guard farCapture?.running == true else { throw AppError(message: "Call audio is paused. End and save this call, then choose an available audio source.") }
        guard orchestrator.state != .capturingHisUtterance else { return }
        turnTask?.cancel(); finalTimeout?.cancel(); routedSpeech.stop(); farForwarder.setPaused(false); mic?.stop(); near?.cancelStream()
        turnGeneration = UUID(); let turn = turnGeneration; let call = callGeneration
        nearDraft = ""; nearFinalWaitingForRelease = nil; orchestrator.handle(.pushToTalkDown)
        let recognizer = SpeechRecognizerService(localeIdentifier: "en-US")
        recognizer.onPartial = { [weak self] text in guard self?.turnGeneration == turn else { return }; self?.nearDraft = text }
        recognizer.onFinal = { [weak self] text in
            guard let self, self.callActive, self.callGeneration == call, self.turnGeneration == turn else { return }
            self.mic?.stop(); self.mic = nil
            if self.orchestrator.state == .capturingHisUtterance {
                self.nearFinalWaitingForRelease = text; self.nearDraft = text
            } else {
                self.processNear(text, call: call, turn: turn)
            }
        }
        recognizer.onError = { [weak self] error in
            guard let self, self.turnGeneration == turn else { return }
            self.mic?.stop(); self.mic = nil; self.lastError = error.localizedDescription; self.orchestrator.handle(.reset)
        }
        recognizer.prepare()
        do {
            try recognizer.startStream()
            let capture = MicCapture(onBuffer: { [weak recognizer] buffer in recognizer?.feed(buffer) }, onError: { [weak self, weak recognizer] error in
                guard let self, self.turnGeneration == turn, self.callGeneration == call else { return }
                recognizer?.cancelStream(); self.lastError = error.localizedDescription; self.orchestrator.handle(.reset)
            })
            try capture.start(deviceID: inputID); mic = capture; near = recognizer
        } catch { recognizer.cancelStream(); orchestrator.handle(.reset); throw error }
    }
    func pttUp() {
        guard callActive, orchestrator.state == .capturingHisUtterance else { return }
        mic?.stop(); mic = nil; orchestrator.handle(.pushToTalkUp); near?.finishStream()
        if let text = nearFinalWaitingForRelease {
            nearFinalWaitingForRelease = nil
            processNear(text, call: callGeneration, turn: turnGeneration)
            return
        }
        let turn = turnGeneration
        finalTimeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled, let self, self.turnGeneration == turn, self.orchestrator.state == .translating else { return }
            self.near?.cancelStream(); self.lastError = "Speech did not finalize. Please try the turn again."; self.orchestrator.handle(.reset)
        }
    }
    private func processNear(_ text: String, call: UUID, turn: UUID) {
        finalTimeout?.cancel()
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { orchestrator.handle(.reset); return }
        let id = UUID(); lines.append(CallLine(id: id, at: Date(), side: "you", original: text, translated: "", status: "translating")); nearDraft = ""
        turnTask = Task {
            do {
                let translated = try await translation.translate(text, from: .init(identifier: "en"), to: .init(identifier: "es"))
                guard !Task.isCancelled, callActive, callGeneration == call, turnGeneration == turn, let index = lines.firstIndex(where: { $0.id == id }) else { return }
                lines[index].translated = translated; lines[index].status = "translated"
                try AudioDevices.validateFarRoute(processID: processID, injectionID: injectionID)
                orchestrator.handle(.translationReady(translated))
                farForwarder.setPaused(true)
                defer { if callGeneration == call, turnGeneration == turn { farForwarder.setPaused(false) } }
                try await routedSpeech.speak(translated, voiceLanguage: "es-MX", outputDeviceID: injectionID)
                guard !Task.isCancelled, callGeneration == call, turnGeneration == turn else { return }
                orchestrator.handle(.ttsFinished)
            } catch {
                guard callGeneration == call, turnGeneration == turn, !Task.isCancelled else { return }
                lastError = error.localizedDescription; orchestrator.handle(.reset)
            }
        }
    }
    func endCall() {
        if startingCall && !callActive { callGeneration = UUID() }
        if callActive {
            if !nearDraft.isEmpty { lines.append(CallLine(id: UUID(), at: Date(), side: "you", original: nearDraft, translated: "", status: "unfinished")) }
            if !farDraft.isEmpty { lines.append(CallLine(id: UUID(), at: Date(), side: "them", original: farDraft, translated: "", status: "unfinished")) }
            stopAll(); callActive = false
            let store = TranscriptStore(directory: transcriptDirectory)
            let id = store.startCall(now: startedAt)
            do {
                for line in lines { try store.append(TranscriptEntry(timestamp: line.at, speaker: line.side == "you" ? .him : .farSide, original: line.original, translated: line.translated), callID: id) }
                pendingStore = (store, id)
            } catch { lastError = error.localizedDescription; state = "save failed"; return }
        }
        guard let (store, id) = pendingStore else { return }
        do { try store.flush(callID: id); pendingStore = nil; state = "saved"; lastError = nil }
        catch { state = "save failed"; lastError = "Transcript has not saved. Keep Habla open and retry End call after resolving storage: " + error.localizedDescription }
    }
    func stopAll() {
        callGeneration = UUID(); turnGeneration = UUID(); coachGeneration = UUID(); nearFinalWaitingForRelease = nil
        turnTask?.cancel(); finalTimeout?.cancel(); farRestart?.cancel()
        mic?.stop(); mic = nil; farCapture?.stop(); farCapture = nil
        near?.cancelStream(); far?.cancelStream(); coachRecognizer?.cancelStream()
        farForwarder.set(nil); farForwarder.setPaused(true); farLevel = 0
        coachListening = false; coachFinalizing = false; coach.cancel(); localSpeech.stop(); routedSpeech.stop(); orchestrator.handle(.reset)
        Task { await translation.cancel() }
    }
    private var transcriptDirectory: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/CallTranscripts") }
    func openFolder() {
        do { try FileManager.default.createDirectory(at: transcriptDirectory, withIntermediateDirectories: true); NSWorkspace.shared.open(transcriptDirectory) }
        catch { lastError = error.localizedDescription }
    }
}
