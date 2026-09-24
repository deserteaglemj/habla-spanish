import { describe, expect, it } from 'vitest';
import { createInitialState, giveHint, nextExercise, startSession, submitAnswer } from '../src/lib/engine';
import type { AppState, Phrase, Unit } from '../src/types';

const now = new Date('2026-09-23T12:00:00.000Z');
const phrase: Phrase = {
  id: 'plans-time', unitId: 'plans', spanish: 'Quiero verte a las ocho.',
  english: 'I want to see you at eight.', alternatives: ['Te quiero ver a las ocho.'],
  explanation: 'Use quiero with an infinitive.', hint: 'Start with quiero.',
  example: 'Quiero verte mañana.', exampleEnglish: 'I want to see you tomorrow.',
  context: 'Change the meeting time to nine.',
  contextAnswers: ['Quiero verte a las nueve.', 'Te quiero ver a las nueve.'], tags: ['plans'],
};
const units: Unit[] = [{
  id: 'plans', title: 'Make a plan', level: 'A1', description: 'Arrange a meeting.',
  goal: 'Suggest a time.', grammar: 'Quiero plus infinitive.', phrases: [phrase], dialogue: [],
  reading: { spanish: '', english: '', question: '', answers: [] }, mission: 'Make a plan aloud.',
}];

function atContextSlot(state: AppState): AppState {
  // Hold the session position constant so only learning evidence changes the task.
  return { ...state, session: { ...state.session!, count: 3 } };
}

describe('adaptive conversational progression', () => {
  it('requires independent evidence before mixed practice offers a changed context', () => {
    let state = createInitialState();
    state.progress[phrase.id] = {
      phraseId: phrase.id, stage: 'supported', interval: 0,
      due: now.toISOString(), lastPracticed: now.toISOString(),
      independentCount: 0, lapses: 0, attempts: 1,
    };
    state = startSession(state, units, 'mixed', undefined, now);
    state = { ...atContextSlot(state), session: { ...state.session!, count: 3, exercise: null } };
    state = nextExercise(state, units, now);
    expect(state.session?.exercise).toMatchObject({
      phraseId: phrase.id, kind: 'recall', introduced: false, support: 'none',
    });

    state = submitAnswer(giveHint(state), units, phrase.spanish, now);
    expect(state.progress[phrase.id]).toMatchObject({ stage: 'supported', independentCount: 0 });
    state = nextExercise(atContextSlot(state), units, now);
    expect(state.session?.exercise?.kind).toBe('recall');

    state = submitAnswer(state, units, phrase.spanish, now);
    expect(state.progress[phrase.id]).toMatchObject({ stage: 'independent', independentCount: 1 });
    state = nextExercise(atContextSlot(state), units, now);
    expect(state.session?.exercise).toMatchObject({
      phraseId: phrase.id, kind: 'context', introduced: false, support: 'none', answered: false,
    });
  });
});
