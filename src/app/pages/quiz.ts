import { ChangeDetectionStrategy, Component, computed, HostListener, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DONT_KNOW, GAP } from '../models/expression';
import { QuizService } from '../services/quiz.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz',
  template: `
    @if (question(); as q) {
      <div class="progress muted">
        @if (q.retry) {
          <span>Try again</span>
        } @else {
          <span>Question {{ number() }} / {{ total() }}</span>
        }
        <span>{{ score() }} correct</span>
      </div>

      <section class="card">
        <p class="sentence">
          {{ parts().before }}<span class="gap" [class.good]="correct() === true" [class.bad]="correct() === false && !dontKnow()">{{
            chosen() === null ? '___' : q.expression.praeposition
          }}</span>{{ parts().after }}
        </p>

        <div class="options">
          @for (option of q.options; track option; let i = $index) {
            <button
              [class.good]="chosen() !== null && option === q.expression.praeposition"
              [class.bad]="chosen() === option && option !== q.expression.praeposition"
              [disabled]="chosen() !== null"
              (click)="answer(option)"
            >
              <span class="key">{{ i + 1 }}</span> {{ option }}
            </button>
          }
        </div>
        <button
          class="dont-know"
          [class.chosen]="dontKnow()"
          [disabled]="chosen() !== null"
          (click)="answer(dontKnowAnswer)"
        >
          <span class="key">0</span> Ved ikke
        </button>
      </section>

      @if (chosen() !== null) {
        <section class="card feedback" [class.good]="correct()" [class.bad]="!correct() && !dontKnow()">
          <p class="verdict">{{ verdict() }}</p>
          <p><strong>{{ q.expression.udtryk }}</strong> — {{ q.expression.forklaring }}</p>
          <p class="muted">{{ q.expression.ukrainsk }}</p>
          <p class="muted">{{ q.expression.engelsk }}</p>
          <div class="actions">
            <button class="primary" (click)="next()" autofocus>Next ↵</button>
          </div>
        </section>
      }
    }
  `,
  styles: `
    .progress {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
    }
    .sentence {
      font-size: 1.3rem;
      margin: 0.25rem 0 1.25rem;
    }
    .gap {
      display: inline-block;
      min-width: 3ch;
      padding: 0 0.3rem;
      border-bottom: 2px solid var(--accent);
      font-weight: 700;
      text-align: center;
    }
    .gap.good {
      color: var(--good);
      border-color: var(--good);
    }
    .gap.bad {
      color: var(--bad);
      border-color: var(--bad);
    }
    .options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .options button {
      font-size: 1.1rem;
      padding: 0.85rem;
      text-align: left;
    }
    .dont-know {
      display: block;
      width: 100%;
      margin-top: 0.75rem;
      padding: 0.6rem;
      color: var(--muted);
    }
    .options button:disabled,
    .dont-know:disabled {
      opacity: 1;
    }
    .dont-know.chosen {
      border-color: var(--text);
      color: var(--text);
      font-weight: 600;
    }
    .options button.good {
      background: var(--good-bg);
      border-color: var(--good);
      color: var(--good);
      font-weight: 600;
    }
    .options button.bad {
      background: var(--bad-bg);
      border-color: var(--bad);
      color: var(--bad);
    }
    .key {
      color: var(--muted);
      font-size: 0.85rem;
      margin-right: 0.35rem;
    }
    .feedback p {
      margin: 0.25rem 0;
    }
    .feedback.good {
      border-color: var(--good);
    }
    .feedback.bad {
      border-color: var(--bad);
    }
    .verdict {
      font-weight: 700;
    }
    .feedback.good .verdict {
      color: var(--good);
    }
    .feedback.bad .verdict {
      color: var(--bad);
    }
  `,
})
export class QuizPage implements OnInit {
  private readonly quiz = inject(QuizService);
  private readonly router = inject(Router);

  protected readonly question = this.quiz.current;
  protected readonly chosen = this.quiz.chosen;
  protected readonly correct = this.quiz.isCorrect;
  protected readonly total = computed(() => this.quiz.queue().filter((q) => !q.retry).length);
  protected readonly number = computed(() => Math.min(this.quiz.index() + 1, this.total()));
  protected readonly score = computed(() => this.quiz.results().filter((r) => r.correct).length);
  protected readonly parts = computed(() => {
    const [before, after = ''] = (this.question()?.saetning ?? '').split(GAP);
    return { before, after };
  });

  ngOnInit(): void {
    if (!this.quiz.active()) void this.router.navigate(['/']);
  }

  protected readonly dontKnowAnswer = DONT_KNOW;
  protected readonly dontKnow = computed(() => this.chosen() === DONT_KNOW);
  /** "Ved ikke" shows the answer without "Forkert". */
  protected readonly verdict = computed(() => {
    const answer = `“${this.question()?.expression.praeposition}”`;
    if (this.correct()) return 'Rigtigt!';
    return this.dontKnow() ? `The answer is ${answer}` : `Forkert — the answer is ${answer}`;
  });

  protected answer(option: string): void {
    this.quiz.answer(option);
  }

  protected next(): void {
    this.quiz.next();
    if (this.quiz.finished()) void this.router.navigate(['/summary']);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const q = this.question();
    if (!q || event.ctrlKey || event.altKey || event.metaKey) return;
    if (this.chosen() === null) {
      if (event.key === '0') return this.answer(DONT_KNOW);
      const i = Number(event.key) - 1;
      if (i >= 0 && i < q.options.length) this.answer(q.options[i]);
    } else if (event.key === 'Enter') {
      event.preventDefault(); // avoid also "clicking" the focused button
      this.next();
    }
  }
}
