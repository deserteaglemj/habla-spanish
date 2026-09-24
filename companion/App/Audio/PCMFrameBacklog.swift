import AVFoundation

/// Audio arriving while recognition finalizes is retained for the next stream.
/// A hard byte ceiling turns a stalled consumer into an explicit error.
struct PCMFrameBacklog {
    let byteLimit: Int
    private(set) var byteCount = 0
    private var frames: [AVAudioPCMBuffer] = []
    init(byteLimit: Int = 4_000_000) { self.byteLimit = max(0, byteLimit) }
    mutating func append(_ buffer: AVAudioPCMBuffer) -> Bool {
        let size = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffer.audioBufferList)).reduce(0) { $0 + Int($1.mDataByteSize) }
        guard size <= byteLimit - byteCount else { return false }
        frames.append(buffer); byteCount += size; return true
    }
    mutating func takeAll() -> [AVAudioPCMBuffer] {
        let result = frames; frames.removeAll(keepingCapacity: false); byteCount = 0; return result
    }
}
