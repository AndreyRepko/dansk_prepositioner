import { computed, inject, Injectable, signal } from '@angular/core';
import { Expression } from '../models/expression';
import { emptyProgress, ProgressState } from '../models/progress';
import { ExpressionService } from './expression.service';
import { ProgressStore } from './progress-store';
import { applyAnswer, buildOptions, Rng, selectSession, SessionFilter } from './srs';

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

@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly store = inject(ProgressStore);
  private readonly expressionService = inject(ExpressionService);
  private ready?: Promise<void>;
  private saving: Promise<void> = Promise.resolve();

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

  init(): Promise<void> {
    this.ready ??= Promise.all([this.store.load(), this.expressionService.load()]).then(
      ([progress]) => {
        this.progress.set(progress);
        this.loadError.set(false);
      },
      (error) => {
        this.ready = undefined;
        this.loadError.set(true);
        throw error;
      },
    );
    return this.ready;
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
    this.queue.set(picked.map((expression) => this.toQuestion(expression, false)));
    this.index.set(0);
    this.chosen.set(null);
    this.results.set([]);
    this.finished.set(false);
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
      ],
    }));
    void this.persist();
    this.finished.set(true);
  }

  async resetProgress(): Promise<void> {
    this.progress.set(emptyProgress());
    this.queue.set([]);
    this.results.set([]);
    this.finished.set(false);
    await this.persist();
  }

  /** Saves the current progress; saves run one after another so they cannot land out of order. */
  private persist(): Promise<void> {
    if (this.loadError()) return Promise.resolve();
    const state = this.progress();
    this.saving = this.saving
      .then(() => this.store.save(state))
      .then(
        () => this.saveError.set(false),
        (error) => {
          console.error('Could not save progress', error);
          this.saveError.set(true);
        },
      );
    return this.saving;
  }

  private toQuestion(expression: Expression, retry: boolean): Question {
    return { expression, options: buildOptions(expression, this.rng), retry };
  }
}
