import { afterEach, describe, expect, it, vi } from 'vitest';
import { allPhrases, createInitialState, duePhrases, exportBackup, exportCoachHandoff, giveHint, gradeAnswer, importBackup, importCoachingSession, nextExercise, revealAnswer, startSession, stats, stopSession, submitAnswer, validateSessionReferences } from '../src/lib/engine';
import { loadState, saveState } from '../src/lib/storage';
import type { AppState, Phrase, Unit } from '../src/types';

const now = new Date('2026-09-23T12:00:00.000Z');
const phrase: Phrase = { id: 'a1-want', unitId: 'a1-basics', spanish: 'Quiero verte a las ocho.', english: 'I want to see you at eight.', alternatives: ['Te quiero ver a las ocho.'], explanation: 'Quiero is followed by an infinitive.', hint: 'Start with quiero.', example: 'Quiero verte mañana.', exampleEnglish: 'I want to see you tomorrow.', context: 'Change the meeting time to nine.', contextAnswers: ['Quiero verte a las nueve.', 'Te quiero ver a las nueve.'], tags: ['plans'] };
const second: Phrase = { ...phrase, id: 'a1-hello', spanish: 'Hola, ¿cómo estás?', english: 'Hello, how are you?', alternatives: ['Hola, ¿qué tal?'], contextAnswers: ['Hola, ¿cómo está usted?'] };
const units: Unit[] = [{ id: 'a1-basics', title: 'Basics', level: 'A1', description: 'Start here', goal: 'Make a plan', grammar: 'Infinitives', phrases: [phrase, second], dialogue: [], reading: { spanish: '', english: '', question: '', answers: [] }, mission: 'Greet someone' }];
const started = () => startSession(createInitialState(), units, 'lesson', 'a1-basics', now);
function familiar(): AppState {
  const state = createInitialState();
  state.progress[phrase.id] = { phraseId: phrase.id, stage: 'supported', interval: 0, due: now.toISOString(), lastPracticed: new Date(now.getTime()-86_400_000).toISOString(), independentCount: 0, lapses: 0, attempts: 1 };
  return startSession(state, units, 'review', undefined, now);
}

