import type { Grade, Phrase, Unit } from '../types';
import { gradeAnswer } from './engine';

export type RoleplaySupport = 'none' | 'hint' | 'revealed';
export interface RoleplayAttempt {
  id: string;
  turnIndex: number;
  at: string;
  response: string;
  correct: boolean;
  support: RoleplaySupport;
  error: Grade['error'];
}
export interface RoleplaySession {
  id: string;
  unitId: string;
  learnerRole: string;
  turnIndex: number;
  draft: string;
  feedback: Grade | null;
  attempts: RoleplayAttempt[];
  startedAt: string;
  updatedAt: string;
  stoppedAt?: string;
  completedAt?: string;
  support: RoleplaySupport;
  answered: boolean;
}

let sequence = 0;
const identifier = (kind: string, now: Date) => `${kind}-${now.getTime().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clean = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export function roleplayRoles(unit: Unit): string[] {
  return [...new Set(unit.dialogue.map(line => line.speaker))]
    .filter(role => unit.dialogue.filter(line => line.speaker === role).length >= 2);
}

export function startRoleplay(unit: Unit, learnerRole = roleplayRoles(unit)[1] ?? roleplayRoles(unit)[0], now = new Date()): RoleplaySession {
  if (!roleplayRoles(unit).includes(learnerRole)) throw new Error('Choose a role with at least two turns.');
  return {
    id: identifier('roleplay', now), unitId: unit.id, learnerRole,
    turnIndex: unit.dialogue.findIndex(line => line.speaker === learnerRole),
    draft: '', feedback: null, attempts: [], startedAt: now.toISOString(), updatedAt: now.toISOString(),
    support: 'none', answered: false,
  };
}

function available(session: RoleplaySession): boolean {
  return !session.stoppedAt && !session.completedAt && !session.answered;
}

export function setRoleplayDraft(session: RoleplaySession, draft: string, now = new Date()): RoleplaySession {
  if (!available(session)) return session;
  return { ...session, draft: draft.slice(0, 2_000), updatedAt: now.toISOString() };
}

export function giveRoleplayHint(session: RoleplaySession, now = new Date()): RoleplaySession {
  if (!available(session) || session.support !== 'none') return session;
  return { ...session, support: 'hint', updatedAt: now.toISOString() };
}

export function revealRoleplayAnswer(session: RoleplaySession, now = new Date()): RoleplaySession {
  if (!available(session) || session.support === 'revealed') return session;
  return { ...session, support: 'revealed', updatedAt: now.toISOString() };
}

export function roleplayPhrase(unit: Unit, turnIndex: number): Phrase {
  const line = unit.dialogue[turnIndex];
  if (!line) throw new Error('This conversation turn is unavailable.');
  const alternatives = new Set<string>();
  for (const phrase of unit.phrases) {
    if (clean(phrase.spanish) === clean(line.spanish)) {
      for (const alternative of phrase.alternatives) alternatives.add(alternative);
    } else if (line.spanish.includes(phrase.spanish)) {
      for (const alternative of phrase.alternatives) alternatives.add(line.spanish.replace(phrase.spanish, alternative));
    }
  }
  // Only add subject pronouns where the first-person verb is unambiguous.
  if (/^(?:soy|estoy|tengo|vivo|fui|comí|creo|pienso|prefiero|necesito|quiero|acabo|me llamo|me levanto)\b/i.test(line.spanish)) {
    alternatives.add(`Yo ${line.spanish.charAt(0).toLowerCase()}${line.spanish.slice(1)}`);
  }
  if (/^sí, (?:soy|estoy|tengo|vivo|creo|prefiero|necesito|quiero)\b/i.test(line.spanish)) alternatives.add(line.spanish.replace(/^sí, /i, 'Sí, yo '));
  return {
    id: `${unit.id}-roleplay-${turnIndex}`, unitId: unit.id,
    spanish: line.spanish, english: line.english,
    alternatives: [...alternatives].filter(value => clean(value) !== clean(line.spanish)),
    explanation: unit.grammar, hint: 'Use the meaning of this turn to form your reply.',
    example: line.spanish, exampleEnglish: line.english,
    context: line.english, contextAnswers: [line.spanish], tags: ['roleplay', unit.level],
  };
}

export function submitRoleplay(session: RoleplaySession, unit: Unit, response = session.draft, now = new Date()): RoleplaySession {
  if (!available(session) || session.unitId !== unit.id || !response.trim() || unit.dialogue[session.turnIndex]?.speaker !== session.learnerRole) return session;
  const answer = response.trim().slice(0, 2_000);
  const feedback = gradeAnswer(roleplayPhrase(unit, session.turnIndex), answer, 'recall');
  const attempt: RoleplayAttempt = {
    id: identifier('roleplay-answer', now), turnIndex: session.turnIndex, at: now.toISOString(),
    response: answer, correct: feedback.correct, support: session.support, error: feedback.error,
  };
  return { ...session, draft: answer, feedback, answered: true, attempts: [...session.attempts, attempt], updatedAt: now.toISOString() };
}

export function continueRoleplay(session: RoleplaySession, unit: Unit, now = new Date()): RoleplaySession {
  if (session.stoppedAt || session.completedAt || !session.answered || session.unitId !== unit.id) return session;
  const nextIndex = unit.dialogue.findIndex((line, index) => index > session.turnIndex && line.speaker === session.learnerRole);
  if (nextIndex === -1) return { ...session, completedAt: now.toISOString(), stoppedAt: now.toISOString(), updatedAt: now.toISOString() };
  return { ...session, turnIndex: nextIndex, draft: '', feedback: null, support: 'none', answered: false, updatedAt: now.toISOString() };
}

export function stopRoleplay(session: RoleplaySession, now = new Date()): RoleplaySession {
  if (session.stoppedAt || session.completedAt) return session;
  return { ...session, stoppedAt: now.toISOString(), updatedAt: now.toISOString() };
}

export function resumeRoleplay(session: RoleplaySession, now = new Date()): RoleplaySession {
  if (!session.stoppedAt || session.completedAt) return session;
  const { stoppedAt: _stoppedAt, ...rest } = session;
  return { ...rest, updatedAt: now.toISOString() };
}

const supportValues = ['none', 'hint', 'revealed'];
const errorValues = ['none', 'language', 'spelling', 'unrecognized'];
type RecordValue = Record<string, unknown>;

function object(value: unknown, required: string[], optional: string[] = []): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid roleplay data.');
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) throw new Error('Invalid roleplay object.');
  const record = value as RecordValue;
  if (Object.keys(record).some(key => ![...required, ...optional].includes(key)) || required.some(key => !Object.hasOwn(record, key))) throw new Error('Roleplay fields are missing or unsupported.');
  return record;
}

function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error('Invalid roleplay text.');
  return value;
}

function index(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 999) throw new Error('Invalid roleplay turn.');
  return value as number;
}

function date(value: unknown): string {
  const result = text(value, 30);
  const milliseconds = Date.parse(result);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== result) throw new Error('Invalid roleplay date.');
  return result;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid roleplay flag.');
  return value;
}

function support(value: unknown): RoleplaySupport {
  if (typeof value !== 'string' || !supportValues.includes(value)) throw new Error('Invalid roleplay support.');
  return value as RoleplaySupport;
}

function error(value: unknown): Grade['error'] {
  if (typeof value !== 'string' || !errorValues.includes(value)) throw new Error('Invalid roleplay feedback.');
  return value as Grade['error'];
}

function identifierText(value: unknown): string {
  const result = text(value, 180);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result)) throw new Error('Invalid roleplay identifier.');
  return result;
}

export function parseRoleplaySession(value: unknown, units?: Unit[]): RoleplaySession {
  const source = object(value, ['id', 'unitId', 'learnerRole', 'turnIndex', 'draft', 'feedback', 'attempts', 'startedAt', 'updatedAt', 'support', 'answered'], ['stoppedAt', 'completedAt']);
  if (!Array.isArray(source.attempts) || source.attempts.length > 1_000) throw new Error('Invalid roleplay attempts.');
  const attempts: RoleplayAttempt[] = source.attempts.map(value => {
    const attempt = object(value, ['id', 'turnIndex', 'at', 'response', 'correct', 'support', 'error']);
    const parsed = {
      id: identifierText(attempt.id), turnIndex: index(attempt.turnIndex), at: date(attempt.at),
      response: text(attempt.response, 2_000), correct: boolean(attempt.correct), support: support(attempt.support), error: error(attempt.error),
    };
    if (parsed.correct !== (parsed.error === 'none')) throw new Error('Inconsistent roleplay result.');
    return parsed;
  });
  let feedback: Grade | null = null;
  if (source.feedback !== null) {
    const grade = object(source.feedback, ['correct', 'feedback', 'error', 'normalized']);
    feedback = { correct: boolean(grade.correct), feedback: text(grade.feedback, 2_000), error: error(grade.error), normalized: text(grade.normalized, 2_000, true) };
    if (feedback.correct !== (feedback.error === 'none')) throw new Error('Inconsistent roleplay feedback.');
  }
  const result: RoleplaySession = {
    id: identifierText(source.id), unitId: identifierText(source.unitId), learnerRole: text(source.learnerRole, 80),
    turnIndex: index(source.turnIndex), draft: text(source.draft, 2_000, true), feedback, attempts,
    startedAt: date(source.startedAt), updatedAt: date(source.updatedAt), support: support(source.support), answered: boolean(source.answered),
    ...(source.stoppedAt !== undefined ? { stoppedAt: date(source.stoppedAt) } : {}),
    ...(source.completedAt !== undefined ? { completedAt: date(source.completedAt) } : {}),
  };
  if (Date.parse(result.updatedAt) < Date.parse(result.startedAt)) throw new Error('Roleplay dates are out of order.');
  for (const stopped of [result.stoppedAt, result.completedAt]) {
    if (stopped && (Date.parse(stopped) < Date.parse(result.startedAt) || Date.parse(stopped) > Date.parse(result.updatedAt))) throw new Error('Invalid roleplay stop date.');
  }
  if (result.completedAt && (!result.stoppedAt || !result.answered || result.completedAt !== result.stoppedAt)) throw new Error('Invalid completed roleplay.');
  if (new Set(attempts.map(attempt => attempt.id)).size !== attempts.length || new Set(attempts.map(attempt => attempt.turnIndex)).size !== attempts.length) throw new Error('Duplicate roleplay attempts.');
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (Date.parse(attempt.at) < Date.parse(result.startedAt) || Date.parse(attempt.at) > Date.parse(result.updatedAt) || (i && (Date.parse(attempt.at) < Date.parse(attempts[i - 1].at) || attempt.turnIndex <= attempts[i - 1].turnIndex)) || attempt.turnIndex > result.turnIndex) throw new Error('Roleplay attempts are out of order.');
  }
  const last = attempts.at(-1);
  if (result.answered) {
    if (!feedback || !last || last.turnIndex !== result.turnIndex || last.response !== result.draft || last.correct !== feedback.correct || last.error !== feedback.error || last.support !== result.support) throw new Error('Roleplay answer evidence is incomplete.');
  } else if (feedback !== null || last?.turnIndex === result.turnIndex) throw new Error('Unexpected roleplay answer evidence.');
  if (units) {
    const unit = units.find(item => item.id === result.unitId);
    if (!unit || !roleplayRoles(unit).includes(result.learnerRole) || unit.dialogue[result.turnIndex]?.speaker !== result.learnerRole) throw new Error('Roleplay no longer matches this course.');
    const turns = unit.dialogue.map((line, i) => line.speaker === result.learnerRole ? i : -1).filter(i => i >= 0);
    const position = turns.indexOf(result.turnIndex);
    if (attempts.length !== position + Number(result.answered) || attempts.some((attempt, i) => attempt.turnIndex !== turns[i])) throw new Error('Roleplay turns cannot be skipped.');
    if (result.completedAt && position !== turns.length - 1) throw new Error('Roleplay completion is premature.');
  }
  return result;
}
