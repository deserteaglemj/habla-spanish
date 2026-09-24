import AVFoundation
import CoreAudio
import CallTranslatorCore

/// Owns a private process tap and private aggregate only for this capture lifetime.
/// Call start/stop on the main thread. No system default device is modified.
final class FarSideCapture {
    private let onBuffer: (AVAudioPCMBuffer) -> Void
    private let onLevel: (Double) -> Void
    private let onError: (Error) -> Void
    private let queue = DispatchQueue(label: "habla.call.frames")
    private let generation = AudioCaptureGeneration()
    private var tapID: AudioObjectID = kAudioObjectUnknown
    private var aggregateID: AudioObjectID = kAudioObjectUnknown
    private var ioProc: AudioDeviceIOProcID?
    private var routeTimer: Timer?
    private(set) var running = false

    init(onBuffer: @escaping (AVAudioPCMBuffer) -> Void,
         onLevel: @escaping (Double) -> Void = { _ in }, onError: @escaping (Error) -> Void = { _ in }) {
        self.onBuffer = onBuffer; self.onLevel = onLevel; self.onError = onError
    }

    func start(processID: AudioObjectID, injectionDeviceID: AudioDeviceID) throws {
        stop()
        try AudioDevices.validateFarRoute(processID: processID, injectionID: injectionDeviceID)
        let description = CATapDescription(stereoMixdownOfProcesses: [processID])
        description.name = "Habla call audio"
        description.isPrivate = true
        description.muteBehavior = .unmuted
        do {
            try AudioDevices.check(AudioHardwareCreateProcessTap(description, &tapID), "Create private call audio tap")
            let tapUID = try AudioDevices.string(tapID, kAudioTapPropertyUID)
            var stream: AudioStreamBasicDescription = try AudioDevices.scalar(tapID, kAudioTapPropertyFormat)
            guard let format = AVAudioFormat(streamDescription: &stream), stream.mSampleRate > 0, stream.mBytesPerFrame > 0 else {
                throw NativeAudioError.unavailable("The calling application has no supported audio stream.")
            }
            let aggregate: [String: Any] = [
                kAudioAggregateDeviceNameKey: "Habla private call capture",
                kAudioAggregateDeviceUIDKey: "habla.capture.\(UUID().uuidString)",
                kAudioAggregateDeviceIsPrivateKey: true,
                kAudioAggregateDeviceTapAutoStartKey: true,
                kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: tapUID, kAudioSubTapDriftCompensationKey: true]]
            ]
            try AudioDevices.check(AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &aggregateID), "Create private capture stream")
            let token = generation.begin()
            let gate = generation, consumer = onBuffer, meter = onLevel
            let bytesPerFrame = stream.mBytesPerFrame
            try AudioDevices.check(AudioDeviceCreateIOProcIDWithBlock(&ioProc, aggregateID, queue) { _, input, _, _, _ in
                guard gate.accepts(token), input.pointee.mNumberBuffers > 0 else { return }
                let frames = AVAudioFrameCount(input.pointee.mBuffers.mDataByteSize / bytesPerFrame)
                guard let copy = copyPCM(input, format: format, frames: frames), gate.accepts(token) else { return }
                consumer(copy)
                meter(pcmLevel(copy))
            }, "Create call audio reader")
            try AudioDevices.check(AudioDeviceStart(aggregateID, ioProc), "Start call audio capture")
            running = true
            // A call app can change devices while capture is running. Stop rather than keep
            // translating an unsafe or vanished route. Call output is checked before TTS too.
            routeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                guard let self, self.generation.accepts(token) else { return }
                do { try AudioDevices.validateFarRoute(processID: processID, injectionID: injectionDeviceID) }
                catch { self.stop(); self.onError(error) }
            }
        } catch { stop(); throw error }
    }

    func stop() {
        generation.cancel()
        routeTimer?.invalidate(); routeTimer = nil
        if aggregateID != kAudioObjectUnknown {
            if let ioProc { AudioDeviceStop(aggregateID, ioProc); AudioDeviceDestroyIOProcID(aggregateID, ioProc) }
            ioProc = nil
            AudioHardwareDestroyAggregateDevice(aggregateID)
            aggregateID = kAudioObjectUnknown
        }
        if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID); tapID = kAudioObjectUnknown }
        running = false
    }
    deinit { stop() }
}
