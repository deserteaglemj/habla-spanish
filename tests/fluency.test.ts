import { describe, expect, it } from 'vitest';
import { createInitialState, exportBackup, fluencyPaceSeconds, fluentPhrases, giveHint, importBackup, nextExercise, revealAnswer, startSession, stats, submitAnswer } from '../src/lib/engine';
import type { Phrase, PhraseProgress, Unit } from '../src/types';

const now = new Date('2026-09-24T12:00:00.000Z');
const later = new Date('2026-10-01T12:00:00.000Z');
const phrase: Phrase = {
  id: 'plans-time', unitId: 'plans', spanish: 'Quiero verte a las ocho.',
  english: 'I want to see you at eight.', alternatives: ['Te quiero ver a las ocho.'],
  explanation: 'Use quiero with an infinitive.', hint: 'Start with quiero.',
  example: 'Quiero verte mañana.', exampleEnglish: 'I want to see you tomorrow.',
  context: 'Change the meeting time to nine.',
  contextAnswers: ['Quiero verte a las nueve.'], tags: ['plans'],
};
const second: Phrase = { ...phrase, id: 'plans-place', spanish: 'Quiero verte en el café.', english: 'I want to see you at the café.', unitId: 'plans' };
const other: Phrase = { ...phrase, id: 'travel-ticket', unitId: 'travel', spanish: 'Quiero un boleto.', english: 'I want a ticket.' };
const units: Unit[] = [
  { id: 'plans', title: 'Make a plan', level: 'A1', description: 'Arrange a meeting.', goal: 'Suggest a time.', grammar: 'Quiero plus infinitive.', phrases: [phrase, second], dialogue: [], reading: { spanish: '', english: '', question: '', answers: [] }, mission: 'Make a plan aloud.' },
  { id: 'travel', title: 'Travel', level: 'A2', description: 'Buy a ticket.', goal: 'Ask for a ticket.', grammar: 'Quiero plus a noun.', phrases: [other], dialogue: [], reading: { spanish: '', english: '', question: '', answers: [] }, mission: 'Buy a ticket.' },
];

function progress(id: string, stage: PhraseProgress['stage'], lastPracticed: string): PhraseProgress {
  return { phraseId: id, stage, interval: 7, due: later.toISOString(), lastPracticed, independentCount: stage === 'transfer' ? 3 : 1, lapses: 0, attempts: 4 };
}

describe('fluency practice', () => {
  it('keeps suggested pace visible as a bounded aid, not a score', () => {
    expect(fluencyPaceSeconds('Good morning.')).toBe(8);
    expect(fluencyPaceSeconds('')).toBe(8);
    expect(fluencyPaceSeconds('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen')).toBe(30);
  });

  it('selects only independently recalled phrases and rotates the least recent', () => {
    const state = createInitialState();
    state.progress[phrase.id] = progress(phrase.id, 'independent', new Date(now.getTime() - 86_400_000).toISOString());
    state.progress[second.id] = progress(second.id, 'supported', now.toISOString());
    state.progress[other.id] = progress(other.id, 'transfer', now.toISOString());
    expect(fluentPhrases(state, units).map(item => item.id).sort()).toEqual([phrase.id, other.id]);
    let session = startSession(state, units, 'fluency', undefined, now);
    expect(session.session?.exercise).toMatchObject({ phraseId: phrase.id, kind: 'fluency', introduced: false, support: 'none' });
    session = submitAnswer(session, units, phrase.spanish, now);
    session = nextExercise(session, units, now);
    expect(session.session?.exercise?.phraseId).toBe(other.id);
    expect(startSession(createInitialState(), units, 'fluency', 'plans', now).session?.exercise).toBeNull();
    const scoped = createInitialState();
    scoped.progress[phrase.id] = progress(phrase.id, 'independent', now.toISOString());
    scoped.progress[other.id] = progress(other.id, 'transfer', new Date(now.getTime() - 86_400_000).toISOString());
    expect(startSession(scoped, units, 'fluency', 'plans', now).session?.exercise?.phraseId).toBe(phrase.id);
  });

  it('records activity without moving review evidence, including misses and support', () => {
    const state = createInitialState();
    state.progress[phrase.id] = progress(phrase.id, 'transfer', now.toISOString());
    const before = { ...state.progress[phrase.id] };
    let correct = startSession(state, units, 'fluency', undefined, now);
    correct = submitAnswer(correct, units, phrase.alternatives[0], now);
    expect(correct.progress[phrase.id]).toMatchObject({ ...before, attempts: before.attempts + 1, lastPracticed: now.toISOString() });
    expect(correct.attempts[0]).toMatchObject({ kind: 'fluency', support: 'none', correct: true });
    expect(correct.session?.exercise?.feedback).toContain('spaced-review date stays the same');
    expect(stats(correct, now)).toMatchObject({ todayAttempts: 1, todayIndependent: 0, independent: 1, transfer: 1 });

    let missed = startSession({ ...state, session: null }, units, 'fluency', undefined, now);
    missed = submitAnswer(missed, units, 'No sé', now);
    expect(missed.progress[phrase.id]).toMatchObject({ stage: 'transfer', interval: 7, due: later.toISOString(), lapses: 0, independentCount: 3, attempts: 5 });
    missed = nextExercise(missed, units, now);
    expect(missed.session?.exercise).toMatchObject({ kind: 'fluency', retry: true, support: 'revealed' });
    missed = submitAnswer(missed, units, phrase.spanish, now);
    expect(missed.progress[phrase.id]).toMatchObject({ stage: 'transfer', interval: 7, due: later.toISOString(), independentCount: 3, attempts: 6 });

    let helped = startSession({ ...state, session: null, attempts: [] }, units, 'fluency', undefined, now);
    helped = submitAnswer(revealAnswer(giveHint(helped)), units, phrase.spanish, now);
    expect(helped.attempts[0].support).toBe('revealed');
    expect(helped.progress[phrase.id].independentCount).toBe(before.independentCount);
    expect(importBackup(exportBackup(helped), units).attempts[0].kind).toBe('fluency');
    expect(importBackup(exportBackup(helped), units).session?.mode).toBe('fluency');
  });
});