describe('answer grading', () => {
  it('accepts accents, punctuation, spacing and optional subject pronouns', () => {
    expect(gradeAnswer(phrase, '  Yo quiero verte a las ocho! ', 'recall').correct).toBe(true);
    expect(gradeAnswer(second, 'hola como estas', 'recall').correct).toBe(true);
  });
  it('accepts curated alternatives and distinguishes context from memorized answer', () => {
    expect(gradeAnswer(phrase, 'Te quiero ver a las ocho', 'recall').correct).toBe(true);
    expect(gradeAnswer(phrase, 'Quiero verte a las ocho', 'context').correct).toBe(false);
    expect(gradeAnswer(phrase, 'Quiero verte a las nueve', 'context').correct).toBe(true);
  });
  it('grades English comprehension and never claims pronunciation accuracy', () => {
    const result = gradeAnswer(phrase, 'I want to see you at eight', 'comprehension');
    expect(result.correct).toBe(true);
    expect(result.feedback.toLowerCase()).not.toContain('pronunciation');
  });
  it('accepts English meaning without teaching annotations and with natural contractions', () => {
    const item = { ...phrase, spanish: '¿Cómo estás?', english: 'How are you? (informal)' };
    expect(gradeAnswer(item, 'How are you?', 'comprehension').correct).toBe(true);
    expect(gradeAnswer({ ...item, english: 'I am hungry. (male speaker)' }, "I'm hungry", 'comprehension').correct).toBe(true);
    expect(gradeAnswer({ ...item, english: 'You cannot go because it is raining.' }, "You can't go because it's raining", 'comprehension').correct).toBe(true);
  });
  it('accepts copied English model annotations without discarding unrelated learner words', () => {
    const item = { ...phrase, spanish: '¿Cómo estás?', english: 'How are you? (informal)' };
    expect(gradeAnswer(item, item.english, 'comprehension').correct).toBe(true);
    expect(gradeAnswer(item, 'How are you? (INFORMAL)', 'comprehension').correct).toBe(true);
    expect(gradeAnswer(item, 'How are you? (not really)', 'comprehension').correct).toBe(false);
    expect(gradeAnswer(item, '(informal)', 'comprehension').correct).toBe(false);
    const contraction = { ...item, english: 'I am hungry. (male speaker)' };
    expect(gradeAnswer(contraction, "I'm hungry (male speaker)", 'comprehension').correct).toBe(true);
  });
  it('only removes subjects when the following verb agrees with that subject', () => {
    const item = { ...phrase, spanish: 'Me gustaría aprender a bailar.', alternatives: [] };
    expect(gradeAnswer(item, 'Yo me gustaría aprender a bailar', 'recall').correct).toBe(false);
    expect(gradeAnswer({ ...item, spanish: 'Me levanto a las ocho.' }, 'Yo me levanto a las ocho', 'recall').correct).toBe(true);
    expect(gradeAnswer(phrase, 'Tú quiero verte a las ocho', 'recall').correct).toBe(false);
  });
  it('diagnoses a clear subject and verb mismatch when the rest matches the target', () => {
    const wrongVerb = gradeAnswer(phrase, 'Yo quieres verte a las ocho', 'recall');
    expect(wrongVerb.error).toBe('language');
    expect(wrongVerb.feedback).toContain('quiero');
    expect(wrongVerb.feedback).toContain('yo');
    const wrongSubject = gradeAnswer(phrase, 'Tú quiero verte a las ocho', 'recall');
    expect(wrongSubject.error).toBe('language');
    expect(wrongSubject.feedback).toContain('subject');
    const plural = { ...phrase, spanish: 'Tenemos una reserva.', alternatives: [] };
    expect(gradeAnswer(plural, 'Nosotros tengo una reserva', 'recall').error).toBe('language');
    expect(gradeAnswer(plural, 'Nosotros tenemos una reserva', 'recall').correct).toBe(true);
  });
  it('identifies a changed target person in clear attached and separate pronouns', () => {
    const attached = gradeAnswer(phrase, 'Quiero verme a las ocho', 'recall');
    expect(attached.error).toBe('language');
    expect(attached.feedback).toContain('te');
    expect(attached.feedback).toContain('you');
    const separate = gradeAnswer(phrase, 'Me quiero ver a las ocho', 'recall');
    expect(separate.error).toBe('language');
    expect(gradeAnswer(phrase, 'Quiero verme a las nueve', 'context').error).toBe('language');
    expect(gradeAnswer(phrase, 'Te quiero ver a las ocho', 'recall').correct).toBe(true);
  });
  it('explains an extra subject in the taught me gustaría pattern conservatively', () => {
    const item = { ...phrase, spanish: 'Me gustaría aprender a bailar.', alternatives: [] };
    const grade = gradeAnswer(item, 'Yo me gustaría aprender a bailar', 'recall');
    expect(grade.error).toBe('language');
    expect(grade.feedback).toContain('me gustaría');
  });
  it('does not invent a grammar diagnosis for unrelated or ambiguous answers', () => {
    expect(gradeAnswer(phrase, 'Yo eres astronauta', 'recall').error).toBe('unrecognized');
    expect(gradeAnswer(phrase, 'Me gustan los museos', 'recall').error).toBe('unrecognized');
    expect(gradeAnswer(phrase, 'I want to see myself at eight', 'comprehension').error).toBe('unrecognized');
    const indirect = { ...phrase, spanish: 'Quiero verlo.', alternatives: [] };
    expect(gradeAnswer(indirect, 'Quiero verle', 'recall').error).not.toBe('language');
  });
  it('flags small spelling slips without accepting unrecognized answers', () => {
    expect(gradeAnswer(phrase, 'Quiero verte a las ochp', 'recall').error).toBe('spelling');
    expect(gradeAnswer(phrase, 'Quisiera verte a las ocho', 'recall').correct).toBe(false);
    expect(gradeAnswer(phrase, '', 'recall').correct).toBe(false);
  });
});

