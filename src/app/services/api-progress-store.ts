import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { parseProgress, ProgressState } from '../models/progress';
import { Account, ConflictError, ProgressStore, WrongPasswordError } from './progress-store';

export const progressUrl = (user: string) => `/api/progress/${encodeURIComponent(user)}`;

const headers = (account: Account) => new HttpHeaders({ 'X-Password-Hash': account.hash });

/** Keeps progress in Azure (api/ functions + Table Storage), keyed by name. */
@Injectable()
export class ApiProgressStore extends ProgressStore {
  private readonly http = inject(HttpClient);

  override async load(account: Account): Promise<ProgressState | null> {
    let body: unknown;
    try {
      body = await firstValueFrom(this.http.get<unknown>(progressUrl(account.name), { headers: headers(account) }));
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) return null; // no account yet
      throw this.failure(e, account);
    }
    const progress = parseProgress(body);
    // Rejecting keeps saving disabled, so unreadable data on the server is not overwritten.
    if (!progress) throw new Error('Saved progress from the server could not be read');
    return progress;
  }

  override async save(account: Account, state: ProgressState): Promise<void> {
    try {
      await firstValueFrom(this.http.put(progressUrl(account.name), state, { headers: headers(account) }));
    } catch (e) {
      throw this.failure(e, account);
    }
  }

  /** 401 (no valid hash sent) is a bug in the app, not a wrong password, so it stays an HTTP error. */
  private failure(e: unknown, account: Account): unknown {
    if (e instanceof HttpErrorResponse && e.status === 403)
      return new WrongPasswordError(account.name);
    if (e instanceof HttpErrorResponse && e.status === 409) return new ConflictError(account.name);
    return e;
  }
}
