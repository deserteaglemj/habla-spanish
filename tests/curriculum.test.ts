import { describe, expect, it } from 'vitest';
import { units } from '../src/data/curriculum';

const normalize = (value: string) => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:]/g, '').trim();

describe('curated Spanish course', () => {
  it('provides eight substantial units per level and at least 144 phrases', () => {
    expect(units.length).toBeGreaterThanOrEqual(24);
    for (const level of ['A1', 'A2', 'B1']) {
      expect(units.filter(unit => unit.level === level)).toHaveLength(8);
    }
    expect(units.flatMap(unit => unit.phrases).length).toBeGreaterThanOrEqual(144);
  });

  it('uses stable unique identifiers and preserves parent relationships', () => {
    expect(new Set(units.map(unit => unit.id)).size).toBe(units.length);
    const phrases = units.flatMap(unit => unit.phrases);
    expect(new Set(phrases.map(phrase => phrase.id)).size).toBe(phrases.length);
    for (const unit of units) {
      expect(unit.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      for (const phrase of unit.phrases) {
        expect(phrase.unitId).toBe(unit.id);
        expect(phrase.id.startsWith(`${unit.id}-`)).toBe(true);
      }
    }
  });

  it('gives every unit a real dialogue, bilingual reading and achievable mission', () => {
    for (const unit of units) {
      expect(unit.phrases.length).toBeGreaterThanOrEqual(6);
      for (const field of ['title', 'description', 'goal', 'grammar', 'mission'] as const) {
        expect(unit[field].length, `${unit.id}.${field}`).toBeGreaterThan(12);
      }
      expect(unit.dialogue.length).toBeGreaterThanOrEqual(4);
      expect(new Set(unit.dialogue.map(line => line.speaker)).size).toBeGreaterThanOrEqual(2);
      for (const line of unit.dialogue) {
        expect(line.spanish.length).toBeGreaterThan(4);
        expect(line.english.length).toBeGreaterThan(4);
      }
      expect(unit.reading.spanish.split(/[.!?]+/).filter(sentence => sentence.trim()).length).toBeGreaterThanOrEqual(3);
      expect(unit.reading.english.split(/[.!?]+/).filter(sentence => sentence.trim()).length).toBeGreaterThanOrEqual(3);
      expect(unit.reading.question.endsWith('?')).toBe(true);
      expect(unit.reading.answers.length).toBeGreaterThan(0);
    }
  });

  it('teaches each phrase with support, natural alternatives and a changed context', () => {
    for (const phrase of units.flatMap(unit => unit.phrases)) {
      for (const field of ['spanish', 'english', 'explanation', 'hint', 'example', 'exampleEnglish', 'context'] as const) {
        expect(phrase[field].length, `${phrase.id}.${field}`).toBeGreaterThan(3);
      }
      expect(phrase.alternatives.length, phrase.id).toBeGreaterThan(0);
      expect(phrase.contextAnswers.length, phrase.id).toBeGreaterThan(0);
      expect(phrase.tags.length, phrase.id).toBeGreaterThan(0);
      const baseAnswers = [phrase.spanish, ...phrase.alternatives].map(normalize);
      expect(new Set(baseAnswers).size, `${phrase.id} distinct alternatives`).toBe(baseAnswers.length);
      for (const answer of phrase.contextAnswers) {
        expect(answer.trim().length, phrase.id).toBeGreaterThan(2);
        expect(baseAnswers, `${phrase.id} requires transfer`).not.toContain(normalize(answer));
      }
    }
  });

  it('keeps public lessons free of local file paths, contact details and prohibited punctuation', () => {
    const content = JSON.stringify(units);
    expect(content).not.toMatch(/\/Users\/|\/home\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\u2014/i);
  });

  it('keeps English prose out of Spanish readings and examples', () => {
    const spanishOnly = units.flatMap(unit => [
      unit.reading.spanish,
      ...unit.dialogue.map(line => line.spanish),
      ...unit.phrases.flatMap(phrase => [phrase.spanish, phrase.example, ...phrase.alternatives, ...phrase.contextAnswers]),
    ]);
    for (const text of spanishOnly) {
      expect(text).not.toMatch(/\b(?:the|with|would|she|they|because|their|friend|dishes|always)\b/i);
    }
  });
});