describe('learning evidence and sessions', () => {
  it('introduces new language with support and preserves it in a backup', () => {
    const state = started();
    expect(state.session?.exercise).toMatchObject({ phraseId: phrase.id, introduced: true, support: 'introduced', answered: false });
    expect(importBackup(exportBackup(state))).toEqual(state);
    const answered = submitAnswer(state, units, phrase.spanish, now);
    expect(answered.progress[phrase.id]).toMatchObject({ stage: 'supported', independentCount: 0, interval: 0 });
    expect(answered.session?.exercise?.answered).toBe(true);
    expect(answered.session?.exercise?.feedback).toBeTruthy();
  });
  it('hides a familiar answer and hint/reveal cannot count as independent recall after reload', () => {
    const state = familiar();
    expect(state.session?.exercise).toMatchObject({ introduced: false, support: 'none' });
    const hinted = importBackup(exportBackup(giveHint(state)));
    expect(submitAnswer(hinted, units, phrase.spanish, now).progress[phrase.id].independentCount).toBe(0);
    const revealed = revealAnswer(state);
    expect(submitAnswer(revealed, units, phrase.spanish, now).progress[phrase.id].independentCount).toBe(0);
  });
  it('advances unaided recall through 1, 3, 7 and 14 day intervals', () => {
    let state = familiar();
    let at = now;
    for (const interval of [1, 3, 7, 14]) {
      state = submitAnswer(state, units, phrase.spanish, at);
      expect(state.progress[phrase.id].interval).toBe(interval);
      expect(state.progress[phrase.id].due).toBe(new Date(at.getTime() + interval*86_400_000).toISOString());
      state = stopSession(state, at);
      at = new Date(at.getTime() + interval*86_400_000);
      state = startSession(state, units, 'review', undefined, at);
      // Review may include transfer after independent evidence; use that prompt's curated answer.
      if (state.session?.exercise) state.session.exercise.kind = 'recall';
    }
  });
  it('does not inflate the interval through immediate repeat practice', () => {
    let state = submitAnswer(familiar(), units, phrase.spanish, now);
    state = stopSession(state, now);
    state = startSession(state, [{ ...units[0], phrases: [phrase] }], 'lesson', 'a1-basics', now);
    const exercise = state.session!.exercise!;
    state = submitAnswer(state, units, exercise.kind === 'context' ? phrase.contextAnswers[0] : phrase.spanish, now);
    expect(state.progress[phrase.id].interval).toBe(1);
    expect(state.progress[phrase.id].independentCount).toBe(1);
  });
  it('keeps incorrect feedback, offers one supported retry, and then revisits later', () => {
    const initial = familiar();
    initial.session!.mode = 'mixed';
    let state = submitAnswer(initial, units, 'No sé', now);
    expect(state.session?.exercise).toMatchObject({ answered: true, correct: false, retry: false });
    expect(state.progress[phrase.id].lapses).toBe(1);
    state = nextExercise(state, units, now);
    expect(state.session?.exercise).toMatchObject({ phraseId: phrase.id, retry: true, support: 'revealed', answered: false });
    state = submitAnswer(state, units, phrase.spanish, now);
    expect(state.progress[phrase.id].independentCount).toBe(0);
    state = nextExercise(state, units, now);
    expect(state.session?.exercise?.phraseId).toBe(second.id);
  });
  it('does not double-submit or skip unanswered exercises', () => {
    const initial = started();
    expect(nextExercise(initial, units, now)).toBe(initial);
    const answered = submitAnswer(initial, units, phrase.spanish, now);
    expect(submitAnswer(answered, units, phrase.spanish, now)).toBe(answered);
    expect(answered.attempts).toHaveLength(1);
  });
  it('resumes current sessions and archives once on stop', () => {
    const initial = started();
    expect(startSession(initial, units, 'mixed', undefined, now)).toBe(initial);
    const stopped = stopSession(initial, now);
    expect(stopped.history).toHaveLength(1);
    expect(stopSession(stopped, now).history).toHaveLength(1);
    expect(startSession(stopped, units, 'mixed', undefined, now).session?.id).not.toBe(initial.session?.id);
  });
  it('marks a practiced lesson complete without representing support as mastery', () => {
    let state = submitAnswer(started(), units, phrase.spanish, now);
    state = nextExercise(state, units, now);
    state = submitAnswer(state, units, second.spanish, now);
    expect(state.completedUnits).toContain('a1-basics');
    expect(stats(state, now).independent).toBe(0);
  });
  it('uses listening mode without awarding productive recall', () => {
    let state = stopSession(familiar(), now);
    state = startSession(state, units, 'listening', undefined, now);
    expect(state.session?.exercise?.kind).toBe('listening');
    state = submitAnswer(state, units, phrase.spanish, now);
    expect(state.progress[phrase.id].independentCount).toBe(0);
  });
  it('honors the mixed-session introduction limit while allowing unlimited familiar practice', () => {
    let state = createInitialState();
    state.settings.newPerSession = 1;
    state = startSession(state, units, 'mixed', undefined, now);
    state = submitAnswer(state, units, phrase.spanish, now);
    state = nextExercise(state, units, now);
    expect(state.session?.exercise?.phraseId).toBe(phrase.id);
    expect(state.session?.exercise?.introduced).toBe(false);
  });
  it('requires spaced evidence before contextual practice becomes transfer evidence', () => {
    let state = familiar();
    state.session!.mode = 'conversation';
    state.session!.exercise!.kind = 'context';
    state = submitAnswer(state, units, phrase.contextAnswers[0], now);
    expect(state.progress[phrase.id].stage).toBe('independent');
    state = stopSession(state, now);
    const tomorrow = new Date(now.getTime() + 86_400_000);
    state = startSession(state, [{ ...units[0], phrases: [phrase] }], 'conversation', undefined, tomorrow);
    state = submitAnswer(state, units, phrase.contextAnswers[0], tomorrow);
    expect(state.progress[phrase.id].stage).toBe('transfer');
    expect(state.progress[phrase.id].interval).toBe(3);
  });
  it('uses the selected course band when selecting new mixed practice', () => {
    const state = createInitialState();
    state.settings.level = 'B1';
    const advanced = { ...phrase, id: 'b1-opinion', unitId: 'b1-ideas' };
    const course = [...units, { ...units[0], id: 'b1-ideas', level: 'B1' as const, phrases: [advanced] }];
    expect(startSession(state, course, 'mixed', undefined, now).session?.exercise?.phraseId).toBe('b1-opinion');
  });
  it.each(['conversation', 'listening'] as const)('keeps unit-scoped %s practice inside that unit throughout a long session', mode => {
    const chosen = { ...phrase, id: 'a2-travel', unitId: 'a2-travel-unit' };
    const course = [...units, { ...units[0], id: 'a2-travel-unit', level: 'A2' as const, phrases: [chosen] }];
    let state = startSession(createInitialState(), course, mode, 'a2-travel-unit', now);
    for (let count = 0; count < 12; count++) {
      const exercise = state.session!.exercise!;
      expect(exercise.phraseId).toBe(chosen.id);
      const answer = exercise.kind === 'context' ? chosen.contextAnswers[0] : chosen.spanish;
      state = submitAnswer(state, course, answer, now);
      state = nextExercise(state, course, now);
    }
  });
  it('preserves demonstrated transfer when a later due recall succeeds', () => {
    let state = familiar();
    state.progress[phrase.id] = { ...state.progress[phrase.id], stage: 'transfer', independentCount: 3, interval: 7 };
    state = submitAnswer(state, units, phrase.spanish, now);
    expect(state.progress[phrase.id].stage).toBe('transfer');
    expect(state.progress[phrase.id].interval).toBe(14);
    expect(state.progress[phrase.id].independentCount).toBe(4);
  });
  it('keeps a due review scheduled after correct supported or recognition practice', () => {
    for (const variant of ['hint', 'revealed', 'listening', 'comprehension'] as const) {
      let state = familiar();
      state.progress[phrase.id] = { ...state.progress[phrase.id], stage: 'transfer', independentCount: 3, interval: 7 };
      if (variant === 'hint') state = giveHint(state);
      else if (variant === 'revealed') state = revealAnswer(state);
      else state.session!.exercise!.kind = variant;
      const answer = variant === 'comprehension' ? phrase.english : phrase.spanish;
      state = submitAnswer(state, units, answer, now);
      expect(state.progress[phrase.id]).toMatchObject({ stage: 'transfer', independentCount: 3, interval: 7, due: now.toISOString() });
    }
  });
  it('revisits an error after its five-minute delay during uninterrupted mixed practice', () => {
    const more = Array.from({ length: 6 }, (_, index) => ({ ...phrase, id: `item-${index}` }));
    const course = [{ ...units[0], phrases: more }];
    let state = createInitialState();
    state.settings.newPerSession = 3;
    state = startSession(state, course, 'mixed', undefined, now);
    state = submitAnswer(state, course, 'No sé', now);
    const delayedUntil = state.progress['item-0'].due;
    expect(delayedUntil).toBe(new Date(now.getTime() + 5 * 60_000).toISOString());
    let recovered = false;
    for (let count = 1; count <= 40; count++) {
      const at = new Date(now.getTime() + count * 30_000);
      state = nextExercise(state, course, at);
      const exercise = state.session!.exercise!;
      const currentPhrase = more.find(item => item.id === exercise.phraseId)!;
      const answer = exercise.kind === 'context' ? currentPhrase.contextAnswers[0] : exercise.kind === 'comprehension' ? currentPhrase.english : currentPhrase.spanish;
      state = submitAnswer(state, course, answer, at);
      if (at.getTime() < Date.parse(delayedUntil)) expect(state.progress['item-0'].independentCount).toBe(0);
      if (state.progress['item-0'].independentCount > 0) recovered = true;
    }
    expect(recovered).toBe(true);
    expect(new Set(state.attempts.filter(attempt => attempt.support === 'introduced').map(attempt => attempt.phraseId)).size).toBe(3);
    expect(state.session?.count).toBe(41);
  });
  it('finishes every phrase in a unit and continues familiar practice without new-limit dead ends', () => {
    const more = Array.from({ length: 6 }, (_, index) => ({ ...phrase, id: `lesson-${index}` }));
    const course = [{ ...units[0], phrases: more }];
    let state = createInitialState();
    state.settings.newPerSession = 2;
    state = startSession(state, course, 'lesson', 'a1-basics', now);
    for (let count = 0; count < 40; count++) {
      const exercise = state.session!.exercise!;
      const currentPhrase = more.find(item => item.id === exercise.phraseId)!;
      const answer = exercise.kind === 'context' ? currentPhrase.contextAnswers[0] : exercise.kind === 'comprehension' ? currentPhrase.english : currentPhrase.spanish;
      state = submitAnswer(state, course, answer, now);
      state = nextExercise(state, course, now);
    }
    expect(state.completedUnits).toEqual(['a1-basics']);
    expect(Object.keys(state.progress)).toHaveLength(6);
    expect(Object.values(state.progress).every(item => item.independentCount === 1)).toBe(true);
    expect(state.session?.exercise?.introduced).toBe(false);
  });
  it('includes user phrasebook additions in practice and due items', () => {
    const state = createInitialState();
    state.customPhrases = [{ ...phrase, id: 'custom-coffee', unitId: 'custom', spanish: 'Un café, por favor.' }];
    expect(allPhrases(units, state)).toHaveLength(3);
    state.progress['custom-coffee'] = { phraseId: 'custom-coffee', stage: 'supported', interval: 0, due: now.toISOString(), lastPracticed: now.toISOString(), independentCount: 0, lapses: 0, attempts: 1 };
    expect(duePhrases(state, units, now).map(item => item.id)).toContain('custom-coffee');
  });
  it('remains usable with an empty course and no due reviews', () => {
    expect(startSession(createInitialState(), [], 'mixed', undefined, now).session?.exercise).toBeNull();
    expect(startSession(createInitialState(), units, 'review', undefined, now).session?.exercise).toBeNull();
  });
  it('calculates daily evidence without counting introductions as independent', () => {
    const state = submitAnswer(started(), units, phrase.spanish, now);
    expect(stats(state, now)).toMatchObject({ todayAttempts: 1, todayCorrect: 1, todayIndependent: 0, streak: 1, totalAttempts: 1, accuracy: 100 });
  });
});

