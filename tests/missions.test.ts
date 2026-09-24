import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { units } from '../src/data/curriculum';
import { createInitialState } from '../src/lib/engine';
import { Missions } from '../src/components/Missions';
import { advanceMission, missionTask, parseMissionSession, resumeMission, revealMissionHelp, setMissionCheckIn, setMissionDraft, startMission, stopMission, submitMission } from '../src/lib/missions';

const now = new Date('2026-01-01T10:00:00.000Z');
const unit = units[0];
const rehearsal = (spanishFirst = true) => advanceMission(advanceMission(startMission(unit, spanishFirst, now), unit, now), unit, now);

describe('mission practice', () => {
  it('starts with a brief and explicit preparation, without attempts', () => {
    const start = startMission(unit, false, now);
    expect(start.phase).toBe('brief');
    expect(advanceMission(start, unit, now).phase).toBe('prepare');
    expect(rehearsal().phase).toBe('rehearse');
    expect(rehearsal().attempts).toEqual([]);
  });
  it('keeps current and future reply models out of the initial rehearsal markup', () => {
    const session = rehearsal();
    const markup = renderToStaticMarkup(createElement(Missions, { units, settings: createInitialState().settings, session, update: () => {}, go: () => {} }));
    expect(markup).not.toContain(unit.dialogue[0].spanish);
    expect(markup).not.toContain(unit.dialogue[1].spanish);
    expect(markup).not.toContain(unit.dialogue[0].english);
  });
  it('retains requested English and model help across restore without downgrading support', () => {
    let session = revealMissionHelp(rehearsal(), 'english', now);
    session = setMissionDraft(session, 'Buenos', now);
    const restored = parseMissionSession(JSON.parse(JSON.stringify(session)), units);
    expect(restored).toEqual(session);
    session = revealMissionHelp(restored, 'model', now);
    expect(revealMissionHelp(session, 'english', now)).toBe(session);
    session = submitMission(session, unit, unit.dialogue[0].spanish, now);
    expect(session.attempts[0].support).toBe('model');
    expect(session.attempts[0].correct).toBe(true);
  });
  it('automatically counts visible English as support', () => {
    const session = rehearsal(false);
    expect(session.support).toBe('english');
    expect(submitMission(session, unit, unit.dialogue[0].spanish, now).attempts[0].support).toBe('english');
  });
  it('requires a nonempty explicit answer and continuation, once per task', () => {
    const session = rehearsal();
    expect(advanceMission(session, unit, now)).toBe(session);
    expect(submitMission(session, unit, ' ', now)).toBe(session);
    const drafted = setMissionDraft(session, 'Buenos días. ¿Cómo estás?', now);
    expect(drafted.attempts).toEqual([]);
    const answered = submitMission(drafted, unit, drafted.draft, now);
    expect(answered.answered).toBe(true);
    expect(answered.index).toBe(0);
    expect(submitMission(answered, unit, drafted.draft, now)).toBe(answered);
    expect(advanceMission(answered, unit, now).index).toBe(1);
  });
  it('progresses through all authored dialogue turns and changed contexts before debrief', () => {
    for (const item of units) {
      let session = advanceMission(advanceMission(startMission(item, true, now), item, now), item, now);
      while (session.phase !== 'debrief') {
        const task = missionTask(session, item)!;
        session = submitMission(session, item, task.model, now);
        expect(session.feedback?.correct).toBe(true);
        session = advanceMission(session, item, now);
      }
      expect(session.attempts).toHaveLength(item.dialogue.length + item.phrases.length);
      expect(session.completedAt).toBe(now.toISOString());
      expect(parseMissionSession(JSON.parse(JSON.stringify(session)), units)).toEqual(session);
    }
  });
  it('records nonmatching replies and lets learners compare then continue', () => {
    const answered = submitMission(rehearsal(), unit, 'Otra respuesta.', now);
    expect(answered.feedback?.correct).toBe(false);
    expect(advanceMission(answered, unit, now).index).toBe(1);
    expect(answered.attempts[0].correct).toBe(false);
  });
  it('pauses without losing draft or support, and resumes only incomplete missions', () => {
    const draft = setMissionDraft(revealMissionHelp(rehearsal(), 'english', now), 'Buenos', now);
    const paused = stopMission(draft, now);
    expect(submitMission(paused, unit, 'Buenos días.', now)).toBe(paused);
    const resumed = resumeMission(parseMissionSession(JSON.parse(JSON.stringify(paused)), units), now);
    expect(resumed.draft).toBe('Buenos');
    expect(resumed.support).toBe('english');
    expect(resumed.stoppedAt).toBeUndefined();
  });
  it('records a voluntary real-world check-in separately from graded evidence', () => {
    let session = rehearsal();
    while (session.phase !== 'debrief') session = advanceMission(submitMission(session, unit, missionTask(session, unit)!.model, now), unit, now);
    const checked = setMissionCheckIn(session, 'tried', 'I asked for a repeat.', now);
    expect(checked.attempts).toEqual(session.attempts);
    expect(checked.checkIn).toBe('tried');
    expect(checked.reflection).toBe('I asked for a repeat.');
    expect(parseMissionSession(JSON.parse(JSON.stringify(checked)), units)).toEqual(checked);
    expect(resumeMission(checked, now)).toBe(checked);
  });
  it('rejects malformed, unknown, out-of-order or forged progress', () => {
    const base = rehearsal();
    for (const bad of [null, [], { ...base, other: 1 }, { ...base, unitId: 'missing' }, { ...base, index: 100 }, { ...base, draft: 'x'.repeat(2001) }, { ...base, support: 'hint' }, { ...base, answered: true }, { ...base, phase: 'debrief', completedAt: now.toISOString() }, { ...base, startedAt: 'tomorrow' }, { ...base, checkIn: 'completed' }, { ...base, spanishFirst: false, support: 'none' }]) {
      expect(() => parseMissionSession(bad, units)).toThrow();
    }
    const answered = submitMission(base, unit, unit.dialogue[0].spanish, now);
    expect(() => parseMissionSession({ ...answered, attempts: [] }, units)).toThrow();
    expect(() => parseMissionSession({ ...answered, feedback: { ...answered.feedback, correct: false } }, units)).toThrow();
  });
});
