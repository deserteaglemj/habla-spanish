import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { units } from '../src/data/curriculum';
import { createInitialState } from '../src/lib/engine';
import {
  continueRoleplay, giveRoleplayHint, parseRoleplaySession, revealRoleplayAnswer,
  resumeRoleplay, roleplayRoles, setRoleplayDraft, startRoleplay, stopRoleplay,
  submitRoleplay,
} from '../src/lib/roleplay';
import { Roleplay } from '../src/components/Roleplay';

const now = new Date('2026-01-01T10:00:00.000Z');
const later = new Date('2026-01-01T10:01:00.000Z');
const unit = units[0];

describe('guided multi-turn roleplay', () => {
  it('supports at least two learner turns for both speakers in every unit', () => {
    for (const item of units) {
      expect(roleplayRoles(item)).toHaveLength(2);
      for (const role of roleplayRoles(item)) {
        expect(item.dialogue.filter(line => line.speaker === role).length).toBeGreaterThanOrEqual(2);
        const session = startRoleplay(item, role, now);
        expect(item.dialogue[session.turnIndex].speaker).toBe(role);
        expect(session.draft).toBe('');
        expect(session.attempts).toEqual([]);
      }
    }
  });

  it('keeps the learner model hidden until an explicit reveal or submission', () => {
    const session = startRoleplay(unit, 'B', now);
    const markup = renderToStaticMarkup(createElement(Roleplay, {
      units, settings: createInitialState().settings, session,
      update: () => {}, go: () => {}, saved: true,
    }));
    expect(markup).toContain(unit.dialogue[0].spanish);
    expect(markup).toContain(unit.dialogue[1].english);
    expect(markup).not.toContain(unit.dialogue[1].spanish);
    expect(markup).not.toContain(unit.dialogue[3].spanish);
    expect(markup).not.toContain(unit.dialogue[3].english);
  });

  it('requires explicit submission and continuation and records one attempt per turn', () => {
    let session = startRoleplay(unit, 'B', now);
    expect(continueRoleplay(session, unit, later)).toBe(session);
    session = setRoleplayDraft(session, unit.dialogue[session.turnIndex].spanish, later);
    expect(session.turnIndex).toBe(1);
    expect(session.attempts).toHaveLength(0);
    session = submitRoleplay(session, unit, session.draft, later);
    expect(session.answered).toBe(true);
    expect(session.feedback?.correct).toBe(true);
    expect(session.turnIndex).toBe(1);
    expect(session.attempts).toHaveLength(1);
    expect(submitRoleplay(session, unit, session.draft, later)).toBe(session);
    session = continueRoleplay(session, unit, later);
    expect(session.turnIndex).toBe(3);
    expect(session.draft).toBe('');
    expect(session.answered).toBe(false);
    expect(session.support).toBe('none');
    session = submitRoleplay(session, unit, unit.dialogue[3].spanish, later);
    session = continueRoleplay(session, unit, later);
    expect(session.completedAt).toBe(later.toISOString());
    expect(session.stoppedAt).toBe(later.toISOString());
    expect(session.attempts).toHaveLength(2);
    expect(continueRoleplay(session, unit, later)).toBe(session);
  });

  it('preserves drafts, support and the next turn across pause and restore', () => {
    let session = startRoleplay(unit, 'B', now);
    session = setRoleplayDraft(session, 'Estoy bien', later);
    session = giveRoleplayHint(session, later);
    session = stopRoleplay(session, later);
    const restored = parseRoleplaySession(JSON.parse(JSON.stringify(session)), units);
    expect(restored).toEqual(session);
    expect(restored.draft).toBe('Estoy bien');
    expect(restored.support).toBe('hint');
    expect(submitRoleplay(restored, unit, unit.dialogue[1].spanish, later)).toBe(restored);
    const resumed = resumeRoleplay(restored, later);
    expect(resumed.stoppedAt).toBeUndefined();
    expect(resumed.turnIndex).toBe(1);
    expect(resumed.draft).toBe('Estoy bien');
    const answered = submitRoleplay(resumed, unit, unit.dialogue[1].spanish, later);
    expect(answered.attempts[0].support).toBe('hint');
  });

  it('counts revealed responses as supported and does not downgrade reveal to hint', () => {
    let session = revealRoleplayAnswer(startRoleplay(unit, 'B', now), later);
    expect(giveRoleplayHint(session, later)).toBe(session);
    session = submitRoleplay(session, unit, unit.dialogue[1].spanish, later);
    expect(session.attempts[0].support).toBe('revealed');
    expect(session.attempts[0].correct).toBe(true);
  });

  it('accepts curated alternatives and optional matching subjects', () => {
    const story = units.find(item => item.id === 'a1-introductions')!;
    let session = startRoleplay(story, 'B', now);
    session = submitRoleplay(session, story, 'Yo soy de Colombia, pero vivo en Perú.', later);
    expect(session.feedback?.correct).toBe(true);
    const small = { ...unit, dialogue: [
      { speaker: 'A', spanish: 'Buenos días.', english: 'Good morning.' },
      { speaker: 'B', spanish: 'Buenos días.', english: 'Good morning.' },
      { speaker: 'A', spanish: 'Hasta mañana.', english: 'See you tomorrow.' },
      { speaker: 'B', spanish: 'Hasta mañana.', english: 'See you tomorrow.' },
    ] };
    session = startRoleplay(small, 'B', now);
    session = submitRoleplay(session, small, 'Buen día.', later);
    expect(session.feedback?.correct).toBe(true);
  });

  it('allows a learner to continue after comparing a non-matching response', () => {
    let session = startRoleplay(unit, 'B', now);
    session = submitRoleplay(session, unit, 'Una respuesta diferente.', later);
    expect(session.feedback?.correct).toBe(false);
    expect(session.attempts[0].correct).toBe(false);
    session = continueRoleplay(session, unit, later);
    expect(session.turnIndex).toBe(3);
    expect(session.attempts).toHaveLength(1);
  });

  it('rejects malformed imports and impossible unit, role and turn relationships', () => {
    const base = startRoleplay(unit, 'B', now);
    const invalid = [
      null, [], { ...base, extra: true }, { ...base, turnIndex: NaN },
      { ...base, turnIndex: 0 }, { ...base, learnerRole: 'Missing' },
      { ...base, unitId: 'unknown-unit' }, { ...base, support: 'unknown' },
      { ...base, draft: 'a'.repeat(2001) }, { ...base, updatedAt: 'yesterday' },
      { ...base, startedAt: '2027-01-01T00:00:00.000Z' },
      { ...base, answered: true }, { ...base, completedAt: later.toISOString() },
      { ...base, attempts: [{ id: 'bad', turnIndex: 0, at: base.startedAt, response: 'Hi', correct: true, support: 'none', error: 'none' }] },
    ];
    for (const value of invalid) expect(() => parseRoleplaySession(value, units)).toThrow();
    expect(() => parseRoleplaySession(JSON.parse('{"__proto__":{}}'), units)).toThrow();
  });

  it('round-trips completed evidence and rejects forged completion', () => {
    let session = startRoleplay(unit, 'B', now);
    while (!session.completedAt) {
      session = submitRoleplay(session, unit, unit.dialogue[session.turnIndex].spanish, later);
      session = continueRoleplay(session, unit, later);
    }
    expect(parseRoleplaySession(JSON.parse(JSON.stringify(session)), units)).toEqual(session);
    expect(() => parseRoleplaySession({ ...session, attempts: session.attempts.slice(0, 1) }, units)).toThrow();
    expect(resumeRoleplay(session, later)).toBe(session);
  });
});
