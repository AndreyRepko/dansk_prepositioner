import { computed, inject, Injectable, signal } from '@angular/core';
import { Expression } from '../models/expression';
import { emptyProgress, isEmptyProgress, MAX_SESSIONS, mergeProgress, ProgressState } from '../models/progress';
import { ExpressionService } from './expression.service';
import { GuestProgressStore } from './local-storage-progress-store';
import { passwordHash } from './password-hash';
import { Account, ProgressStore, WrongPasswordError } from './progress-store';
import { applyAnswer, buildOptions, Rng, selectSession, SessionFilter } from './srs';
import { cleanName } from './user-name';
import { UserService } from './user.service';

export interface QuizSettings extends SessionFilter {
  size: number;
}

export interface Question {
  expression: Expression;
  options: string[];
  /** A re-ask of an item answered wrong earlier in this session; it does not count for stats. */
  retry: boolean;
}

export interface AnswerRecord {
  expression: Expression;
  chosen: string;
  correct: boolean;
}

export const DEFAULT_SETTINGS: QuizSettings = { size: 10 };

/** `unknown`: the name has no account yet (sign in again with `create` to make one). */
export type SignInResult = 'ok' | 'unknown' | 'wrong-password';

@Injectable({ providedIn: 'root' })
export class QuizService {
  /** Accounts (the API in production). */
  private readonly store = inject(ProgressStore);
  private readonly guest = inject(GuestProgressStore);
  private readonly expressionService = inject(ExpressionService);
  private readonly users = inject(UserService);
  private saving: Promise<void> = Promise.resolve();
  /** Increments per load so a slow response for a previous name is ignored. */
  private loadToken = 0;
  /** Increments per save so a refresh does not replace changes made while it was loading. */
  private edits = 0;
  /** Increments per sign-in so only the last of several quick ones takes effect. */
  private signInToken = 0;

  /** Overridable in tests. */
  now: () => number = Date.now;
  rng: Rng = Math.random;

  readonly progress = signal<ProgressState>(emptyProgress());
  readonly settings = signal<QuizSettings>(DEFAULT_SETTINGS);

  readonly queue = signal<Question[]>([]);
  readonly index = signal(0);
  readonly chosen = signal<string | null>(null);
  /** First attempts only, in the order they were answered. */
  readonly results = signal<AnswerRecord[]>([]);
  readonly finished = signal(false);
  /** Progress for the current user (or guest) is being fetched. */
  readonly loading = signal(false);
  /** Saved progress could not be loaded; saving is disabled so it is not overwritten. */
  readonly loadError = signal(false);
  /** The last save failed. */
  readonly saveError = signal(false);

  readonly current = computed<Question | undefined>(() => this.queue()[this.index()]);
  readonly active = computed(() => this.queue().length > 0 && !this.finished());
  readonly isCorrect = computed(() => {
    const q = this.current();
    const c = this.chosen();
    return q && c !== null ? c === q.expression.praeposition : null;
  });

  /** Loads the expressions and the progress of the current user, or of the guest. */
  async init(): Promise<void> {
    await Promise.all([this.expressionService.load(), this.loadProgress()]);
  }

  /** Signs in with a name and password (see `signInAs`); null for an invalid name or empty password. */
  async signIn(rawName: string, password: string, create = false): Promise<SignInResult | null> {
    const name = cleanName(rawName);
    if (!name || !password) return null;
    return this.signInAs({ name, hash: await passwordHash(name, password) }, create);
  }

  /**
   * Makes `account` the current user. Guest progress is added to the account and removed from this
   * browser only once the account has saved it, so nothing is lost or counted twice. Nothing changes
   * unless it resolves to 'ok'; it rejects when the account cannot be reached or saved.
   */
  async signInAs(account: Account, create = false): Promise<SignInResult> {
    const token = ++this.signInToken;
    await this.saving; // a guest answer just given is included
    let server: ProgressState | null;
    try {
      server = await this.store.load(account);
    } catch (error) {
      if (error instanceof WrongPasswordError) return 'wrong-password';
      throw error;
    }
    if (!server && !create) return 'unknown';

    const edits = this.edits;
    // Unreadable guest progress (blocked storage) cannot be added; it is left where it is.
    const guest = await this.guest.load().catch(() => null);
    const adding = !!guest && !isEmptyProgress(guest);
    const progress = adding ? mergeProgress(server ?? emptyProgress(), guest) : (server ?? emptyProgress());
    if (!server || adding) await this.store.save(account, progress); // creates the account
    if (token !== this.signInToken) return 'ok'; // a later sign-in (or sign-out) decides who is current
    // An answer given as guest meanwhile is not in the account, so then the guest progress stays.
    if (adding && edits === this.edits) {
      await this.guest.clear().catch((e) => console.error('Could not clear guest progress', e));
    }

    this.loadToken++;
    this.users.signIn(account);
    this.resetSession();
    this.progress.set(progress);
    this.loading.set(false);
    this.loadError.set(false);
    this.saveError.set(false);
    return 'ok';
  }

