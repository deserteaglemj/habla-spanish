import { describe, expect, it } from 'vitest';
import { activityAttempts, createInitialState, exportBackup, importBackup, stats } from '../src/lib/engine';
import { units } from '../src/data/curriculum';
import { advanceMission, revealMissionHelp, startMission, stopMission, submitMission } from '../src/lib/missions';
const now = new Date('2026-01-02T12:00:00.000Z');
const unit = units[0];
const rehearsing = (at = now) => advanceMission(advanceMission(startMission(unit, true, at), unit, at), unit, at);
describe('mission backup integration', () => {
  it('round trips a paused mission and its archive without altering review mastery', () => {
    const state = createInitialState();
    state.mission = stopMission(startMission(units[0]));
    state.missionHistory = [state.mission];
    expect(importBackup(exportBackup(state), units)).toEqual({ ...state, missionAttemptCount: 0 });
    expect(state.progress).toEqual({});
  });
  it('rejects active or duplicate archived sessions and unknown units', () => {
    const state = createInitialState(); const mission = startMission(units[0]);
    expect(() => importBackup(exportBackup({ ...state, missionHistory: [mission] }), units)).toThrow();
    const stopped = stopMission(mission);
    expect(() => importBackup(exportBackup({ ...state, missionHistory: [stopped, stopped] }), units)).toThrow();
    expect(() => importBackup(exportBackup({ ...state, mission: { ...mission, unitId: 'no-unit' } }), units)).toThrow();
  });
  it('includes mission attempts once in activity and keeps mastery independent', () => {
    const state = createInitialState();
    const yesterday = new Date('2026-01-01T12:00:00.000Z');
    const first = submitMission(rehearsing(yesterday), unit, unit.dialogue[0].spanish, yesterday);
    const next = submitMission(advanceMission(first, unit, now), unit, unit.dialogue[1].spanish, now);
    state.missionHistory = [stopMission(first, yesterday)];
    state.mission = next;
    const before = exportBackup(state);
    expect(activityAttempts(state)).toHaveLength(2);
    expect(stats(state, now)).toMatchObject({ totalAttempts: 2, todayAttempts: 1, todayCorrect: 1, todayIndependent: 0, streak: 2, independent: 0, transfer: 0, phrasesPracticed: 0 });
    expect(exportBackup(state)).toBe(before);
    expect(importBackup(before, units).missionAttemptCount).toBe(2);
  });
  it('maps requested mission help and preserves cumulative attempts beyond retained sessions', () => {
    const state = createInitialState();
    const first = submitMission(revealMissionHelp(rehearsing(), 'english', now), unit, unit.dialogue[0].spanish, now);
    state.mission = submitMission(revealMissionHelp(advanceMission(first, unit, now), 'model', now), unit, 'incorrect', now);
    state.missionAttemptCount = 900;
    expect(activityAttempts(state).map(a => a.support)).toEqual(['hint', 'revealed']);
    expect(stats(state, now)).toMatchObject({ totalAttempts: 900, todayAttempts: 2, todayCorrect: 1, todayIndependent: 0, accuracy: 50 });
    expect(importBackup(exportBackup(state), units).missionAttemptCount).toBe(900);
    expect(() => importBackup(exportBackup({ ...state, missionAttemptCount: 1 }), units)).toThrow(/mission attempt totals/i);
    expect(() => importBackup(exportBackup({ ...state, missionAttemptCount: -1 }), units)).toThrow();
  });
});
