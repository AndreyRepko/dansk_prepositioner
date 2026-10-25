import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { emptyProgress, parseProgress, ProgressState } from '../models/progress';
import { ProgressStore } from './progress-store';

export const progressUrl = (user: string) => `/api/progress/${encodeURIComponent(user)}`;

/** Keeps progress in Azure (api/ functions + Table Storage), keyed by name. */
@Injectable()
export class ApiProgressStore extends ProgressStore {
  private readonly http = inject(HttpClient);

  override async load(user: string): Promise<ProgressState> {
    let body: unknown;
    try {
      body = await firstValueFrom(this.http.get<unknown>(progressUrl(user)));
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) return emptyProgress(); // new name
      throw e;
    }
    const progress = parseProgress(body);
    // Rejecting keeps saving disabled, so unreadable data on the server is not overwritten.
    if (!progress) throw new Error('Saved progress from the server could not be read');
    return progress;
  }

  override async save(user: string, state: ProgressState): Promise<void> {
    await firstValueFrom(this.http.put(progressUrl(user), state));
  }
}
