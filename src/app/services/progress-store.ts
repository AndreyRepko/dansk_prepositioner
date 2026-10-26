import { ProgressState } from '../models/progress';

/**
 * Persistence for one user's learning progress, keyed by name. Async so that a
 * backend implementation (Azure Functions + Table Storage) can be swapped in via DI.
 *
 * - `load()` resolves to empty progress only when there is no saved data;
 *   it rejects when the data cannot be fetched or read (network, blocked storage).
 * - `save()` may reject; callers report the failure to the user.
 */
export abstract class ProgressStore {
  abstract load(user: string): Promise<ProgressState>;
  abstract save(user: string, state: ProgressState): Promise<void>;
}
