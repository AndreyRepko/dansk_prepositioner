import { ProgressState } from '../models/progress';

/**
 * Persistence for learning progress. Async so that a backend implementation
 * (e.g. Azure Functions + Table Storage) can be swapped in via DI.
 */
export abstract class ProgressStore {
  abstract load(): Promise<ProgressState>;
  abstract save(state: ProgressState): Promise<void>;
}