  /** Back to practising as guest (also after the account's progress could not be loaded). */
  async signOut(): Promise<void> {
    this.signInToken++;
    this.users.signOut();
    await this.loadProgress();
  }

  private async loadProgress(): Promise<void> {
    const token = ++this.loadToken;
    const user = this.users.current();
    this.resetSession();
    this.progress.set(emptyProgress());
    this.loadError.set(false);
    this.saveError.set(false);

    this.loading.set(true);
    // Saves still running (e.g. for this name before a quick switch away and back) land first.
    await this.saving;
    if (token !== this.loadToken) return;
    let progress: ProgressState;
    try {
      progress = await this.load(user);
    } catch (error) {
      if (token === this.loadToken) {
        this.loadError.set(true);
        this.loading.set(false);
      }
      throw error;
    }
    if (token !== this.loadToken) return;
    this.progress.set(progress);
    this.loading.set(false);
  }

  /** Progress of `user`, or of the guest for null. */
  private async load(user: Account | null): Promise<ProgressState> {
    return user ? ((await this.store.load(user)) ?? emptyProgress()) : this.guest.load();
  }

  /**
   * Reloads the current progress (e.g. when the tab is shown again after practice on another
   * device or tab). Skipped during a session; kept as is when it fails or something was saved meanwhile.
   */
  async refresh(): Promise<void> {
    const user = this.users.current();
    if (this.loading() || this.loadError() || this.active()) return;
    const token = this.loadToken;
    const edits = this.edits;
    await this.saving;
    let progress: ProgressState;
    try {
      progress = await this.load(user);
    } catch (error) {
      console.error('Could not refresh progress', error);
      return;
    }
    if (token !== this.loadToken || edits !== this.edits || this.active()) return;
    this.progress.set(progress);
  }

  private resetSession(): void {
    this.queue.set([]);
    this.index.set(0);
    this.chosen.set(null);
    this.results.set([]);
    this.finished.set(false);
  }

  /** Returns the number of questions picked (0 when the filter matches nothing). */
  start(settings: QuizSettings): number {
    this.settings.set(settings);
    const picked = selectSession(
      this.expressionService.expressions(),
      this.progress(),
      settings.size,
      settings,
      this.now(),
      this.rng,
    );
    this.resetSession();
    this.queue.set(picked.map((expression) => this.toQuestion(expression, false)));
    return picked.length;
  }

  answer(option: string): void {
    const q = this.current();
    if (!q || this.chosen() !== null) return;
    this.chosen.set(option);
    const correct = option === q.expression.praeposition;

    if (!q.retry) {
      const id = q.expression.id;
      this.progress.update((s) => ({
        ...s,
        items: { ...s.items, [id]: applyAnswer(s.items[id], correct, this.now()) },
      }));
      this.results.update((r) => [...r, { expression: q.expression, chosen: option, correct }]);
      void this.persist();
    }
    if (!correct) {
      this.queue.update((queue) => [...queue, this.toQuestion(q.expression, true)]);
    }
  }

  next(): void {
    if (this.chosen() === null || this.finished()) return;
    if (this.index() + 1 < this.queue().length) {
      this.index.update((i) => i + 1);
      this.chosen.set(null);
      return;
    }
    const results = this.results();
    this.progress.update((s) => ({
      ...s,
      sessions: [
        ...s.sessions,
        { date: this.now(), total: results.length, correct: results.filter((r) => r.correct).length },
      ].slice(-MAX_SESSIONS),
    }));
    void this.persist();
    this.finished.set(true);
  }

  async resetProgress(): Promise<void> {
    this.progress.set(emptyProgress());
    this.resetSession();
    await this.persist();
  }

  /**
   * Saves the current progress for the current user (or guest); saves run one after another so
   * they cannot land out of order. Each save is bound to the user it was made for.
   */
  private persist(): Promise<boolean> {
    const user = this.users.current();
    if (this.loadError() || this.loading()) return Promise.resolve(false);
    const state = this.progress();
    const token = this.loadToken;
    this.edits++;
    const saved = this.saving
      .then(() => (user ? this.store.save(user, state) : this.guest.save(state)))
      .then(
        () => {
          if (token === this.loadToken) this.saveError.set(false);
          return true;
        },
        (error) => {
          console.error('Could not save progress', error);
          if (token === this.loadToken) this.saveError.set(true);
          return false;
        },
      );
    this.saving = saved.then(() => undefined);
    return saved;
  }

  private toQuestion(expression: Expression, retry: boolean): Question {
    return { expression, options: buildOptions(expression, this.rng), retry };
  }
}
