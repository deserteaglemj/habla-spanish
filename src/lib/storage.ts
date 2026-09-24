import type { AppState } from '../types';
import { createInitialState, exportBackup, importBackup } from './engine';

export const STORAGE_KEY = 'habla.progress.v1';

export function loadState(): { state: AppState; error: string | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return { state: createInitialState(), error: null };
    return { state: importBackup(stored), error: null };
  } catch (error) {
    return { state: createInitialState(), error: `Saved progress could not be read. The existing browser data has been left untouched. Export or recover it before replacing it. ${error instanceof Error ? error.message : 'Browser storage is unavailable.'}` };
  }
}

export function saveState(state: AppState): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, exportBackup(state));
    return null;
  } catch {
    return 'Your latest progress is only in this open tab because browser storage could not be updated. Download a backup now to keep it.';
  }
}
