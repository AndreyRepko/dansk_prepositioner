import { Injectable } from '@angular/core';
import { emptyProgress, parseProgress, ProgressState } from '../models/progress';
import { ProgressStore } from './progress-store';

export const STORAGE_KEY = 'dansk-prep-progress-v1';

@Injectable()
export class LocalStorageProgressStore extends ProgressStore {
  override async load(): Promise<ProgressState> {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      // Storage blocked for this site: nothing can be read, so practice without it.
      // The first save fails too and the app shows the "not being saved" warning.
      console.error('Could not read stored progress', e);
      return emptyProgress();
    }
    if (!raw) return emptyProgress();
    let parsed: ProgressState | null = null;
    try {
      parsed = parseProgress(JSON.parse(raw));
    } catch {
      // not JSON; handled below
    }
    if (parsed) return parsed;
    // Keep unreadable data so the next save does not destroy it for good.
    const backupKey = `${STORAGE_KEY}-corrupt-${Date.now()}`;
    try {
      localStorage.setItem(backupKey, raw);
      console.error(`Stored progress could not be read; a copy was kept under "${backupKey}".`);
    } catch (e) {
      console.error('Stored progress could not be read, and no backup could be kept', e);
    }
    return emptyProgress();
  }

  override async save(state: ProgressState): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}
