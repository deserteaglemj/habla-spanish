import type { MissionSession } from './lib/missions';
import type { RoleplaySession } from './lib/roleplay';
export type Level = 'A1' | 'A2' | 'B1';
export type Stage = 'introduced' | 'supported' | 'independent' | 'transfer';
export type Mode = 'mixed' | 'review' | 'lesson' | 'listening' | 'conversation';
export type ExerciseKind = 'recall' | 'listening' | 'context' | 'comprehension';
export interface Phrase { id: string; unitId: string; spanish: string; english: string; alternatives: string[]; explanation: string; hint: string; example: string; exampleEnglish: string; context: string; contextAnswers: string[]; tags: string[]; }
export interface Unit { id: string; title: string; level: Level; description: string; goal: string; grammar: string; phrases: Phrase[]; dialogue: { speaker: string; spanish: string; english: string }[]; reading: { spanish: string; english: string; question: string; answers: string[] }; mission: string; }
export interface Attempt { id: string; phraseId: string; at: string; response: string; correct: boolean; support: 'none' | 'hint' | 'revealed' | 'introduced'; kind: ExerciseKind; error: 'none' | 'language' | 'spelling' | 'unrecognized'; }
export interface PhraseProgress { phraseId: string; stage: Stage; interval: number; due: string; lastPracticed: string; independentCount: number; lapses: number; attempts: number; }
export interface Exercise { phraseId: string; kind: ExerciseKind; introduced: boolean; support: Attempt['support']; answered: boolean; response: string; correct?: boolean; feedback?: string; retry: boolean; }
export interface Session { id: string; startedAt: string; updatedAt: string; mode: Mode; unitId?: string; count: number; correct: number; supported: number; practicedIds: string[]; exercise: Exercise | null; stoppedAt?: string; }
export interface Settings { dailyMinutes: number; newPerSession: number; speechRate: number; voiceURI: string; sound: boolean; level: Level; reviewIntervals: number[]; }
export interface AppState { version: 1; settings: Settings; progress: Record<string,PhraseProgress>; attempts: Attempt[]; session: Session | null; history: Session[]; customPhrases: Phrase[]; bookmarks: string[]; completedUnits: string[]; coachingNote?: string; mission?: MissionSession; missionHistory?: MissionSession[]; missionAttemptCount?: number; roleplay?: RoleplaySession; roleplayHistory?: RoleplaySession[]; roleplayAttemptCount?: number; }
export interface Grade { correct: boolean; feedback: string; error: Attempt['error']; normalized: string; }
