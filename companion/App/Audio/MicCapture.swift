import AVFoundation
import CoreAudio
import AudioToolbox
import CallTranslatorCore

/// Lifecycle methods use the main thread; PCM consumers run on a serial queue.
final class MicCapture {
    private let engine = AVAudioEngine()
    private let onBuffer: (AVAudioPCMBuffer) -> Void
    private let onLevel: (Double) -> Void
    private let onError: (Error) -> Void
    private let queue = DispatchQueue(label: "habla.microphone.frames")
    private let generation = AudioCaptureGeneration()
    private var tapped = false
    private var deviceObserver: NSObjectProtocol?
    private(set) var running = false

    init(onBuffer: @escaping (AVAudioPCMBuffer) -> Void, onLevel: @escaping (Double) -> Void = { _ in }, onError: @escaping (Error) -> Void = { _ in }) {
        self.onBuffer = onBuffer
        self.onLevel = onLevel
        self.onError = onError
    }

    func start(deviceID: AudioDeviceID) throws {
        stop()
        let device = try AudioDevices.device(deviceID)
        guard device.inputChannels > 0, !device.isVirtual else { throw NativeAudioError.unavailable("Choose a physical microphone for your English speech.") }
        let input = engine.inputNode
        guard let unit = input.audioUnit else { throw NativeAudioError.unavailable("Microphone audio unit is unavailable.") }
        var selected = deviceID
        try AudioDevices.check(AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0,
                                                     &selected, UInt32(MemoryLayout<AudioDeviceID>.size)), "Select physical microphone")
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw NativeAudioError.unavailable("The selected microphone has no available audio format.") }
        let token = generation.begin()
        let gate = generation, queue = queue, consumer = onBuffer, meter = onLevel
        let capacity = DispatchSemaphore(value: 16)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard gate.accepts(token) else { return }
            guard capacity.wait(timeout: .now()) == .success else {
                gate.cancel()
                DispatchQueue.main.async {
                    self?.stop(); self?.onError(NativeAudioError.unavailable("Microphone processing fell behind. Restart voice input."))
                }
                return
            }
            guard let copy = copyPCM(buffer.audioBufferList, format: buffer.format, frames: buffer.frameLength) else { capacity.signal(); return }
            queue.async {
                defer { capacity.signal() }
                guard gate.accepts(token) else { return }
                consumer(copy)
                meter(pcmLevel(copy))
            }
        }
        tapped = true
        do {
            engine.prepare(); try engine.start(); running = true
            deviceObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
                guard let self, self.running else { return }
                self.stop(); self.onError(NativeAudioError.unavailable("The microphone route changed. Choose an available microphone and restart voice input."))
            }
        }
        catch { stop(); throw error }
    }

    func stop() {
        generation.cancel()
        if let deviceObserver { NotificationCenter.default.removeObserver(deviceObserver); self.deviceObserver = nil }
        if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }
        engine.stop()
        running = false
    }

    deinit { stop() }
}
