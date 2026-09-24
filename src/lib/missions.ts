import type { Grade, Unit } from '../types';
import { gradeAnswer } from './engine';
import { roleplayPhrase } from './roleplay';

export type MissionPhase = 'brief' | 'prepare' | 'rehearse' | 'adapt' | 'debrief';
export type MissionSupport = 'none' | 'english' | 'model';
export type MissionCheckIn = 'not-yet' | 'tried' | 'completed';
export interface MissionAttempt { phase: 'rehearse' | 'adapt'; index: number; response: string; correct: boolean; support: MissionSupport; at: string; }
export interface MissionSession {
  id: string; unitId: string; phase: MissionPhase; index: number; draft: string;
  spanishFirst: boolean; support: MissionSupport; feedback: Grade | null; answered: boolean;
  attempts: MissionAttempt[]; startedAt: string; updatedAt: string;
  stoppedAt?: string; completedAt?: string; checkIn: MissionCheckIn; reflection: string;
}
const active = (s: MissionSession) => !s.stoppedAt && !s.completedAt;
const exercise = (s: MissionSession): s is MissionSession & { phase: 'rehearse' | 'adapt' } => s.phase === 'rehearse' || s.phase === 'adapt';

export function startMission(unit: Unit, spanishFirst = false, now = new Date()): MissionSession {
  if (!unit.dialogue.length || !unit.phrases.length) throw new Error('This unit has no mission material yet.');
  return { id: `mission-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, unitId: unit.id, phase: 'brief', index: 0, draft: '', spanishFirst, support: 'none', feedback: null, answered: false, attempts: [], startedAt: now.toISOString(), updatedAt: now.toISOString(), checkIn: 'not-yet', reflection: '' };
}

export function missionTask(session: MissionSession, unit: Unit) {
  if (session.unitId !== unit.id || !exercise(session)) return null;
  if (session.phase === 'rehearse') {
    const line = unit.dialogue[session.index];
    return line ? { prompt: line.english, model: line.spanish, speaker: line.speaker, previous: unit.dialogue[session.index - 1], phrase: roleplayPhrase(unit, session.index), kind: 'recall' as const, total: unit.dialogue.length } : null;
  }
  const phrase = unit.phrases[session.index];
  return phrase ? { prompt: phrase.context, model: phrase.contextAnswers[0], speaker: '', previous: undefined, phrase, kind: 'context' as const, total: unit.phrases.length } : null;
}

export function setMissionDraft(s: MissionSession, draft: string, now = new Date()): MissionSession {
  return active(s) && exercise(s) && !s.answered ? { ...s, draft: draft.slice(0, 2000), updatedAt: now.toISOString() } : s;
}
export function revealMissionHelp(s: MissionSession, help: 'english' | 'model', now = new Date()): MissionSession {
  if (!active(s) || !exercise(s) || s.answered || s.support === 'model' || (help === 'english' && s.support === 'english')) return s;
  return { ...s, support: help, updatedAt: now.toISOString() };
}
export function submitMission(s: MissionSession, unit: Unit, response = s.draft, now = new Date()): MissionSession {
  const task = missionTask(s, unit);
  if (!active(s) || !exercise(s) || s.answered || !task || !response.trim()) return s;
  const answer = response.trim().slice(0, 2000);
  const feedback = gradeAnswer(task.phrase, answer, task.kind);
  return { ...s, draft: answer, answered: true, feedback, updatedAt: now.toISOString(), attempts: [...s.attempts, { phase: s.phase, index: s.index, response: answer, correct: feedback.correct, support: s.support, at: now.toISOString() }] };
}
export function advanceMission(s: MissionSession, unit: Unit, now = new Date()): MissionSession {
  if (!active(s) || s.unitId !== unit.id || s.phase === 'debrief' || (exercise(s) && !s.answered)) return s;
  let phase: MissionPhase = s.phase;
  let index = 0;
  if (phase === 'brief') phase = 'prepare';
  else if (phase === 'prepare') phase = 'rehearse';
  else if (phase === 'rehearse') { if (s.index + 1 < unit.dialogue.length) index = s.index + 1; else phase = 'adapt'; }
  else if (phase === 'adapt') { if (s.index + 1 < unit.phrases.length) index = s.index + 1; else phase = 'debrief'; }
  return { ...s, phase, index, draft: '', answered: false, feedback: null, support: phase === 'rehearse' && !s.spanishFirst ? 'english' : 'none', updatedAt: now.toISOString(), ...(phase === 'debrief' ? { completedAt: now.toISOString() } : {}) };
}
export function stopMission(s: MissionSession, now = new Date()): MissionSession { return active(s) ? { ...s, stoppedAt: now.toISOString(), updatedAt: now.toISOString() } : s; }
export function resumeMission(s: MissionSession, now = new Date()): MissionSession {
  if (!s.stoppedAt || s.completedAt) return s;
  const { stoppedAt: _stoppedAt, ...rest } = s;
  return { ...rest, updatedAt: now.toISOString() };
}
export function setMissionCheckIn(s: MissionSession, checkIn: MissionCheckIn, reflection: string, now = new Date()): MissionSession {
  if (s.phase !== 'debrief' || !['not-yet', 'tried', 'completed'].includes(checkIn)) return s;
  return { ...s, checkIn, reflection: reflection.slice(0, 2000), updatedAt: now.toISOString() };
}

type Obj = Record<string, unknown>;
function object(value: unknown, required: string[], optional: string[] = []): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw new Error('Invalid mission data.');
  const o = value as Obj;
  if (required.some(key => !Object.hasOwn(o, key)) || Object.keys(o).some(key => ![...required, ...optional].includes(key))) throw new Error('Mission fields are missing or unsupported.');
  return o;
}
function text(value: unknown, max = 2000, empty = true): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error('Invalid mission text.');
  return value;
}
function date(value: unknown): string { const t = text(value, 30, false); if (!Number.isFinite(Date.parse(t)) || new Date(t).toISOString() !== t) throw new Error('Invalid mission date.'); return t; }
function flag(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Invalid mission flag.'); return value; }
function index(value: unknown): number { if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 127) throw new Error('Invalid mission position.'); return value as number; }
function choice<T extends string>(value: unknown, values: T[]): T { if (typeof value !== 'string' || !values.includes(value as T)) throw new Error('Invalid mission choice.'); return value as T; }
function id(value: unknown): string { const t = text(value, 180, false); if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(t)) throw new Error('Invalid mission identifier.'); return t; }

export function parseMissionSession(value: unknown, units?: Unit[]): MissionSession {
  const o = object(value, ['id', 'unitId', 'phase', 'index', 'draft', 'spanishFirst', 'support', 'feedback', 'answered', 'attempts', 'startedAt', 'updatedAt', 'checkIn', 'reflection'], ['stoppedAt', 'completedAt']);
  const parseSupport = (v: unknown) => choice<MissionSupport>(v, ['none', 'english', 'model']);
  if (!Array.isArray(o.attempts) || o.attempts.length > 128) throw new Error('Invalid mission attempts.');
  const attempts: MissionAttempt[] = o.attempts.map(value => { const a = object(value, ['phase', 'index', 'response', 'correct', 'support', 'at']); return { phase: choice(a.phase, ['rehearse', 'adapt']), index: index(a.index), response: text(a.response, 2000, false), correct: flag(a.correct), support: parseSupport(a.support), at: date(a.at) }; });
  let feedback: Grade | null = null;
  if (o.feedback !== null) { const f = object(o.feedback, ['correct', 'feedback', 'error', 'normalized']); feedback = { correct: flag(f.correct), feedback: text(f.feedback, 4000), error: choice(f.error, ['none', 'language', 'spelling', 'unrecognized']), normalized: text(f.normalized, 4000) }; }
  const s: MissionSession = { id: id(o.id), unitId: id(o.unitId), phase: choice(o.phase, ['brief', 'prepare', 'rehearse', 'adapt', 'debrief']), index: index(o.index), draft: text(o.draft), spanishFirst: flag(o.spanishFirst), support: parseSupport(o.support), feedback, answered: flag(o.answered), attempts, startedAt: date(o.startedAt), updatedAt: date(o.updatedAt), checkIn: choice(o.checkIn, ['not-yet', 'tried', 'completed']), reflection: text(o.reflection), ...(o.stoppedAt === undefined ? {} : { stoppedAt: date(o.stoppedAt) }), ...(o.completedAt === undefined ? {} : { completedAt: date(o.completedAt) }) };
  const invalid = () => { throw new Error('Mission progress is inconsistent.'); };
  if (s.startedAt > s.updatedAt || [s.stoppedAt, s.completedAt, ...attempts.map(a => a.at)].some(at => at !== undefined && (at < s.startedAt || at > s.updatedAt))) invalid();
  if (s.answered !== (s.feedback !== null) || (s.phase === 'debrief') !== Boolean(s.completedAt)) invalid();
  if (!exercise(s) && (s.index !== 0 || s.draft || s.answered || s.support !== 'none')) invalid();
  if (s.phase !== 'debrief' && (s.checkIn !== 'not-yet' || s.reflection)) invalid();
  if (s.phase === 'rehearse' && !s.spanishFirst && s.support === 'none') invalid();
  let nextRehearsal = 0, nextAdapt = 0;
  for (const [attemptIndex, a] of attempts.entries()) {
    if (attemptIndex > 0 && a.at < attempts[attemptIndex - 1].at) invalid();
    if (a.phase === 'rehearse' ? nextAdapt > 0 || a.index !== nextRehearsal++ : a.index !== nextAdapt++) invalid();
    if (a.phase === 'rehearse' && !s.spanishFirst && a.support === 'none') invalid();
  }
  if ((s.phase === 'brief' || s.phase === 'prepare') && attempts.length) invalid();
  if (exercise(s)) {
    if ((s.phase === 'rehearse' ? nextRehearsal : nextAdapt) !== s.index + Number(s.answered) || (s.phase === 'rehearse' && nextAdapt)) invalid();
    if (s.answered) { const last = attempts.at(-1); if (!last || last.phase !== s.phase || last.index !== s.index || last.response !== s.draft || last.support !== s.support || last.correct !== s.feedback?.correct) invalid(); }
  }
  if (units) {
    const unit = units.find(unit => unit.id === s.unitId);
    if (!unit || (exercise(s) && !missionTask(s, unit))) invalid();
    if (unit) {
      if (nextRehearsal > unit.dialogue.length || nextAdapt > unit.phrases.length || ((s.phase === 'adapt' || s.phase === 'debrief') && nextRehearsal !== unit.dialogue.length) || (s.phase === 'debrief' && nextAdapt !== unit.phrases.length)) invalid();
      for (const a of attempts) { const task = missionTask({ ...s, phase: a.phase, index: a.index }, unit); if (!task || gradeAnswer(task.phrase, a.response, task.kind).correct !== a.correct) invalid(); }
    }
  }
  return s;
}
