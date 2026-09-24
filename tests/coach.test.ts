import { afterEach, describe, expect, it, vi } from 'vitest';
import { coachPrompt, createCoachTurn, defaultCoachMeta, exportCoach, parseCoachReply } from '../src/lib/coach';
import { clipUtf8, nativeAvailable, nativeRequest, utf8Length } from '../src/lib/native';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('local conversation context and preservation', () => {
  it('uses a bounded recent context without altering the complete supplied transcript', () => {
    const history = Array.from({ length: 120 }, (_, index) => createCoachTurn(index % 2 ? 'assistant' : 'user', `Message ${index}`));
    const prompt = coachPrompt(history, { ...defaultCoachMeta, memory: 'A learner chose travel.' }, 'Hola');
    expect(prompt.history).toHaveLength(8);
    expect(prompt.history[0].text).toBe('Message 112');
    expect(prompt.history.at(-1)?.text).toBe('Message 119');
    expect(prompt.memory).toBe('A learner chose travel.');
    expect(history).toHaveLength(120);
  });
  it('bounds UTF-8 payloads without corrupting multibyte characters', () => {
    expect(clipUtf8('a🗣é', 5)).toBe('a🗣');
    const prompt = coachPrompt([createCoachTurn('user', 'á'.repeat(2500))], { ...defaultCoachMeta, topic: '🗣'.repeat(100), memory: 'ñ'.repeat(1000) }, 'ü'.repeat(2000));
    expect(utf8Length(prompt.text)).toBeLessThanOrEqual(2000);
    expect(utf8Length(prompt.topic)).toBeLessThanOrEqual(200);
    expect(utf8Length(prompt.memory)).toBeLessThanOrEqual(700);
    expect(utf8Length(prompt.history[0].text)).toBeLessThanOrEqual(2000);
  });
  it('rejects absent or fabricated reply envelopes instead of displaying fake AI', () => {
    for (const reply of [null, [], {}, { text: '', memory: '' }, { text: 'Hola' }, { text: 42, memory: '' }]) expect(() => parseCoachReply(reply)).toThrow();
    expect(parseCoachReply({ text: ' Hola. ', memory: 'Topic: food.' })).toEqual({ text: 'Hola.', memory: 'Topic: food.' });
  });
  it('keeps every unsaved turn in a recovery export when durable storage is unavailable', async () => {
    const turns = Array.from({ length: 122 }, (_, index) => createCoachTurn(index % 2 ? 'assistant' : 'user', `Turn ${index}`));
    const exported = JSON.parse(await exportCoach(null, turns, defaultCoachMeta));
    expect(exported.turns).toEqual(turns);
    expect(exported.turns.at(-1).text).toBe('Turn 121');
    expect(exported.format).toBe('habla-coach-transcript-v1');
  });
});

describe('native reply bridge', () => {
  it('fails clearly on the public website', async () => {
    vi.stubGlobal('window', {});
    expect(nativeAvailable()).toBe(false);
    await expect(nativeRequest('coachReply', { text: 'Hola' })).rejects.toThrow('Mac companion');
  });
  it('uses the versioned promise envelope and handles native errors', async () => {
    const postMessage = vi.fn().mockResolvedValueOnce({ ok: true, result: { text: 'Hola', memory: '' } }).mockResolvedValueOnce({ ok: false, error: 'Spanish model unavailable.' });
    vi.stubGlobal('window', { webkit: { messageHandlers: { habla: { postMessage } } } });
    expect(nativeAvailable()).toBe(true);
    await expect(nativeRequest('coachReply', { text: 'Hola' })).resolves.toEqual({ text: 'Hola', memory: '' });
    expect(postMessage).toHaveBeenCalledWith({ version: 1, command: 'coachReply', payload: { text: 'Hola' } });
    await expect(nativeRequest('coachReply', { text: 'Hola' })).rejects.toThrow('Spanish model unavailable.');
  });
  it('rejects malformed envelopes and scalar results', async () => {
    for (const response of [undefined, { ok: 'yes', result: {} }, { ok: true, result: null }, { ok: true, result: 'hello' }]) {
      vi.stubGlobal('window', { webkit: { messageHandlers: { habla: { postMessage: () => Promise.resolve(response) } } } });
      await expect(nativeRequest('snapshot')).rejects.toThrow('invalid');
    }
  });
  it('ignores a late native answer after cancellation', async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.stubGlobal('window', { webkit: { messageHandlers: { habla: { postMessage: () => new Promise(done => { resolve = done; }) } } } });
    const controller = new AbortController();
    const pending = nativeRequest('coachReply', { text: 'Hola' }, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); resolve({ ok: true, result: { text: 'Late', memory: '' } });
    await rejected;
  });
  it('times out without keeping a caller pending forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { webkit: { messageHandlers: { habla: { postMessage: () => new Promise(() => {}) } } } });
    const pending = nativeRequest('snapshot', undefined, { timeoutMs: 1000 });
    const rejected = expect(pending).rejects.toThrow('did not respond');
    await vi.advanceTimersByTimeAsync(1000); await rejected;
  });
});
