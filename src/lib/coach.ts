import type { Level } from '../types';
import { clipUtf8 } from './native';

export interface CoachTurn { id: string; role: 'user' | 'assistant'; text: string; at: string; }
export interface CoachMeta { memory: string; topic: string; level: Level; }
export const defaultCoachMeta: CoachMeta = { memory: '', topic: 'Everyday conversation', level: 'A1' };
// Recovery survives route changes in the same open view, but never claims disk storage.
export const coachRecovery: { turns: CoachTurn[]; meta: CoachMeta | null; error: string } = { turns: [], meta: null, error: '' };
export function createCoachTurn(role: CoachTurn['role'], text: string, now = new Date()): CoachTurn { return { id: `coach-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 12)}`, role, text, at: now.toISOString() }; }
export function coachPrompt(turns: CoachTurn[], meta: CoachMeta, text: string) {
  return { text: clipUtf8(text.trim(), 2000), topic: clipUtf8(meta.topic.trim(), 200), level: meta.level, memory: clipUtf8(meta.memory, 700), history: turns.slice(-8).map(turn => ({ role: turn.role, text: clipUtf8(turn.text, 2000) })) };
}
export function parseCoachReply(value: unknown): { text: string; memory: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The coach returned an invalid reply.');
  const data = value as Record<string, unknown>;
  if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 16000 || typeof data.memory !== 'string' || data.memory.length > 4000) throw new Error('The coach returned an invalid reply.');
  return { text: data.text.trim(), memory: clipUtf8(data.memory, 700) };
}

export function openCoachDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Conversation storage is unavailable in this browser.')); return; }
    const request = indexedDB.open('habla.coach.v1', 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('turns', { autoIncrement: true }); db.createObjectStore('meta'); };
    request.onerror = () => reject(request.error ?? new Error('Conversation storage could not open.'));
    request.onblocked = () => reject(new Error('Close other Habla companion windows, then reopen this one to use conversation storage.'));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}
const storageError = (transaction: IDBTransaction) => transaction.error ?? new Error('Conversation could not be saved. Export the transcript from this open tab.');
export function readCoach(db: IDBDatabase): Promise<{ turns: CoachTurn[]; total: number; meta: CoachMeta | null }> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['turns', 'meta'], 'readonly');
    const store = transaction.objectStore('turns');
    const turns: CoachTurn[] = [];
    let total = 0, meta: CoachMeta | null = null;
    const count = store.count(); count.onsuccess = () => { total = count.result; };
    const cursor = store.openCursor(null, 'prev');
    cursor.onsuccess = () => { const item = cursor.result; if (item && turns.length < 50) { turns.push(item.value as CoachTurn); item.continue(); } };
    const metadata = transaction.objectStore('meta').get('current'); metadata.onsuccess = () => { meta = metadata.result ?? null; };
    transaction.oncomplete = () => resolve({ turns: turns.reverse(), total, meta });
    transaction.onerror = transaction.onabort = () => reject(storageError(transaction));
  });
}
export function appendCoachExchange(db: IDBDatabase, user: CoachTurn, assistant: CoachTurn, meta: CoachMeta, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('The reply was stopped.', 'AbortError')); return; }
    const transaction = db.transaction(['turns', 'meta'], 'readwrite');
    const abort = () => { try { transaction.abort(); } catch { /* A committed transaction is already complete. */ } };
    const clean = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
    transaction.objectStore('turns').add(user); transaction.objectStore('turns').add(assistant);
    transaction.objectStore('meta').put(meta, 'current');
    transaction.oncomplete = () => { clean(); resolve(); }; transaction.onerror = transaction.onabort = () => { clean(); reject(signal?.aborted ? new DOMException('The reply was stopped.', 'AbortError') : storageError(transaction)); };
  });
}
export function saveCoachMeta(db: IDBDatabase, meta: CoachMeta): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('meta', 'readwrite'); transaction.objectStore('meta').put(meta, 'current');
    transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(storageError(transaction));
  });
}
export function exportCoach(db: IDBDatabase | null, unsaved: CoachTurn[], meta: CoachMeta): Promise<string> {
  if (!db) return Promise.resolve(JSON.stringify({ format: 'habla-coach-transcript-v1', exportedAt: new Date().toISOString(), meta, turns: unsaved }, null, 2));
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('turns', 'readonly'); const request = transaction.objectStore('turns').getAll();
    transaction.oncomplete = () => resolve(JSON.stringify({ format: 'habla-coach-transcript-v1', exportedAt: new Date().toISOString(), meta, turns: [...request.result as CoachTurn[], ...unsaved] }, null, 2));
    transaction.onerror = transaction.onabort = () => reject(storageError(transaction));
  });
}
