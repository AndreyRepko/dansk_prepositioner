import { ProgressState } from '../models/progress';

/** A signed-in name. `hash` is SHA-256 of password + name key (see password-hash.ts). */
export interface Account {
  name: string;
  hash: string;
}

/** The name exists with a different password. */
export class WrongPasswordError extends Error {
  constructor(name: string) {
    super(`Wrong password for "${name}"`);
    this.name = 'WrongPasswordError';
  }
}

/** The name was created or claimed on another device at the same moment; trying again sorts it out. */
export class ConflictError extends Error {
  constructor(name: string) {
    super(`"${name}" was changed at the same time elsewhere`);
    this.name = 'ConflictError';
  }
}

/**
 * Persistence for one account's learning progress. Async so that a backend
 * implementation (Azure Functions + Table Storage) can be swapped in via DI.
 *
 * - `load()` resolves to null when the name has no saved data yet (no account);
 *   it rejects with `WrongPasswordError` for a wrong password, `ConflictError` when the name
 *   is claimed elsewhere at the same moment, and otherwise when the data cannot be fetched
 *   or read (network, blocked storage).
 * - `save()` creates the account when it does not exist yet; it rejects like `load()`, and
 *   callers report the failure to the user.
 */
export abstract class ProgressStore {
  abstract load(account: Account): Promise<ProgressState | null>;
  abstract save(account: Account, state: ProgressState): Promise<void>;
}
