import AVFoundation
import Testing
@testable import CallTranslatorApp

@Test func queuedAudioOwnsItsSamplesAfterTheCaptureCallbackReturns() throws {
    let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
    let source = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
    source.frameLength = 4
    let samples = try #require(source.floatChannelData?[0])
    for index in 0..<4 { samples[index] = Float(index + 1) / 10 }
    let copy = try #require(copyPCM(source.audioBufferList, format: format, frames: source.frameLength))
    samples[0] = 0
    #expect(copy.floatChannelData?[0][0] == 0.1)
    #expect(copy.frameLength == 4)
    #expect(pcmLevel(copy) > 0)
}

@Test func emptyAudioIsNotScheduledForRecognition() throws {
    let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
    let source = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
    source.frameLength = 0
    #expect(copyPCM(source.audioBufferList, format: format, frames: 0) == nil)
    #expect(pcmLevel(source) == 0)
}

@Test func finalizationBacklogIsBoundedAndPreservesFrameOrder() throws {
    let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1))
    let first = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
    let second = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4))
    first.frameLength = 4; second.frameLength = 4
    var backlog = PCMFrameBacklog(byteLimit: 32)
    let addedFirst = backlog.append(first), addedSecond = backlog.append(second), rejected = backlog.append(first)
    #expect(addedFirst && addedSecond && !rejected)
    #expect(backlog.byteCount == 32)
    let output = backlog.takeAll()
    #expect(output.count == 2)
    #expect(output[0] === first && output[1] === second)
    #expect(backlog.byteCount == 0)
}