describe('safe backup and external session imports', () => {
  it('round trips complete state and rejects unknown/malformed schemas', () => {
    expect(importBackup(exportBackup(createInitialState()))).toEqual(createInitialState());
    for (const text of ['{', 'null', '{}', '{"version":2}', '[1,2]']) expect(() => importBackup(text)).toThrow();
  });
  it('rejects dangerous keys, oversized input, invalid dates and poisoned progress', () => {
    expect(() => importBackup('{"__proto__":{"polluted":true}}')).toThrow();
    expect(() => importBackup(' '.repeat(16_000_001))).toThrow();
    const invalid = started();
    invalid.session!.startedAt = 'yesterday';
    expect(() => importBackup(JSON.stringify(invalid))).toThrow();
    const bad = createInitialState();
    bad.settings.dailyMinutes = Infinity;
    expect(() => importBackup(JSON.stringify(bad))).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const inherited = createInitialState();
    inherited.customPhrases = [{ ...phrase, id: 'toString' }];
    expect(() => importBackup(JSON.stringify(inherited))).toThrow();
  });
  it('rejects invalid nested attempts and unsupported support types', () => {
    const state = submitAnswer(started(), units, phrase.spanish, now);
    const object = JSON.parse(exportBackup(state));
    object.attempts[0].support = 'magic';
    expect(() => importBackup(JSON.stringify(object))).toThrow();
  });
  it('rejects unavailable active content when the current course is supplied, without dropping history', () => {
    const state = started();
    state.session!.exercise!.phraseId = 'not-in-this-course';
    expect(validateSessionReferences(state, units)).toContain('unavailable');
    expect(() => importBackup(exportBackup(state), units)).toThrow(/unavailable/);
    // Without course context, low-level storage can still recover the data for the UI.
    expect(importBackup(exportBackup(state)).session?.exercise?.phraseId).toBe('not-in-this-course');
    const stopped = stopSession(state, now);
    expect(importBackup(exportBackup(stopped), units).history).toHaveLength(1);
  });
  it('rejects a mismatched scoped exercise while accepting an active custom phrase', () => {
    const state = started();
    state.customPhrases = [{ ...phrase, id: 'custom-example', unitId: 'custom' }];
    state.session!.exercise!.phraseId = 'custom-example';
    expect(() => importBackup(exportBackup(state), units)).toThrow(/outside/);
    state.session!.unitId = 'custom';
    expect(importBackup(exportBackup(state), units).session?.exercise?.phraseId).toBe('custom-example');
  });
  it('imports coach sessions atomically, regrades, and deduplicates repeated files', () => {
    const text = JSON.stringify({ format: 'habla-session', version: 1, observations: [{ spanish: phrase.spanish, english: phrase.english, response: 'incorrect', support: 'none', correct: true }, { spanish: second.spanish, english: second.english, response: second.spanish, support: 'revealed', correct: true }] });
    const state = importCoachingSession(text, createInitialState(), units);
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[0].correct).toBe(false);
    expect(state.progress[second.id].independentCount).toBe(0);
    expect(importCoachingSession(text, state, units).attempts).toHaveLength(2);
    expect(() => importCoachingSession(text.replace('revealed', 'invalid'), state, units)).toThrow();
    expect(state.attempts).toHaveLength(2);
  });
  it('adds new coach vocabulary as custom phrases and supplies an explicit handoff schema', () => {
    const text = JSON.stringify({ format: 'habla-session', version: 1, observations: [{ spanish: 'Necesito una mesa.', english: 'I need a table.', response: 'Necesito una mesa.', support: 'introduced', correct: true }], nextPrompt: 'Ask for a table for two.' });
    const state = importCoachingSession(text, createInitialState(), units);
    expect(state.customPhrases).toHaveLength(1);
    expect(exportCoachHandoff(state, units)).toContain('habla-session');
    expect(exportCoachHandoff(state, units)).not.toContain('automatic sync');
    expect(importBackup(exportBackup(state)).coachingNote).toBe('Ask for a table for two.');
  });
});

describe('storage failures', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('returns fresh progress for missing data', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    expect(loadState()).toEqual({ state: createInitialState(), error: null });
  });
  it('reports corrupted data and never automatically overwrites it', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => '{bad', setItem });
    expect(loadState().error).toBeTruthy();
    expect(setItem).not.toHaveBeenCalled();
  });
  it('reports blocked/full storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } });
    expect(loadState().error).toBeTruthy();
    expect(saveState(createInitialState())).toBeTruthy();
  });
});
