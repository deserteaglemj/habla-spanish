import { parseMissionSession } from './missions';
import { parseRoleplaySession } from './roleplay';
import type { AppState, Attempt, Exercise, ExerciseKind, Grade, Mode, Phrase, PhraseProgress, Session, Unit } from '../types';

const DAY = 86_400_000;
const MAX_COACHING_BYTES = 16_000_000;
const MAX_ATTEMPTS = 10_000;
const MAX_HISTORY = 500;
const forbidden = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
let sequence = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const iso = (now: Date) => now.toISOString();
const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}'\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export function createInitialState(): AppState {
  return {
    version: 1,
    settings: { dailyMinutes: 10, newPerSession: 4, speechRate: 0.85, voiceURI: '', sound: true, level: 'A1', reviewIntervals: [1, 3, 7, 14] },
    progress: {}, attempts: [], session: null, history: [], customPhrases: [], bookmarks: [], completedUnits: [],
  };
}

export function allPhrases(units: Unit[], state: AppState): Phrase[] {
  const seen = new Set<string>();
  return [...units.flatMap(unit => unit.phrases), ...state.customPhrases].filter(phrase => {
    if (seen.has(phrase.id)) return false;
    seen.add(phrase.id);
    return true;
  });
}

// Spanish often omits the subject. Only remove a subject when the following
// conjugated verb establishes the same person, so "tú quiero" is not accepted.
function omitOptionalSubject(text: string): string {
  const patterns = [
    /^yo (?=(?:(?:me|te|lo|la|le|nos|los|las|les) )?(?:quiero|soy|estoy|tengo|puedo|voy|necesito|hablo|vivo|llamo|levanto|despierto|acuesto|ducho|prefiero|busco|entiendo|se|trabajo|estudio|como|bebo|hago|fui|estuve|he|habia|pensaba|creo|pienso|siento|espero|llevo|debo|quisiera)\b)/,
    /^tu (?=(?:(?:me|te|lo|la|le|nos|los|las|les) )?(?:quieres|eres|estas|tienes|puedes|vas|necesitas|hablas|vives|llamas|levantas|despiertas|acuestas|duchas|prefieres|buscas|entiendes|sabes|trabajas|estudias|comes|bebes|haces|fuiste|has)\b)/,
    /^nosotr[oa]s (?=(?:(?:te|lo|la|le|nos|los|las|les) )?(?:queremos|somos|estamos|tenemos|podemos|vamos|necesitamos|hablamos|vivimos|llamamos|levantamos|despertamos|acostamos|duchamos|preferimos|buscamos|entendemos|sabemos|trabajamos|estudiamos|comemos|bebemos|hacemos|fuimos|hemos)\b)/,
  ];
  for (const pattern of patterns) text = text.replace(pattern, '');
  return text;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

export function gradeAnswer(phrase: Phrase, response: string, kind: ExerciseKind): Grade {
  const annotations = new Set(Array.from(phrase.english.matchAll(/\(([^)]*)\)/g), match => normalize(match[1])));
  const prepare = (text: string) => normalize(kind === 'comprehension' ? text.replace(/\(([^)]*)\)/g, (whole, annotation: string) => annotations.has(normalize(annotation)) ? ' ' : whole) : text);
  const value = prepare(response.slice(0, 2_000));
  const candidates = kind === 'context' ? phrase.contextAnswers : kind === 'comprehension' ? [phrase.english] : [phrase.spanish, ...phrase.alternatives];
  const simplify = kind === 'comprehension' ? (text: string) => text
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\b(you|we|they)'re\b/g, '$1 are')
    .replace(/\b(it|he|she|that|there|what|who)'s\b/g, '$1 is')
    .replace(/\b(i|you|we|they)'ve\b/g, '$1 have')
    .replace(/\b(i|you|he|she|it|we|they)'ll\b/g, '$1 will')
    .replace(/\b(i|you|he|she|we|they)'d\b/g, '$1 would')
    .replace(/\bwon't\b/g, 'will not').replace(/\bcan't\b|\bcan not\b/g, 'cannot')
    .replace(/\b(do|does|did|is|are|was|were|have|has|had|would|should|could|must)n't\b/g, '$1 not')
    .replace(/\blet's\b/g, 'let us') : omitOptionalSubject;
  const normalized = simplify(value);
  const answers = candidates.map(candidate => simplify(prepare(candidate)));
  if (!value) return { correct: false, error: 'unrecognized', normalized, feedback: 'Try an answer first. You can use a hint or reveal the model when you need support.' };
  if (answers.includes(normalized)) {
    const feedback = kind === 'context' ? 'That works in this new situation.' : kind === 'listening' ? 'Your transcription matches the sentence.' : kind === 'comprehension' ? 'You understood the meaning.' : kind === 'fluency' ? 'That familiar phrase came through.' : 'That expresses the idea correctly.';
    return { correct: true, error: 'none', normalized, feedback };
  }
  if (kind !== 'comprehension') {
    const languageError = (feedback: string): Grade => ({ correct: false, error: 'language', normalized, feedback });
    // Diagnose only a small, unambiguous change to a supported model. Regular
    // forms such as hablo/habló are excluded because accents are optional here.
    const subjects: Record<string, number> = { yo: 0, tu: 1, el: 2, ella: 2, usted: 2, nosotros: 3, nosotras: 3, vosotros: 4, vosotras: 4, ellos: 5, ellas: 5, ustedes: 5 };
    const subjectNames = ['yo', 'tú', 'él / ella / usted', 'nosotros / nosotras', 'vosotros / vosotras', 'ellos / ellas / ustedes'];
    const conjugations = [
      ['soy', 'eres', 'es', 'somos', 'sois', 'son'],
      ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'],
      ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'],
      ['quiero', 'quieres', 'quiere', 'queremos', 'queréis', 'quieren'],
      ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden'],
      ['voy', 'vas', 'va', 'vamos', 'vais', 'van'],
      ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
    ];
    const words = value.split(' ');
    const person = subjects[words[0]];
    if (typeof person === 'number') {
      const verbIndex = ['me', 'te', 'lo', 'la', 'le', 'nos', 'os', 'los', 'las', 'les'].includes(words[1]) ? 2 : 1;
      const group = conjugations.find(forms => forms.map(normalize).includes(words[verbIndex]));
      if (group && normalize(group[person]) !== words[verbIndex]) {
        const repaired = [...words];
        repaired[verbIndex] = normalize(group[person]);
        if (answers.includes(omitOptionalSubject(repaired.join(' '))) || answers.includes(repaired.slice(1).join(' '))) {
          return languageError(`Match the subject and verb: with «${subjectNames[person]}», use «${group[person]}» instead of «${words[verbIndex]}». The rest follows the model.`);
        }
        if (answers.includes(omitOptionalSubject(words.slice(1).join(' ')))) {
          const verbPerson = group.map(normalize).indexOf(words[verbIndex]);
          return languageError(`The subject does not agree with the verb. In this model, «${words[verbIndex]}» goes with «${subjectNames[verbPerson]}», not «${subjectNames[person]}». Match the person requested by the prompt.`);
        }
      }
    }
    for (const answer of answers) {
      const liking = answer.match(/^(me (?:gusta|gustan|gustaria))\b/);
      if (liking && value === `yo ${answer}`) {
        const pattern = liking[1].replace('gustaria', 'gustaría');
        return languageError(`For this meaning, use «${pattern}» without «yo». Here «me» marks the person who likes or would like something. Follow the model's structure.`);
      }
      const expected = answer.split(' ');
      const actual = normalized.split(' ');
      if (expected.length !== actual.length) continue;
      const differences = expected.flatMap((word, index) => word === actual[index] ? [] : [index]);
      if (differences.length !== 1) continue;
      const index = differences[0];
      const people: Record<string, string> = { me: 'me / myself', te: 'you / yourself', nos: 'us / ourselves' };
      let wanted = expected[index];
      let used = actual[index];
      const attachedPattern = /^(ver|ayudar|llamar|conocer|escuchar|decir|comprar|traer|dar|esperar|encontrar|visitar|acompanar)(me|te|nos)$/;
      const wantedAttached = wanted.match(attachedPattern);
      const usedAttached = used.match(attachedPattern);
      if (wantedAttached && usedAttached && wantedAttached[1] === usedAttached[1]) {
        wanted = wantedAttached[2]; used = usedAttached[2];
      }
      if (Object.hasOwn(people, wanted) && Object.hasOwn(people, used)) {
        return languageError(`Check which person the prompt refers to. The model uses «${wanted}» (${people[wanted]}), while «${used}» refers to ${people[used]}. Keep the rest of the phrase and match that person.`);
      }
    }
  }
  const spelling = normalized.length > 5 && normalized.length < 300 && answers.some(answer => editDistance(normalized, answer) <= 1);
  return {
    correct: false, error: spelling ? 'spelling' : 'unrecognized', normalized,
    feedback: spelling ? 'Almost: check the spelling against the model. Accents and punctuation are already accepted.' : 'This answer does not match the supported examples. Another phrasing may be valid. Compare the model and try its structure.',
  };
}

export function duePhrases(state: AppState, units: Unit[], now = new Date()): Phrase[] {
  return allPhrases(units, state).filter(phrase => state.progress[phrase.id] && Date.parse(state.progress[phrase.id].due) <= now.getTime()).sort((a, b) => Date.parse(state.progress[a.id].due) - Date.parse(state.progress[b.id].due));
}

export function fluentPhrases(state: AppState, units: Unit[]): Phrase[] {
  return allPhrases(units, state).filter(phrase => {
    const stage = state.progress[phrase.id]?.stage;
    return stage === 'independent' || stage === 'transfer';
  });
}

// A visible sentence pace for familiar-language practice. It is not a score,
// a deadline, or evidence of pronunciation.
export function fluencyPaceSeconds(prompt: string): number {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(30, Math.max(8, Math.ceil(words * 1.6)));
}

function selectExercise(state: AppState, units: Unit[], now: Date): Exercise | null {
  const session = state.session;
  if (!session) return null;
  const all = allPhrases(units, state);
  let pool = session.unitId ? all.filter(phrase => phrase.unitId === session.unitId) : all;
  if (session.mode === 'fluency') {
    const familiar = pool.filter(phrase => ['independent', 'transfer'].includes(state.progress[phrase.id]?.stage ?? ''));
    if (!familiar.length) return null;
    const avoid = familiar.length > 1 ? session.practicedIds.slice(-Math.min(2, familiar.length - 1)) : [];
    const available = familiar.filter(phrase => !avoid.includes(phrase.id));
    const choices = (available.length ? available : familiar).sort((a, b) => Date.parse(state.progress[a.id].lastPracticed) - Date.parse(state.progress[b.id].lastPracticed));
    return { phraseId: choices[0].id, kind: 'fluency', introduced: false, support: 'none', answered: false, response: '', retry: false };
  }
  if (session.mode === 'review') pool = pool.filter(phrase => state.progress[phrase.id]);
  const introductions = new Set(state.attempts.filter(attempt => attempt.at >= session.startedAt && attempt.support === 'introduced').map(attempt => attempt.phraseId)).size;
  const allowNew = session.mode === 'lesson' || introductions < state.settings.newPerSession;
  if (!allowNew && pool.some(phrase => state.progress[phrase.id])) pool = pool.filter(phrase => state.progress[phrase.id]);
  if (!pool.length) return null;
  const recent = session.practicedIds.slice(-2);
  const notRecent = pool.filter(phrase => !recent.includes(phrase.id));
  if (notRecent.length) pool = notRecent;
  const due = pool.filter(phrase => state.progress[phrase.id] && Date.parse(state.progress[phrase.id].due) <= now.getTime()).sort((a, b) => Date.parse(state.progress[a.id].due) - Date.parse(state.progress[b.id].due));
  const unseen = pool.filter(phrase => !state.progress[phrase.id]);
  if (session.mode !== 'lesson') {
    const preferredUnits = new Set(units.filter(unit => unit.level === state.settings.level).map(unit => unit.id));
    unseen.sort((a, b) => Number(preferredUnits.has(b.unitId)) - Number(preferredUnits.has(a.unitId)));
  }
  const learned = pool.filter(phrase => state.progress[phrase.id]).sort((a, b) => Date.parse(state.progress[a.id].lastPracticed) - Date.parse(state.progress[b.id].lastPracticed));
  let phrase: Phrase | undefined;
  if (session.mode === 'lesson') phrase = unseen[0] ?? due[0] ?? learned[0];
  else if (session.mode === 'review') phrase = due[0] ?? learned[0];
  else if (allowNew && session.count % 4 === 3 && unseen.length) phrase = unseen[0];
  else phrase = due[0] ?? (allowNew ? unseen[0] : undefined) ?? learned[0] ?? unseen[0];
  if (!phrase) return null;
  const introduced = !state.progress[phrase.id];
  let kind: ExerciseKind = 'recall';
  if (!introduced) {
    if (session.mode === 'listening') kind = 'listening';
    else if (session.mode === 'conversation' && phrase.contextAnswers.length) kind = 'context';
    else if (session.mode === 'mixed' || session.mode === 'lesson') {
      const kinds: ExerciseKind[] = ['recall', 'listening', 'comprehension', 'context'];
      kind = kinds[session.count % kinds.length];
      if (kind === 'context' && (!phrase.contextAnswers.length || !['independent', 'transfer'].includes(state.progress[phrase.id].stage))) kind = 'recall';
    } else if (session.count % 3 === 2 && phrase.contextAnswers.length) kind = 'context';
  }
  return { phraseId: phrase.id, kind, introduced, support: introduced ? 'introduced' : 'none', answered: false, response: '', retry: false };
}

export function startSession(state: AppState, units: Unit[], mode: Mode, unitId?: string, now = new Date()): AppState {
  if (state.session && !state.session.stoppedAt) return state;
  const session: Session = { id: uid('session'), startedAt: iso(now), updatedAt: iso(now), mode, ...(unitId ? { unitId } : {}), count: 0, correct: 0, supported: 0, practicedIds: [], exercise: null };
  const next = { ...state, session };
  session.exercise = selectExercise(next, units, now);
  return next;
}

export function nextExercise(state: AppState, units: Unit[], now = new Date()): AppState {
  const session = state.session;
  if (!session || session.stoppedAt || (session.exercise && !session.exercise.answered)) return state;
  const current = session.exercise;
  if (current && current.correct === false && !current.retry) {
    return { ...state, session: { ...session, updatedAt: iso(now), exercise: { ...current, introduced: false, support: 'revealed', retry: true, answered: false, response: '', correct: undefined, feedback: undefined } } };
  }
  return { ...state, session: { ...session, updatedAt: iso(now), exercise: selectExercise(state, units, now) } };
}

function recordProgress(previous: PhraseProgress | undefined, phraseId: string, attempt: Attempt, settings: AppState['settings'], now: Date): PhraseProgress {
  const prior = previous ?? { phraseId, stage: 'introduced' as const, interval: 0, due: iso(now), lastPracticed: iso(now), independentCount: 0, lapses: 0, attempts: 0 };
  if (attempt.kind === 'fluency') {
    // Familiar-language repetition is activity, not new delayed-recall evidence.
    return { ...prior, attempts: prior.attempts + 1, lastPracticed: iso(now) };
  }
  const next = { ...prior, attempts: prior.attempts + 1, lastPracticed: iso(now) };
  const retrieval = attempt.kind === 'recall' || attempt.kind === 'context';
  const independent = attempt.correct && attempt.support === 'none' && retrieval;
  const due = Date.parse(prior.due) <= now.getTime();
  if (!attempt.correct) {
    next.lapses += 1;
    next.interval = 0;
    next.due = iso(new Date(now.getTime() + 5 * 60_000));
    if (next.stage === 'transfer' || next.stage === 'independent') next.stage = 'supported';
  } else if (independent && due) {
    next.independentCount += 1;
    const intervals = settings.reviewIntervals;
    const previousIndex = intervals.findIndex(interval => interval >= prior.interval);
    const index = prior.interval === 0 ? 0 : Math.min(Math.max(previousIndex, 0) + 1, intervals.length - 1);
    next.interval = intervals[index];
    next.due = iso(new Date(now.getTime() + next.interval * DAY));
    next.stage = prior.stage === 'transfer' || (attempt.kind === 'context' && next.independentCount >= 2) ? 'transfer' : 'independent';
  } else if (prior.stage === 'introduced') {
    next.stage = 'supported';
    // First production with a visible model is evidence of supported practice.
    // It remains due for an answer-hidden attempt later in this session.
    next.due = prior.due;
  }
  return next;
}

export function submitAnswer(state: AppState, units: Unit[], response: string, now = new Date()): AppState {
  const session = state.session;
  const exercise = session?.exercise;
  if (!session || session.stoppedAt || !exercise || exercise.answered || !response.trim()) return state;
  const phrase = allPhrases(units, state).find(item => item.id === exercise.phraseId);
  if (!phrase) return state;
  const answer = response.trim().slice(0, 2_000);
  const grade = gradeAnswer(phrase, answer, exercise.kind);
  const attempt: Attempt = { id: uid('attempt'), phraseId: phrase.id, at: iso(now), response: answer, correct: grade.correct, support: exercise.support, kind: exercise.kind, error: grade.error };
  const progress = { ...state.progress, [phrase.id]: recordProgress(state.progress[phrase.id], phrase.id, attempt, state.settings, now) };
  const attempts = [...state.attempts, attempt].slice(-MAX_ATTEMPTS);
  const completedUnits = [...state.completedUnits];
  if (session.mode === 'lesson' && session.unitId && !completedUnits.includes(session.unitId)) {
    const unit = units.find(item => item.id === session.unitId);
    if (unit?.phrases.length && unit.phrases.every(item => attempts.some(record => record.phraseId === item.id && record.correct))) completedUnits.push(unit.id);
  }
  let feedback = grade.feedback;
  if (exercise.kind === 'fluency') feedback += grade.correct ? ' Fluency practice recorded. Your spaced-review date stays the same.' : exercise.retry ? ' We will keep this familiar phrase available. Your review schedule stays the same.' : ' Continue for one supported retry. This does not change your review date.';
  else if (grade.correct && exercise.support !== 'none') feedback += ' Supported practice recorded. You will recall it without the model later.';
  else if (grade.correct && (exercise.kind === 'recall' || exercise.kind === 'context') && progress[phrase.id].independentCount > (state.progress[phrase.id]?.independentCount ?? 0)) feedback += ` Independent recall recorded. Review in ${progress[phrase.id].interval} day${progress[phrase.id].interval === 1 ? '' : 's'}.`;
  else if (grade.correct) feedback += ' Practice recorded. Your next scheduled review stays the same.';
  else if (!exercise.retry) feedback += ' Continue for one supported retry.';
  else feedback += ' We will revisit this after other material.';
  return { ...state, progress, attempts, completedUnits, session: { ...session, updatedAt: iso(now), count: session.count + 1, correct: session.correct + Number(grade.correct), supported: session.supported + Number(exercise.support !== 'none'), practicedIds: [...session.practicedIds, phrase.id].slice(-500), exercise: { ...exercise, answered: true, response: answer, correct: grade.correct, feedback } } };
}

export function giveHint(state: AppState): AppState {
  const session = state.session;
  if (!session || session.stoppedAt || !session.exercise || session.exercise.answered || session.exercise.support !== 'none') return state;
  return { ...state, session: { ...session, exercise: { ...session.exercise, support: 'hint' } } };
}

export function revealAnswer(state: AppState): AppState {
  const session = state.session;
  if (!session || session.stoppedAt || !session.exercise || session.exercise.answered || session.exercise.support === 'introduced') return state;
  return { ...state, session: { ...session, exercise: { ...session.exercise, support: 'revealed' } } };
}

export function stopSession(state: AppState, now = new Date()): AppState {
  if (!state.session || state.session.stoppedAt) return state;
  const session = { ...state.session, stoppedAt: iso(now), updatedAt: iso(now) };
  return { ...state, session, history: [...state.history.filter(item => item.id !== session.id), session].slice(-MAX_HISTORY) };
}

function dateKey(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }

export function activityAttempts(state: AppState): Attempt[] {
  const sessions = new Map((state.roleplayHistory || []).map(session => [session.id, session]));
  if (state.roleplay) sessions.set(state.roleplay.id, state.roleplay);
  const roleplay = [...sessions.values()].flatMap(session => session.attempts.map(attempt => ({ ...attempt, id: `roleplay:${session.id}:${attempt.id}`, phraseId: `roleplay:${session.unitId}:${attempt.turnIndex}`, kind: 'context' as const })));
  const missions = new Map((state.missionHistory || []).map(session => [session.id, session]));
  if (state.mission) missions.set(state.mission.id, state.mission);
  const missionAttempts: Attempt[] = [...missions.values()].flatMap(session => session.attempts.map(attempt => ({
    id: `mission:${session.id}:${attempt.phase}:${attempt.index}`, phraseId: `mission:${session.unitId}:${attempt.phase}:${attempt.index}`,
    at: attempt.at, response: attempt.response, correct: attempt.correct,
    support: attempt.support === 'model' ? 'revealed' : attempt.support === 'english' ? 'hint' : 'none',
    kind: attempt.phase === 'adapt' ? 'context' : 'recall', error: attempt.correct ? 'none' : 'unrecognized',
  })));
  return [...state.attempts, ...roleplay, ...missionAttempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function stats(state: AppState, now = new Date()) {
  const activity = activityAttempts(state);
  const today = dateKey(now);
  const todayAttempts = activity.filter(attempt => dateKey(new Date(attempt.at)) === today);
  const practicedDays = new Set(activity.map(attempt => dateKey(new Date(attempt.at))));
  let streak = 0;
  const cursor = new Date(now);
  if (!practicedDays.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (practicedDays.has(dateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  // Count active practice time from answer gaps, capped at two minutes per gap.
  // An open tab or paused session must not create hours of imaginary study.
  const elapsed = (attempts: Attempt[]) => {
    let milliseconds = 0;
    attempts.forEach((attempt, index) => {
      const gap = index ? Date.parse(attempt.at) - Date.parse(attempts[index - 1].at) : 30_000;
      milliseconds += gap > 0 && gap <= 120_000 ? gap : 30_000;
    });
    return Math.round(milliseconds / 60_000);
  };
  const progress = Object.values(state.progress);
  const isIndependent = (attempt: Attempt) => !attempt.id.startsWith('mission:') && attempt.correct && attempt.support === 'none' && (attempt.kind === 'recall' || attempt.kind === 'context');
  return {
    totalAttempts: progress.reduce((total, item) => total + item.attempts, 0) + (state.roleplayAttemptCount ?? activity.filter(attempt => attempt.id.startsWith('roleplay:')).length) + (state.missionAttemptCount ?? activity.filter(attempt => attempt.id.startsWith('mission:')).length),
    todayAttempts: todayAttempts.length,
    todayCorrect: todayAttempts.filter(attempt => attempt.correct).length,
    todayIndependent: todayAttempts.filter(isIndependent).length,
    accuracy: activity.length ? Math.round(activity.filter(attempt => attempt.correct).length / activity.length * 100) : 0,
    streak, totalMinutes: elapsed(activity), todayMinutes: elapsed(todayAttempts),
    totalSessions: state.history.filter(session => session.count > 0).length + (state.roleplayHistory || []).filter(session => session.attempts.length > 0).length + (state.missionHistory || []).filter(session => session.attempts.length > 0).length,
    phrasesPracticed: progress.length,
    introduced: progress.filter(item => item.stage === 'introduced').length,
    supported: progress.filter(item => item.stage === 'supported').length,
    independent: progress.filter(item => item.stage === 'independent' || item.stage === 'transfer').length,
    transfer: progress.filter(item => item.stage === 'transfer').length,
    completedUnits: state.completedUnits.length,
    due: progress.filter(item => Date.parse(item.due) <= now.getTime()).length,
  };
}

type Dict = Record<string, unknown>;
function fail(message: string): never { throw new Error(`Could not import: ${message}`); }
function object(value: unknown, label: string, keys?: string[]): Dict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const result = value as Dict;
  if (keys && Object.keys(result).some(key => !keys.includes(key))) fail(`${label} contains an unsupported field.`);
  return result;
}
function text(value: unknown, label: string, max = 2_000, empty = true): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`${label} must be text of ${max} characters or fewer.`);
  return value;
}
function identifier(value: unknown, label: string): string {
  const valueText = text(value, label, 120, false);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(valueText) || forbidden.has(valueText)) fail(`${label} is not a valid identifier.`);
  return valueText;
}
function number(value: unknown, label: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${label} is outside its allowed range.`);
  return value;
}
function boolean(value: unknown, label: string): boolean { if (typeof value !== 'boolean') fail(`${label} must be true or false.`); return value; }
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T { if (typeof value !== 'string' || !choices.includes(value as T)) fail(`${label} is not recognized.`); return value as T; }
function date(value: unknown, label: string): string {
  const dateText = text(value, label, 40, false);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(dateText) || !Number.isFinite(Date.parse(dateText))) fail(`${label} must be a valid timestamp.`);
  return dateText;
}
function array<T>(value: unknown, label: string, max: number, parse: (item: unknown, label: string) => T): T[] {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be a list of ${max} items or fewer.`);
  return value.map((item, index) => parse(item, `${label}[${index}]`));
}
const stringList = (value: unknown, label: string, max = 50) => array(value, label, max, (item, name) => text(item, name));
const supports = ['none', 'hint', 'revealed', 'introduced'] as const;
const kinds = ['recall', 'listening', 'context', 'comprehension', 'fluency'] as const;

function parseJson(input: string, maxBytes?: number): unknown {
  if (typeof input !== 'string') fail('the file must contain JSON text.');
  if (maxBytes !== undefined && new TextEncoder().encode(input).byteLength > maxBytes) fail('the coaching file is too large (maximum 16 MB).');
  let result: unknown;
  try { result = JSON.parse(input); } catch { fail('the file is not valid JSON.'); }
  function inspect(value: unknown, depth: number) {
    if (depth > 20) fail('the data is nested too deeply.');
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (forbidden.has(key)) fail('unsafe object keys are not allowed.');
      inspect((value as Dict)[key], depth + 1);
    }
  }
  inspect(result, 0);
  return result;
}

function parsePhrase(value: unknown, label: string): Phrase {
  const item = object(value, label, ['id', 'unitId', 'spanish', 'english', 'alternatives', 'explanation', 'hint', 'example', 'exampleEnglish', 'context', 'contextAnswers', 'tags']);
  return { id: identifier(item.id, `${label}.id`), unitId: identifier(item.unitId, `${label}.unitId`), spanish: text(item.spanish, `${label}.spanish`, 2_000, false), english: text(item.english, `${label}.english`, 2_000, false), alternatives: stringList(item.alternatives, `${label}.alternatives`), explanation: text(item.explanation, `${label}.explanation`), hint: text(item.hint, `${label}.hint`), example: text(item.example, `${label}.example`), exampleEnglish: text(item.exampleEnglish, `${label}.exampleEnglish`), context: text(item.context, `${label}.context`), contextAnswers: stringList(item.contextAnswers, `${label}.contextAnswers`), tags: stringList(item.tags, `${label}.tags`, 20) };
}
function parseAttempt(value: unknown, label: string): Attempt {
  const item = object(value, label, ['id', 'phraseId', 'at', 'response', 'correct', 'support', 'kind', 'error']);
  return { id: identifier(item.id, `${label}.id`), phraseId: identifier(item.phraseId, `${label}.phraseId`), at: date(item.at, `${label}.at`), response: text(item.response, `${label}.response`), correct: boolean(item.correct, `${label}.correct`), support: choice(item.support, supports, `${label}.support`), kind: choice(item.kind, kinds, `${label}.kind`), error: choice(item.error, ['none', 'language', 'spelling', 'unrecognized'], `${label}.error`) };
}
function parseExercise(value: unknown, label: string): Exercise | null {
  if (value === null) return null;
  const item = object(value, label, ['phraseId', 'kind', 'introduced', 'support', 'answered', 'response', 'correct', 'feedback', 'retry']);
  const result: Exercise = { phraseId: identifier(item.phraseId, `${label}.phraseId`), kind: choice(item.kind, kinds, `${label}.kind`), introduced: boolean(item.introduced, `${label}.introduced`), support: choice(item.support, supports, `${label}.support`), answered: boolean(item.answered, `${label}.answered`), response: text(item.response, `${label}.response`), retry: boolean(item.retry, `${label}.retry`) };
  if (item.correct !== undefined) result.correct = boolean(item.correct, `${label}.correct`);
  if (item.feedback !== undefined) result.feedback = text(item.feedback, `${label}.feedback`);
  if (result.introduced && result.support === 'none') fail('an introduced answer cannot be marked unsupported.');
  if (result.retry && result.support === 'none') fail('a retry must retain its support.');
  if (result.answered && result.correct === undefined) fail('an answered exercise needs its result.');
  return result;
}
function parseSession(value: unknown, label: string): Session {
  const item = object(value, label, ['id', 'startedAt', 'updatedAt', 'mode', 'unitId', 'count', 'correct', 'supported', 'practicedIds', 'exercise', 'stoppedAt']);
  const result: Session = { id: identifier(item.id, `${label}.id`), startedAt: date(item.startedAt, `${label}.startedAt`), updatedAt: date(item.updatedAt, `${label}.updatedAt`), mode: choice(item.mode, ['mixed', 'review', 'lesson', 'listening', 'conversation', 'fluency'], `${label}.mode`), count: number(item.count, `${label}.count`, 0, 1_000_000), correct: number(item.correct, `${label}.correct`, 0, 1_000_000), supported: number(item.supported, `${label}.supported`, 0, 1_000_000), practicedIds: array(item.practicedIds, `${label}.practicedIds`, 500, identifier), exercise: parseExercise(item.exercise, `${label}.exercise`) };
  if (item.unitId !== undefined) result.unitId = identifier(item.unitId, `${label}.unitId`);
  if (item.stoppedAt !== undefined) result.stoppedAt = date(item.stoppedAt, `${label}.stoppedAt`);
  if (result.correct > result.count || result.supported > result.count) fail('session totals are inconsistent.');
  if (Date.parse(result.updatedAt) < Date.parse(result.startedAt)) fail('session timestamps are inconsistent.');
  if (result.mode === 'lesson' && !result.unitId) fail('a lesson must identify its unit.');
  return result;
}

// Backups are lossless. Schema limits bound restored records; no smaller byte cap
// may prevent an app-generated export from being restored. Coaching input has its own cap.
export function exportBackup(state: AppState): string { return JSON.stringify(state); }

export function validateSessionReferences(state: AppState, units: Unit[]): string | null {
  const session = state.session;
  if (!session || session.stoppedAt) return null;
  const phrases = allPhrases(units, state);
  if (session.unitId && !phrases.some(phrase => phrase.unitId === session.unitId)) return 'The saved session refers to a unit unavailable in this course. Your history is still recoverable.';
  if (session.exercise) {
    const phrase = phrases.find(item => item.id === session.exercise!.phraseId);
    if (!phrase) return 'The saved session refers to a phrase unavailable in this course. Your history is still recoverable.';
    if (session.unitId && phrase.unitId !== session.unitId) return 'The saved exercise is outside its selected unit. Your history is still recoverable.';
  }
  return null;
}

export function importBackup(input: string, units?: Unit[]): AppState {
  const root = object(parseJson(input), 'backup', ['version', 'settings', 'progress', 'attempts', 'session', 'history', 'customPhrases', 'bookmarks', 'completedUnits', 'coachingNote', 'roleplay', 'roleplayHistory', 'roleplayAttemptCount', 'mission', 'missionHistory', 'missionAttemptCount']);
  if (root.version !== 1) fail('unsupported backup version.');
  const settings = object(root.settings, 'settings', ['dailyMinutes', 'newPerSession', 'speechRate', 'voiceURI', 'sound', 'level', 'reviewIntervals']);
  const intervals = array(settings.reviewIntervals, 'reviewIntervals', 12, (item, label) => number(item, label, 1, 365));
  if (!intervals.length || intervals.some((interval, index) => index > 0 && interval <= intervals[index - 1])) fail('review intervals must increase.');
  const rawProgress = object(root.progress, 'progress');
  if (Object.keys(rawProgress).length > 10_000) fail('too many phrase progress records.');
  const progress: AppState['progress'] = {};
  for (const [key, raw] of Object.entries(rawProgress)) {
    identifier(key, 'progress key');
    const item = object(raw, `progress.${key}`, ['phraseId', 'stage', 'interval', 'due', 'lastPracticed', 'independentCount', 'lapses', 'attempts']);
    const phraseId = identifier(item.phraseId, 'phraseId');
    if (key !== phraseId) fail('phrase progress identifiers do not match.');
    progress[key] = { phraseId, stage: choice(item.stage, ['introduced', 'supported', 'independent', 'transfer'], 'stage'), interval: number(item.interval, 'interval', 0, 365), due: date(item.due, 'due'), lastPracticed: date(item.lastPracticed, 'lastPracticed'), independentCount: number(item.independentCount, 'independentCount', 0, 1_000_000), lapses: number(item.lapses, 'lapses', 0, 1_000_000), attempts: number(item.attempts, 'attempts', 0, 1_000_000) };
  }
  const state: AppState = { version: 1, settings: { dailyMinutes: number(settings.dailyMinutes, 'dailyMinutes', 1, 120), newPerSession: number(settings.newPerSession, 'newPerSession', 1, 50), speechRate: number(settings.speechRate, 'speechRate', 0.4, 1.5, false), voiceURI: text(settings.voiceURI, 'voiceURI', 500), sound: boolean(settings.sound, 'sound'), level: choice(settings.level, ['A1', 'A2', 'B1'], 'level'), reviewIntervals: intervals }, progress, attempts: array(root.attempts, 'attempts', MAX_ATTEMPTS, parseAttempt), session: root.session === null ? null : parseSession(root.session, 'session'), history: array(root.history, 'history', MAX_HISTORY, parseSession), customPhrases: array(root.customPhrases, 'customPhrases', 500, parsePhrase), bookmarks: array(root.bookmarks, 'bookmarks', 10_000, identifier), completedUnits: array(root.completedUnits, 'completedUnits', 500, identifier) };
  if (new Set(state.customPhrases.map(phrase => phrase.id)).size !== state.customPhrases.length) fail('custom phrase identifiers must be unique.');
  if (new Set(state.attempts.map(attempt => attempt.id)).size !== state.attempts.length) fail('attempt identifiers must be unique.');
  if (new Set(state.history.map(session => session.id)).size !== state.history.length) fail('session identifiers must be unique.');
  if (root.coachingNote !== undefined) state.coachingNote = text(root.coachingNote, 'coachingNote');
  if (root.mission !== undefined) state.mission = parseMissionSession(root.mission, units);
  if (root.missionHistory !== undefined) {
    state.missionHistory = array(root.missionHistory, 'missionHistory', 500, item => parseMissionSession(item, units));
    if (new Set(state.missionHistory.map(item => item.id)).size !== state.missionHistory.length || state.missionHistory.some(item => !item.stoppedAt && !item.completedAt)) fail('mission history must contain unique stopped or completed sessions.');
  }
  if (root.missionAttemptCount !== undefined) state.missionAttemptCount = number(root.missionAttemptCount, 'missionAttemptCount', 0, Number.MAX_SAFE_INTEGER);
  const retainedMissionAttempts = activityAttempts(state).filter(attempt => attempt.id.startsWith('mission:')).length;
  if (state.missionAttemptCount === undefined && (state.mission || state.missionHistory)) state.missionAttemptCount = retainedMissionAttempts;
  if (state.missionAttemptCount !== undefined && state.missionAttemptCount < retainedMissionAttempts) fail('mission attempt totals are inconsistent.');
  if (root.roleplay !== undefined) state.roleplay = parseRoleplaySession(root.roleplay, units);
  if (root.roleplayHistory !== undefined) {
    state.roleplayHistory = array(root.roleplayHistory, 'roleplayHistory', 500, item => parseRoleplaySession(item, units));
    if (state.roleplayHistory.some(item => !item.stoppedAt) || new Set(state.roleplayHistory.map(item => item.id)).size !== state.roleplayHistory.length) fail('roleplay history must contain unique finished sessions.');
  }
  if (root.roleplayAttemptCount !== undefined) state.roleplayAttemptCount = number(root.roleplayAttemptCount, 'roleplayAttemptCount', 0, Number.MAX_SAFE_INTEGER);
  if (state.roleplayAttemptCount === undefined && (state.roleplay || state.roleplayHistory)) state.roleplayAttemptCount = activityAttempts(state).filter(attempt => attempt.id.startsWith('roleplay:')).length;
  if (state.roleplayAttemptCount !== undefined && state.roleplayAttemptCount < activityAttempts(state).filter(attempt => attempt.id.startsWith('roleplay:')).length) fail('roleplay attempt totals are inconsistent.');
  if (units) {
    const referenceError = validateSessionReferences(state, units);
    if (referenceError) fail(referenceError);
    const builtInIds = new Set(units.flatMap(unit => unit.phrases.map(phrase => phrase.id)));
    if (state.customPhrases.some(phrase => builtInIds.has(phrase.id))) fail('a custom phrase identifier conflicts with the built-in course.');
  }
  return state;
}

function hash(value: string): string {
  let result = 2_166_136_261;
  for (let i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 16_777_619); }
  return (result >>> 0).toString(36);
}

export function importCoachingSession(input: string, current: AppState, units: Unit[]): AppState {
  const root = object(parseJson(input, MAX_COACHING_BYTES), 'coaching session', ['format', 'version', 'observations', 'nextPrompt', 'sessionId']);
  if (root.format !== 'habla-session' || root.version !== 1) fail('expected a Habla coaching session with version 1.');
  const observations = array(root.observations, 'observations', 200, (raw, label) => {
    const item = object(raw, label, ['spanish', 'english', 'response', 'support', 'correct']);
    return { spanish: text(item.spanish, `${label}.spanish`, 2_000, false), english: text(item.english, `${label}.english`, 2_000, false), response: text(item.response, `${label}.response`), support: choice(item.support, supports, `${label}.support`), correct: boolean(item.correct, `${label}.correct`) };
  });
  if (!observations.length) fail('the coaching session has no observations.');
  const coachingNote = root.nextPrompt === undefined ? current.coachingNote : text(root.nextPrompt, 'nextPrompt');
  const sessionId = root.sessionId === undefined ? hash(JSON.stringify(observations)) : identifier(root.sessionId, 'sessionId');
  const now = new Date();
  let state: AppState = { ...current, progress: { ...current.progress }, attempts: [...current.attempts], customPhrases: [...current.customPhrases], ...(coachingNote !== undefined ? { coachingNote } : {}) };
  observations.forEach((observation, index) => {
    const id = `coach-${hash(sessionId)}-${index}`;
    if (state.attempts.some(attempt => attempt.id === id)) return;
    let phrase = allPhrases(units, state).find(item => normalize(item.spanish) === normalize(observation.spanish));
    if (!phrase) {
      if (state.customPhrases.length >= 500) fail('the phrasebook already contains 500 custom phrases.');
      const phraseId = `custom-${hash(normalize(observation.spanish))}`;
      phrase = { id: phraseId, unitId: 'custom', spanish: observation.spanish, english: observation.english, alternatives: [], explanation: 'Imported from your coaching session. Check the wording with a trusted language reference.', hint: `Starts with ${observation.spanish.split(/\s+/)[0]}`, example: observation.spanish, exampleEnglish: observation.english, context: '', contextAnswers: [], tags: ['coaching'] };
      state.customPhrases.push(phrase);
    }
    const grade = gradeAnswer(phrase, observation.response, 'recall');
    const correct = observation.correct && grade.correct;
    const attempt: Attempt = { id, phraseId: phrase.id, at: iso(now), response: observation.response, correct, support: observation.support, kind: 'recall', error: correct ? 'none' : grade.error === 'none' ? 'unrecognized' : grade.error };
    state.attempts.push(attempt);
    state.progress[phrase.id] = recordProgress(state.progress[phrase.id], phrase.id, attempt, state.settings, now);
  });
  state = { ...state, attempts: state.attempts.slice(-MAX_ATTEMPTS) };
  return state;
}

export function exportCoachHandoff(state: AppState, units: Unit[]): string {
  const phrases = allPhrases(units, state);
  const due = duePhrases(state, units).slice(0, 12);
  const recent = state.attempts.slice(-12).map(attempt => {
    const phrase = phrases.find(item => item.id === attempt.phraseId);
    return { spanish: phrase?.spanish ?? attempt.phraseId, english: phrase?.english ?? '', response: attempt.response, support: attempt.support, correct: attempt.correct, activity: attempt.kind };
  });
  return [
    'HABLA SPANISH COACHING HANDOFF',
    'Act as a patient Spanish coach for an English-speaking learner. Work one prompt at a time, allow thinking time, and never answer before the learner tries. Teach unknown language first. Use brief English explanations, natural Spanish models, and practical situations. Revisit errors after other prompts. Do not infer pronunciation from typed text or certify proficiency.',
    `Current course band: ${state.settings.level}. This is a curriculum preference, not a tested proficiency level.`,
    `Study target: ${state.settings.dailyMinutes} minutes. Continue when the learner wants more.`,
    state.coachingNote ? `Previous coach's next-step note: ${state.coachingNote}` : '',
    `Due phrases:\n${JSON.stringify(due.map(phrase => ({ spanish: phrase.spanish, english: phrase.english })), null, 2)}`,
    `Recent practice:\n${JSON.stringify(recent, null, 2)}`,
    'Evidence rules: "none" means the learner answered before any hint or model; "hint" means a cue was given; "revealed" means the answer was shown; "introduced" means it was just taught. Supported repetition is not independent recall. Record only attempts the learner actually made. Set correct conservatively. Use a separate observation for each attempted phrase.',
    'At the end, return a plain JSON object that the learner can save or paste into Habla using Import coaching session. Use a unique sessionId each session. Put an optional upcoming practice prompt in nextPrompt. This is a manual handoff; nothing transfers until the learner imports it. Use this exact shape:',
    JSON.stringify({ format: 'habla-session', version: 1, sessionId: 'replace-with-a-unique-session-id', observations: [{ spanish: 'The Spanish model', english: 'The English meaning', response: 'The exact learner response', support: 'none', correct: true }], nextPrompt: 'The next useful question or skill to practice' }, null, 2),
  ].filter(Boolean).join('\n\n');
}
