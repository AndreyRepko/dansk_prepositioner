import { ProgressState } from '../models/progress';

/**
 * Persistence for learning progress. Async so that a backend implementation
 * (e.g. Azure Functions + Table Storage) can be swapped in via DI.
 *
 * - `load()` resolves to empty progress only when there is no saved data;
 *   it rejects when the data cannot be fetched (network, auth, blocked storage).
 * - `save()` may reject; callers report the failure to the user.
 */
export abstract class ProgressStore {
  abstract load(): Promise<ProgressState>;
  abstract save(state: ProgressState): Promise<void>;
}
