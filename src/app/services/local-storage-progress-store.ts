import { Injectable } from '@angular/core';
import { emptyProgress, parseProgress, ProgressState } from '../models/progress';
import { ProgressStore } from './progress-store';
import { nameKey } from './user-name';

/** Before names existed, progress was stored under this key alone. */
export const STORAGE_KEY = 'dansk-prep-progress-v1';

export const storageKey = (user: string) => `${STORAGE_KEY}:${nameKey(user)}`;

/** Keeps progress in this browser, one entry per name. Used for local development. */
@Injectable()
export class LocalStorageProgressStore extends ProgressStore {
  override async load(user: string): Promise<ProgressState> {
    const key = storageKey(user);
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      // Storage blocked for this site: nothing can be read, so practice without it.
      // The first save fails too and the app shows the "not being saved" warning.
      console.error('Could not read stored progress', e);
      return emptyProgress();
    }
    return raw ? parseOrBackup(key, raw) : emptyProgress();
  }

  override async save(user: string, state: ProgressState): Promise<void> {
    localStorage.setItem(storageKey(user), JSON.stringify(state));
  }
}

/** Progress saved by the app before names existed, if any. */
export function readLegacyProgress(): ProgressState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseOrBackup(STORAGE_KEY, raw) : null;
  } catch {
    return null;
  }
}

/** Marks the pre-names progress as imported so it is not imported into a second name. */
export function retireLegacyProgress(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return;
    localStorage.setItem(`${STORAGE_KEY}-imported`, raw);
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Could not mark old progress as imported', e);
  }
}

function parseOrBackup(key: string, raw: string): ProgressState {
  let parsed: ProgressState | null = null;
  try {
    parsed = parseProgress(JSON.parse(raw));
  } catch {
    // not JSON; handled below
  }
  if (parsed) return parsed;
  // Keep unreadable data so the next save does not destroy it for good.
  const backupKey = `${key}-corrupt-${Date.now()}`;
  try {
    localStorage.setItem(backupKey, raw);
    console.error(`Stored progress could not be read; a copy was kept under "${backupKey}".`);
  } catch (e) {
    console.error('Stored progress could not be read, and no backup could be kept', e);
  }
  return emptyProgress();
}
