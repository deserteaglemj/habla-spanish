import Foundation

/// Synthesis may finish before the output device plays its last scheduled frame.
public struct AudioPlaybackDrain {
    public enum Status: Equatable { case waiting, drained, empty, stale }
    private var token: UUID?
    private var pending = 0
    private var received = false
    private var ended = false
    public init() {}
    public mutating func begin(_ token: UUID) { self.token = token; pending = 0; received = false; ended = false }
    public mutating func enqueue(_ token: UUID) -> Bool {
        guard self.token == token, !ended else { return false }
        pending += 1; received = true; return true
    }
    public mutating func synthesisEnded(_ token: UUID) -> Status {
        guard self.token == token else { return .stale }
        ended = true; return status()
    }
    public mutating func played(_ token: UUID) -> Status {
        guard self.token == token, pending > 0 else { return .stale }
        pending -= 1; return status()
    }
    public mutating func cancel() { token = nil; pending = 0 }
    private func status() -> Status {
        guard ended, pending == 0 else { return .waiting }
        return received ? .drained : .empty
    }
}
