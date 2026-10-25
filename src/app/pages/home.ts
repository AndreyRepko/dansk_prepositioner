import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Category } from '../models/expression';
import { ExpressionService } from '../services/expression.service';
import { QuizService } from '../services/quiz.service';
import { overview, percent } from '../services/stats';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Danske præpositioner</h1>

    <section class="card">
      <div class="counts">
        <div><strong>{{ ov().mastered }}</strong><span class="muted">mastered</span></div>
        <div><strong>{{ ov().learning }}</strong><span class="muted">learning</span></div>
        <div><strong>{{ ov().fresh }}</strong><span class="muted">new</span></div>
        <div><strong>{{ ov().dueNow }}</strong><span class="muted">due now</span></div>
      </div>
      <div class="bar" [attr.aria-label]="ov().mastered + ' of ' + ov().total + ' mastered'">
        <span class="mastered" [style.width.%]="pct(ov().mastered)"></span>
        <span class="learning" [style.width.%]="pct(ov().learning)"></span>
      </div>
      <p class="muted small">{{ pct(ov().mastered) }}% of {{ ov().total }} expressions mastered</p>
    </section>

    <section class="card settings">
      <label>
        Questions
        <!-- [selected] on the options, not [value] on the select: the options do not exist yet when the select's value is bound -->
        <select (change)="setSize($event)">
          @for (n of sizes; track n) {
            <option [value]="n" [selected]="n === settings().size">{{ n }}</option>
          }
        </select>
      </label>
      <label>
        Category
        <select (change)="setCategory($event)">
          <option value="" [selected]="!settings().category">All</option>
          @for (c of categories(); track c) {
            <option [value]="c" [selected]="c === settings().category">{{ c }}</option>
          }
        </select>
      </label>
      <label class="check">
        <input type="checkbox" [checked]="settings().onlyMineFejl ?? false" (change)="setMineFejl($event)" />
        Only my own mistakes
      </label>
      <div class="actions">
        <button class="primary" (click)="start()">Start</button>
      </div>
      @if (empty()) {
        <p class="error">No expressions match this filter.</p>
      }
    </section>
  `,
  styles: `
    .counts {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      text-align: center;
    }
    .counts div {
      display: flex;
      flex-direction: column;
    }
    .counts strong {
      font-size: 1.5rem;
    }
    .small {
      font-size: 0.9rem;
      margin: 0.5rem 0 0;
    }
    .settings {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .settings label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .settings label.check {
      justify-content: flex-start;
    }
  `,
})
export class HomePage {
  private readonly quiz = inject(QuizService);
  private readonly router = inject(Router);
  private readonly expressions = inject(ExpressionService).expressions;

  protected readonly sizes = [5, 10, 20, 30];
  protected readonly settings = this.quiz.settings;
  protected readonly ov = computed(() => overview(this.expressions(), this.quiz.progress(), this.quiz.now()));
  protected readonly categories = computed(() => [...new Set(this.expressions().map((e) => e.kategori))]);
  protected readonly empty = signal(false);

  protected pct(n: number): number {
    return percent(n, this.ov().total);
  }

  protected setSize(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    this.settings.update((s) => ({ ...s, size }));
  }

  protected setCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.settings.update((s) => ({ ...s, category: (value || undefined) as Category | undefined }));
  }

  protected setMineFejl(event: Event): void {
    const onlyMineFejl = (event.target as HTMLInputElement).checked;
    this.settings.update((s) => ({ ...s, onlyMineFejl }));
  }

  protected start(): void {
    this.empty.set(this.quiz.start(this.settings()) === 0);
    if (!this.empty()) void this.router.navigate(['/quiz']);
  }
}
