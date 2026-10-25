import { Injectable } from '@angular/core';
import { emptyProgress, ProgressState } from '../models/progress';
import { ProgressStore } from './progress-store';

export const STORAGE_KEY = 'dansk-prep-progress-v1';

@Injectable()
export class LocalStorageProgressStore extends ProgressStore {
  override async load(): Promise<ProgressState> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyProgress();
      const parsed = JSON.parse(raw) as ProgressState;
      if (parsed?.version !== 1 || typeof parsed.items !== 'object' || !Array.isArray(parsed.sessions)) {
        return emptyProgress();
      }
      return parsed;
    } catch {
      return emptyProgress();
    }
  }

  override async save(state: ProgressState): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Could not save progress', e);
    }
  }
}
