import { Injectable, signal } from '@angular/core';
import { cleanName, nameKey } from './user-name';

export const CURRENT_USER_KEY = 'dansk-prep-user';
export const KNOWN_USERS_KEY = 'dansk-prep-known-users';
const MAX_KNOWN = 10;

/** Who is practising in this browser. No login: the name only selects whose progress is used. */
@Injectable({ providedIn: 'root' })
export class UserService {
  readonly current = signal<string | null>(readCurrent());
  /** Names used in this browser, most recent first. */
  readonly known = signal<string[]>(readKnown());

  /** Makes `raw` the current user; returns the cleaned name, or null when it is not allowed. */
  select(raw: string): string | null {
    const name = cleanName(raw);
    if (!name) return null;
    this.current.set(name);
    this.known.update((list) => [name, ...list.filter((n) => nameKey(n) !== nameKey(name))].slice(0, MAX_KNOWN));
    write(CURRENT_USER_KEY, name);
    write(KNOWN_USERS_KEY, JSON.stringify(this.known()));
    return name;
  }

  /** Removes a name from this browser's list (its saved progress is kept). */
  forget(name: string): void {
    this.known.update((list) => list.filter((n) => nameKey(n) !== nameKey(name)));
    write(KNOWN_USERS_KEY, JSON.stringify(this.known()));
    if (this.current() && nameKey(this.current()!) === nameKey(name)) this.clear();
  }

  /** No current user: the name screen is shown next. */
  clear(): void {
    this.current.set(null);
    try {
      localStorage.removeItem(CURRENT_USER_KEY);
    } catch {
      // storage blocked: the name is only kept in memory anyway
    }
  }
}

function readCurrent(): string | null {
  return cleanName(read(CURRENT_USER_KEY) ?? '');
}

function readKnown(): string[] {
  try {
    const list: unknown = JSON.parse(read(KNOWN_USERS_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.map((n) => (typeof n === 'string' ? cleanName(n) : null)).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the name works for this visit only
  }
}
