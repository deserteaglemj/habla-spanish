import { describe, expect, it } from 'vitest';
import { createInitialState, exportBackup, importBackup, importCoachingSession } from '../src/lib/engine';
import { units } from '../src/data/curriculum';

describe('lossless long-term backups', () => {
  it('restores a valid export larger than the former 16 MB cap with Unicode intact', () => {
    const state = createInitialState();
    state.attempts = Array.from({ length: 7_500 }, (_, i) => ({
      id: `attempt-${i}`, phraseId: units[0].phrases[0].id,
      at: '2026-01-01T12:00:00.000Z', response: '¿Qué tal? '.repeat(200),
      correct: false, support: 'none' as const, kind: 'recall' as const, error: 'unrecognized' as const,
    }));
    const backup = exportBackup(state);
    expect(new TextEncoder().encode(backup).byteLength).toBeGreaterThan(16_000_000);
    expect(importBackup(backup, units)).toEqual(state);
  });
  it('keeps a byte limit on external coaching input without changing existing state', () => {
    const state = createInitialState();
    expect(() => importCoachingSession('é'.repeat(8_000_001), state, units)).toThrow(/too large/);
    expect(state.attempts).toHaveLength(0);
  });
});
