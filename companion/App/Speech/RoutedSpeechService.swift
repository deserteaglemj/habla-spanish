import AVFoundation
import AudioToolbox
import CoreAudio
import CallTranslatorCore

/// Synthesizes PCM and plays it only on the selected virtual output. Completion means
/// the audio player drained its final buffer, not merely that text synthesis ended.
@MainActor
final class RoutedSpeechService {
    private let synthesizer = AVSpeechSynthesizer()
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var continuation: CheckedContinuation<Void, Error>?
    private var generation = UUID()
    private var drain = AudioPlaybackDrain()
    private var receivedAudio = false
    private var timeout: Task<Void, Never>?
    private var deviceObserver: NSObjectProtocol?
    private(set) var speaking = false

    func speak(_ text: String, voiceLanguage: String = "es-MX", outputDeviceID: AudioDeviceID) async throws {
        stop()
        let device = try AudioDevices.device(outputDeviceID)
        guard device.isVirtual, device.outputChannels > 0, device.name.localizedCaseInsensitiveContains("BlackHole") else {
            throw NativeAudioError.unavailable("Choose BlackHole for Spanish speech entering the call.")
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 8000 else {
            throw NativeAudioError.unavailable("Speech must contain between 1 and 8,000 characters.")
        }
        guard let voice = AVSpeechSynthesisVoice(language: voiceLanguage) else {
            throw NativeAudioError.unavailable("Install a Spanish voice in macOS Spoken Content settings.")
        }
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        guard let unit = engine.outputNode.audioUnit else { throw NativeAudioError.unavailable("Virtual speech output is unavailable.") }
        var selected = outputDeviceID
        try AudioDevices.check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0,
                                                     &selected, UInt32(MemoryLayout<AudioDeviceID>.size)), "Select virtual microphone output")
        self.engine = engine; self.player = player
        let token = UUID(); generation = token
        drain.begin(token); receivedAudio = false; speaking = true
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                self.continuation = continuation
                if Task.isCancelled { settle(.failure(CancellationError()), token: token); return }
                deviceObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
                    Task { @MainActor in self?.settle(.failure(NativeAudioError.unavailable("The speech output route changed. Select BlackHole again.")), token: token) }
                }
                timeout = Task { [weak self] in
                    do { try await Task.sleep(for: .seconds(120)) } catch { return }
                    self?.settle(.failure(NativeAudioError.unavailable("Speech output did not finish. Check BlackHole and try again.")), token: token)
                }
                synthesizer.write(utterance) { [weak self] buffer in
                    guard let pcm = buffer as? AVAudioPCMBuffer else { return }
                    // The synthesizer owns callback memory. Copy it before hopping actors.
                    let copy = pcm.frameLength > 0 ? copyPCM(pcm.audioBufferList, format: pcm.format, frames: pcm.frameLength) : nil
                    let ended = pcm.frameLength == 0
                    DispatchQueue.main.async { self?.receive(copy, ended: ended, token: token) }
                }
            }
        }, onCancel: { [weak self] in Task { @MainActor in self?.settle(.failure(CancellationError()), token: token) } })
    }

    func stop() {
        let old = generation
        settle(.failure(CancellationError()), token: old)
    }

    private func receive(_ buffer: AVAudioPCMBuffer?, ended: Bool, token: UUID) {
        guard generation == token, speaking else { return }
        if ended { finishIfDrained(drain.synthesisEnded(token), token: token); return }
        guard let buffer, let engine, let player else {
            settle(.failure(NativeAudioError.unavailable("Speech synthesis returned unusable audio.")), token: token); return
        }
        do {
            if !receivedAudio {
                engine.connect(player, to: engine.mainMixerNode, format: buffer.format)
                engine.prepare(); try engine.start(); player.play()
                receivedAudio = true
            }
            guard drain.enqueue(token) else {
                settle(.failure(NativeAudioError.unavailable("Speech synthesis returned audio after completion.")), token: token); return
            }
            player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
                Task { @MainActor in
                    guard let self, self.generation == token, self.speaking else { return }
                    self.finishIfDrained(self.drain.played(token), token: token)
                }
            }
        } catch { settle(.failure(error), token: token) }
    }

    private func finishIfDrained(_ status: AudioPlaybackDrain.Status, token: UUID) {
        if status == .drained { settle(.success(()), token: token) }
        if status == .empty { settle(.failure(NativeAudioError.unavailable("The selected voice generated no audio.")), token: token) }
    }

    private func settle(_ result: Result<Void, Error>, token: UUID) {
        guard generation == token else { return }
        generation = UUID()
        timeout?.cancel(); timeout = nil
        if let deviceObserver { NotificationCenter.default.removeObserver(deviceObserver); self.deviceObserver = nil }
        synthesizer.stopSpeaking(at: .immediate)
        player?.stop(); engine?.stop()
        player = nil; engine = nil
        speaking = false; drain.cancel()
        let completion = continuation; continuation = nil
        completion?.resume(with: result)
    }
}
