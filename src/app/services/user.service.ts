import { Injectable, signal } from '@angular/core';
import { isPasswordHash } from './password-hash';
import { Account } from './progress-store';
import { cleanName, nameKey } from './user-name';

export const CURRENT_USER_KEY = 'dansk-prep-user';
export const KNOWN_USERS_KEY = 'dansk-prep-known-users';
const MAX_KNOWN = 10;

/** A name signed in on this browser. `hash` is null for names used before passwords existed. */
export interface KnownUser {
  name: string;
  hash: string | null;
}

/** Who is practising in this browser: an account, or null for a guest (progress kept locally). */
@Injectable({ providedIn: 'root' })
export class UserService {
  readonly current = signal<Account | null>(readCurrent());
  /** Names signed in on this browser, most recent first. */
  readonly known = signal<KnownUser[]>(readKnown());

  /** Makes `account` (with a cleaned name, already checked by the store) the current user. */
  signIn(account: Account): void {
    this.current.set(account);
    this.known.update((list) => [account, ...list.filter((u) => nameKey(u.name) !== nameKey(account.name))].slice(0, MAX_KNOWN));
    write(CURRENT_USER_KEY, JSON.stringify(account));
    write(KNOWN_USERS_KEY, JSON.stringify(this.known()));
  }

  /** Removes a name from this browser's list (its saved progress is kept). */
  forget(name: string): void {
    this.known.update((list) => list.filter((u) => nameKey(u.name) !== nameKey(name)));
    write(KNOWN_USERS_KEY, JSON.stringify(this.known()));
    const current = this.current();
    if (current && nameKey(current.name) === nameKey(name)) this.signOut();
  }

  /** Back to guest mode. */
  signOut(): void {
    this.current.set(null);
    try {
      localStorage.removeItem(CURRENT_USER_KEY);
    } catch {
      // storage blocked: the account is only kept in memory anyway
    }
  }
}

function toKnown(v: unknown): KnownUser | null {
  // Before passwords existed, only names were stored.
  if (typeof v === 'string') {
    const name = cleanName(v);
    return name ? { name, hash: null } : null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const { name, hash } = v as Record<string, unknown>;
  const clean = typeof name === 'string' ? cleanName(name) : null;
  return clean ? { name: clean, hash: isPasswordHash(hash) ? hash : null } : null;
}

function readCurrent(): Account | null {
  const user = toKnown(parse(read(CURRENT_USER_KEY)));
  return user?.hash ? { name: user.name, hash: user.hash } : null;
}

function readKnown(): KnownUser[] {
  const list = parse(read(KNOWN_USERS_KEY));
  const known = Array.isArray(list) ? list.map(toKnown).filter((u): u is KnownUser => !!u) : [];
  // A name stored before passwords existed was the current one; keep it findable.
  const current = parse(read(CURRENT_USER_KEY));
  const old = typeof current === 'string' ? toKnown(current) : null;
  if (old &&!known.some((u) => nameKey(u.name) === nameKey(old.name))) known.unshift(old);
  return known;
}

/** Stored JSON, or the raw text for an old plain name (which may not be JSON, or be JSON like "123"). */
function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' ? value : raw;
  } catch {
    return raw;
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
    // storage blocked: the account works for this visit only
  }
}
