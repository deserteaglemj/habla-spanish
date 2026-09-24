export type NativeCommand = 'snapshot' | 'permissions' | 'prepareTranslation' | 'startCall' | 'endCall' | 'pttDown' | 'pttUp' | 'translateText' | 'coachReply' | 'coachMicStart' | 'coachMicStop' | 'speak' | 'stopSpeech' | 'openTranscriptFolder';
export interface NativeSnapshot {
  coach: { available: boolean; reason?: string };
  translation: { available: boolean; reason?: string };
  callActive: boolean;
  coachListening: boolean;
  coachDraft: string;
  coachFinal?: boolean;
  [key: string]: unknown;
}
interface NativeEnvelope { ok: boolean; result?: unknown; error?: string; }
interface Bridge { postMessage: (message: { version: 1; command: NativeCommand; payload?: Record<string, unknown> }) => Promise<NativeEnvelope>; }
function bridge(): Bridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { webkit?: { messageHandlers?: { habla?: Bridge } } }).webkit?.messageHandlers?.habla;
}
export function nativeAvailable(): boolean { return typeof bridge()?.postMessage === 'function'; }
export const utf8Length = (value: string): number => new TextEncoder().encode(value).length;
export function clipUtf8(value: string, max: number): string {
  let result = '', count = 0;
  for (const char of value) { const size = utf8Length(char); if (count + size > max) break; count += size; result += char; }
  return result;
}
export function nativeRequest<T = Record<string, unknown>>(command: NativeCommand, payload?: Record<string, unknown>, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const handler = bridge();
  if (!handler) return Promise.reject(new Error('Open the Habla Mac companion to use on-device voice and AI.'));
  if (options.signal?.aborted) return Promise.reject(new DOMException('The request was stopped.', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, result?: T) => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve(result as T); };
    const abort = () => finish(new DOMException('The request was stopped.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('The Mac companion did not respond in time. Try again.')), options.timeoutMs ?? 30_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      Promise.resolve(handler.postMessage({ version: 1, command, ...(payload === undefined ? {} : { payload }) })).then(envelope => {
        if (!envelope || typeof envelope !== 'object' || typeof envelope.ok !== 'boolean') { finish(new Error('The Mac companion returned an invalid response.')); return; }
        if (!envelope.ok) { finish(new Error(typeof envelope.error === 'string' ? envelope.error : 'The Mac companion could not complete the request.')); return; }
        if (envelope.result === null || typeof envelope.result !== 'object') { finish(new Error('The Mac companion returned an invalid result.')); return; }
        finish(undefined, envelope.result as T);
      }, error => finish(error instanceof Error ? error : new Error('The Mac companion request failed.')));
    } catch (error) { finish(error); }
  });
}
