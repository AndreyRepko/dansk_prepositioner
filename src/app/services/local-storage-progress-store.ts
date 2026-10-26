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
    // Throws when storage is blocked or unreadable; the app then shows the load error
    // instead of practising on empty progress that the next save would write over.
    const raw = localStorage.getItem(key);
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

const IMPORTED_KEY = `${STORAGE_KEY}-imported`;

/** Marks the pre-names progress as imported so it is not imported into a second name. */
export function retireLegacyProgress(): void {
  move(STORAGE_KEY, IMPORTED_KEY, 'Could not mark old progress as imported');
}

/** Undoes `retireLegacyProgress` after its import could not be saved, so it is offered again. */
export function restoreLegacyProgress(): void {
  move(IMPORTED_KEY, STORAGE_KEY, 'Could not restore old progress', true);
}

function move(from: string, to: string, failure: string, keepExisting = false): void {
  try {
    const raw = localStorage.getItem(from);
    if (raw === null || (keepExisting && localStorage.getItem(to) !== null)) return;
    localStorage.setItem(to, raw);
    localStorage.removeItem(from);
  } catch (e) {
    console.error(failure, e);
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
  // Keep unreadable data so the next save does not destroy it for good (once per content).
  if (hasBackup(key, raw)) return emptyProgress();
  const backupKey = `${key}-corrupt-${Date.now()}`;
  try {
    localStorage.setItem(backupKey, raw);
    console.error(`Stored progress could not be read; a copy was kept under "${backupKey}".`);
  } catch (e) {
    console.error('Stored progress could not be read, and no backup could be kept', e);
  }
  return emptyProgress();
}

function hasBackup(key: string, raw: string): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(`${key}-corrupt-`) && localStorage.getItem(k) === raw) return true;
  }
  return false;
}
