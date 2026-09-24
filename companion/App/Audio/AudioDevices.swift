import AVFoundation
import CoreAudio
import AppKit

struct AudioDeviceInfo: Codable, Identifiable {
    let id: UInt32
    let name: String
    let inputChannels: Int
    let outputChannels: Int
    let isVirtual: Bool
}
struct AudioProcessInfo: Codable, Identifiable {
    let id: UInt32
    let name: String
    let outputDeviceIDs: [UInt32]
}
struct AudioDeviceSnapshot: Codable {
    let inputs: [AudioDeviceInfo]
    let virtualOutputs: [AudioDeviceInfo]
    let processes: [AudioProcessInfo]
}
enum NativeAudioError: Error, LocalizedError {
    case unavailable(String)
    case operation(String, OSStatus)
    var errorDescription: String? {
        switch self {
        case .unavailable(let text): return text
        case .operation(let text, let status): return "\(text) (audio status \(status)). Check the selected devices and system audio permission."
        }
    }
}

enum AudioDevices {
    static func snapshot() throws -> AudioDeviceSnapshot {
        let devices = try ids(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDevices).compactMap { try? device($0) }
        let processes = try ids(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyProcessObjectList).compactMap { id -> AudioProcessInfo? in
            guard let pid: Int32 = try? scalar(id, kAudioProcessPropertyPID), pid != getpid(),
                  let outputs = try? processOutputs(id), !outputs.isEmpty else { return nil }
            return AudioProcessInfo(id: id, name: NSRunningApplication(processIdentifier: pid)?.localizedName ?? "Audio application", outputDeviceIDs: outputs)
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        return AudioDeviceSnapshot(inputs: devices.filter { $0.inputChannels > 0 && !$0.isVirtual },
                                   virtualOutputs: devices.filter { $0.outputChannels > 0 && $0.isVirtual }, processes: processes)
    }
    static func device(_ id: AudioDeviceID) throws -> AudioDeviceInfo {
        let transport: UInt32 = try scalar(id, kAudioDevicePropertyTransportType)
        let name = try string(id, kAudioObjectPropertyName)
        let virtual = transport == kAudioDeviceTransportTypeVirtual || transport == kAudioDeviceTransportTypeAggregate || name.localizedCaseInsensitiveContains("BlackHole")
        return AudioDeviceInfo(id: id, name: name, inputChannels: try channels(id, scope: kAudioObjectPropertyScopeInput),
                               outputChannels: try channels(id, scope: kAudioObjectPropertyScopeOutput), isVirtual: virtual)
    }
    static func processOutputs(_ id: AudioObjectID) throws -> [AudioObjectID] {
        var visited = Set<AudioObjectID>()
        func expand(_ deviceID: AudioObjectID) throws -> [AudioObjectID] {
            guard visited.insert(deviceID).inserted else { return [] }
            let transport: UInt32 = try scalar(deviceID, kAudioDevicePropertyTransportType)
            if transport == kAudioDeviceTransportTypeAggregate {
                let children = try ids(deviceID, kAudioAggregateDevicePropertyActiveSubDeviceList)
                return try [deviceID] + children.flatMap { try expand($0) }
            }
            return [deviceID]
        }
        return try ids(id, kAudioProcessPropertyDevices, scope: kAudioObjectPropertyScopeOutput).flatMap { try expand($0) }
    }
    static func validateFarRoute(processID: AudioObjectID, injectionID: AudioDeviceID) throws {
        let pid: Int32 = try scalar(processID, kAudioProcessPropertyPID)
        guard pid != getpid() else { throw NativeAudioError.unavailable("Choose the calling application, not Habla's own audio.") }
        let outputs = try processOutputs(processID)
        guard !outputs.isEmpty else { throw NativeAudioError.unavailable("Start audio in the calling application, then select its source.") }
        guard !outputs.contains(injectionID) else { throw NativeAudioError.unavailable("The call's speaker output includes BlackHole. Choose physical speakers or headphones in the calling app before translating.") }
    }
    static func check(_ status: OSStatus, _ operation: String) throws {
        guard status == noErr else { throw NativeAudioError.operation(operation, status) }
    }
    static func address(_ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    }
    static func scalar<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) throws -> T {
        var address = address(selector, scope: scope)
        let pointer = UnsafeMutableRawPointer.allocate(byteCount: MemoryLayout<T>.size, alignment: MemoryLayout<T>.alignment)
        defer { pointer.deallocate() }
        var size = UInt32(MemoryLayout<T>.size)
        try check(AudioObjectGetPropertyData(object, &address, 0, nil, &size, pointer), "Read audio device information")
        return pointer.load(as: T.self)
    }
    static func string(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) throws -> String {
        let value: Unmanaged<CFString> = try scalar(object, selector)
        return value.takeRetainedValue() as String
    }
    static func ids(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) throws -> [AudioObjectID] {
        var address = address(selector, scope: scope)
        var size: UInt32 = 0
        try check(AudioObjectGetPropertyDataSize(object, &address, 0, nil, &size), "Read audio device list")
        guard size > 0 else { return [] }
        var values = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        try values.withUnsafeMutableBytes { bytes in
            try check(AudioObjectGetPropertyData(object, &address, 0, nil, &size, bytes.baseAddress!), "Read audio device list")
        }
        return values
    }
    private static func channels(_ object: AudioObjectID, scope: AudioObjectPropertyScope) throws -> Int {
        var address = address(kAudioDevicePropertyStreamConfiguration, scope: scope)
        var size: UInt32 = 0
        try check(AudioObjectGetPropertyDataSize(object, &address, 0, nil, &size), "Read audio channel count")
        guard size >= MemoryLayout<AudioBufferList>.size else { return 0 }
        let pointer = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { pointer.deallocate() }
        try check(AudioObjectGetPropertyData(object, &address, 0, nil, &size, pointer), "Read audio channel count")
        return UnsafeMutableAudioBufferListPointer(pointer.assumingMemoryBound(to: AudioBufferList.self)).reduce(0) { $0 + Int($1.mNumberChannels) }
    }
}

/// Render callback memory expires on return, so queued consumers receive a copy.
func copyPCM(_ source: UnsafePointer<AudioBufferList>, format: AVAudioFormat, frames: AVAudioFrameCount) -> AVAudioPCMBuffer? {
    guard frames > 0, let result = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
    result.frameLength = frames
    let input = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: source))
    let output = UnsafeMutableAudioBufferListPointer(result.mutableAudioBufferList)
    guard input.count == output.count else { return nil }
    for index in input.indices {
        guard let from = input[index].mData, let to = output[index].mData,
              input[index].mDataByteSize >= output[index].mDataByteSize else { return nil }
        memcpy(to, from, Int(output[index].mDataByteSize))
    }
    return result
}
func pcmLevel(_ buffer: AVAudioPCMBuffer) -> Double {
    guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return 0 }
    var square: Double = 0
    for frame in 0..<Int(buffer.frameLength) { let sample = Double(channels[0][frame * buffer.stride]); square += sample * sample }
    return min(1, sqrt(square / Double(buffer.frameLength)) * 4)
}
