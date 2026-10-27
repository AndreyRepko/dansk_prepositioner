import { computed, inject, Injectable, signal } from '@angular/core';
import { Expression, sentencesOf } from '../models/expression';
import {
  emptyProgress,
  isEmptyProgress,
  MAX_MERGED,
  MAX_SESSIONS,
  mergeProgress,
  progressSince,
  ProgressState,
} from '../models/progress';
import { ExpressionService } from './expression.service';
import { GuestMerge, GuestProgressStore } from './local-storage-progress-store';
import { passwordHash } from './password-hash';
import { Account, ProgressStore, WrongPasswordError } from './progress-store';
import {
  applyAnswer,
  buildOptions,
  otherSentence,
  pickSentence,
  Rng,
  selectSession,
  SessionFilter,
} from './srs';
import { cleanName, nameKey } from './user-name';
import { UserService } from './user.service';

export interface QuizSettings extends SessionFilter {
  size: number;
  /** Re-ask a wrong answer with another sentence (random) instead of the same one. */
  retryOtherSentence?: boolean;
}

export interface Question {
  expression: Expression;
  /** Index of the asked sentence in `sentencesOf(expression)`. */
  sentence: number;
  saetning: string;
  options: string[];
  /** A re-ask of an item answered wrong earlier in this session; it does not count for stats. */
  retry: boolean;
}

export interface AnswerRecord {
  expression: Expression;
  saetning: string;
  chosen: string;
  correct: boolean;
}

export const DEFAULT_SETTINGS: QuizSettings = { size: 10 };

/**
 * `unknown`: the name has no account yet (sign in again with `create` to make one).
 * `superseded`: a later sign-in or sign-out took over before this one finished.
 */
export type SignInResult = 'ok' | 'unknown' | 'wrong-password' | 'superseded';

/** Unique enough to tell this browser's merges apart (crypto.randomUUID needs HTTPS). */
const mergeId = (now: number) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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
   * browser once the account has saved it. A marker of each merge (with a copy of what was added)
   * stays until then, so a retried, interrupted or overtaken sign-in adds only what is new since.
   * Nothing changes unless it resolves to 'ok'; 'superseded' when a later sign-in (or sign-out) took
   * over meanwhile. It rejects when the account cannot be reached or saved.
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
    if (token !== this.signInToken) return 'superseded';

    const guest = await this.guest.load().catch((e) => {
      // Unreadable guest progress (blocked storage) cannot be added; it is left where it is.
      console.error('Could not read guest progress to add it to the account', e);
      return null;
    });
    const { adding, inAccount } = guest
      ? await this.guestToAdd(guest, account, server)
      : { adding: null, inAccount: null };
    let progress = server ?? emptyProgress();
    let merge: GuestMerge | null = null;
    if (adding) {
      merge = {
        id: mergeId(this.now()),
        account: nameKey(account.name),
        snapshot: guest!,
        done: false,
      };
      await this.guest.saveMerge(merge);
      const merged = mergeProgress(progress, adding);
      progress = { ...merged, merged: [...(merged.merged ?? []), merge.id].slice(-MAX_MERGED) };
    }
    if (!server || adding) {
      try {
        await this.store.save(account, progress); // creates the account
      } catch (error) {
        if (error instanceof WrongPasswordError) return 'wrong-password'; // claimed meanwhile
        throw error;
      }
    }
    if (merge) await this.guest.saveMerge({ ...merge, done: true });
    // The merge marker covers the guest progress for a later sign-in; it is not touched here
    // because a sign-out meanwhile may already practise on it.
    if (token !== this.signInToken) return 'superseded';
    const added = merge?.snapshot ?? inAccount;
    if (added) await this.keepGuestSince(added);

    this.loadToken++;
    this.users.signIn(account);
    this.resetSession();
    this.progress.set(progress);
    this.loading.set(false);
    this.loadError.set(false);
    this.saveError.set(false);
    return 'ok';
  }

  /**
   * `adding`: the guest progress not yet in any account (null for none): all of it, or only what is
   * new since the last merge when that one is known to have reached its account (`inAccount`).
   */
  private async guestToAdd(guest: ProgressState, account: Account, server: ProgressState | null) {
    const last = await this.guest.loadMerge();
    const landed =
      !!last &&
      (last.done ||
        (last.account === nameKey(account.name) && !!server?.merged?.includes(last.id)));
    const adding = landed ? progressSince(guest, last.snapshot) : guest;
    return {
      adding: isEmptyProgress(adding) ? null : adding,
      inAccount: landed ? last.snapshot : null,
    };
  }

  /** After a merge: only guest answers given since `snapshot` stay in this browser. */
  private async keepGuestSince(snapshot: ProgressState): Promise<void> {
    // Let guest saves started meanwhile land first; from here on, nothing else runs until done.
    for (let edits = -1; edits !== this.edits;) {
      edits = this.edits;
      await this.saving;
    }
    try {
      const rest = progressSince(await this.guest.load(), snapshot);
      await (isEmptyProgress(rest) ? this.guest.clear() : this.guest.save(rest));
      await this.guest.clearMerge();
    } catch (e) {
      // The merge marker stays, so the next sign-in still adds only what is new.
      console.error('Could not clear guest progress', e);
    }
  }

  /** Removes a name from this browser's list; removing the current one goes back to guest. */
  async forget(name: string): Promise<void> {
    const wasSignedIn = !!this.users.current();
    this.users.forget(name);
    if (wasSignedIn && !this.users.current()) await this.signOut();
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
        items: {
          ...s.items,
          [id]: applyAnswer(s.items[id], correct, this.now(), q.sentence, option),
        },
      }));
      this.results.update((r) => [
        ...r,
        { expression: q.expression, saetning: q.saetning, chosen: option, correct },
      ]);
      void this.persist();
    }
    if (!correct) {
      // Which helps more, the same sentence or another one, is untested; it is a setting.
      const sentence = this.settings().retryOtherSentence
        ? otherSentence(q.expression, q.sentence, this.rng)
        : q.sentence;
      this.queue.update((queue) => [...queue, this.toQuestion(q.expression, true, sentence)]);
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

  /** A question on `sentence`, or by default on the sentence due for this expression. */
  private toQuestion(
    expression: Expression,
    retry: boolean,
    sentence = pickSentence(expression, this.progress().items[expression.id], this.rng),
  ): Question {
    const asked = sentencesOf(expression)[sentence];
    return {
      expression,
      sentence,
      saetning: asked.saetning,
      options: buildOptions(expression.praeposition, asked, this.rng),
      retry,
    };
  }
}
