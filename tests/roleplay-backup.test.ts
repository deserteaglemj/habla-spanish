import { describe, expect, it } from 'vitest';
import { units } from '../src/data/curriculum';
import { activityAttempts, createInitialState, exportBackup, importBackup, stats } from '../src/lib/engine';
import { continueRoleplay, startRoleplay, submitRoleplay } from '../src/lib/roleplay';

describe('conversation progress integration', () => {
  it('backs up drafts, evidence, totals and completion without double counting', () => {
    const state = createInitialState();
    const at = new Date('2026-01-01T10:00:00.000Z');
    let session = startRoleplay(units[0], undefined, at);
    while (!session.completedAt) {
      session = submitRoleplay(session, units[0], units[0].dialogue[session.turnIndex].spanish, at);
      session = continueRoleplay(session, units[0], at);
    }
    state.roleplay = session;
    state.roleplayHistory = [session];
    state.roleplayAttemptCount = session.attempts.length;
    const restored = importBackup(exportBackup(state), units);
    expect(restored).toEqual(state);
    expect(activityAttempts(restored)).toHaveLength(session.attempts.length);
    expect(stats(restored, at).todayAttempts).toBe(session.attempts.length);
    expect(stats(restored, at).totalAttempts).toBe(session.attempts.length);
    expect(stats(restored, at).totalSessions).toBe(1);
  });
  it('rejects an unavailable conversation before replacing progress', () => {
    const state = createInitialState();
    state.roleplay = { ...startRoleplay(units[0]), unitId: 'missing-unit' };
    expect(() => importBackup(exportBackup(state), units)).toThrow();
  });
});
