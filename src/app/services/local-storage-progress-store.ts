import { Injectable } from '@angular/core';
import { emptyProgress, parseProgress, ProgressState } from '../models/progress';
import { Account, ProgressStore, WrongPasswordError } from './progress-store';
import { nameKey } from './user-name';

/** Guest progress (and, before names existed, everyone's progress) is stored under this key alone. */
export const STORAGE_KEY = 'dansk-prep-progress-v1';
/** The last time guest progress was added to an account (see `GuestMerge`). */
export const MERGE_KEY = 'dansk-prep-guest-merge';

export const storageKey = (user: string) => `${STORAGE_KEY}:${nameKey(user)}`;
export const passwordKey = (user: string) => `${storageKey(user)}:pw`;

/**
 * Keeps account progress in this browser, one entry per name, checking passwords like the API does.
 * Used for local development, so signing in works without the API.
 */
@Injectable()
export class LocalStorageProgressStore extends ProgressStore {
  override async load(account: Account): Promise<ProgressState | null> {
    const key = storageKey(account.name);
    // Throws when storage is blocked or unreadable; the app then shows the load error
    // instead of practising on empty progress that the next save would write over.
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    this.checkPassword(account);
    return parseOrBackup(key, raw);
  }

  override async save(account: Account, state: ProgressState): Promise<void> {
    this.checkPassword(account);
    localStorage.setItem(storageKey(account.name), JSON.stringify(state));
  }

  /** As in the API, a name saved without a password is claimed by the first one used. */
  private checkPassword(account: Account): void {
    const stored = localStorage.getItem(passwordKey(account.name));
    if (stored === null) localStorage.setItem(passwordKey(account.name), account.hash);
    else if (stored !== account.hash) throw new WrongPasswordError(account.name);
  }
}

/**
 * Guest progress `snapshot` added to `account` under merge id `id`. `done` once the account saved it;
 * until then it may or may not have landed (a lost response), which the account's merge ids tell.
 */
export interface GuestMerge {
  id: string;
  account: string;
  snapshot: ProgressState;
  done: boolean;
}

/** Progress of practice without signing in; it stays in this browser. */
@Injectable({ providedIn: 'root' })
export class GuestProgressStore {
  /** Rejects when storage is blocked; unreadable data is backed up and reads as empty. */
  async load(): Promise<ProgressState> {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseOrBackup(STORAGE_KEY, raw) : emptyProgress();
  }

  async save(state: ProgressState): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /** After guest progress was added to an account, so it is not added twice. */
  async clear(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** The last merge into an account, or null (also when unreadable). */
  async loadMerge(): Promise<GuestMerge | null> {
    const raw = localStorage.getItem(MERGE_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<GuestMerge>;
      const snapshot = parseProgress(value.snapshot);
      if (typeof value.id !== 'string' || typeof value.account !== 'string' || !snapshot)
        return null;
      return { id: value.id, account: value.account, snapshot, done: value.done === true };
    } catch {
      return null;
    }
  }

  async saveMerge(merge: GuestMerge): Promise<void> {
    localStorage.setItem(MERGE_KEY, JSON.stringify(merge));
  }

  async clearMerge(): Promise<void> {
    localStorage.removeItem(MERGE_KEY);
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
