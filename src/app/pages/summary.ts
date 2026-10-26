import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GAP } from '../models/expression';
import { QuizService } from '../services/quiz.service';
import { percent } from '../services/stats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-summary',
  imports: [RouterLink],
  template: `
    <h1>Result</h1>
    <section class="card score">
      <strong>{{ correct() }} / {{ results().length }}</strong>
      <span class="muted">{{ pct() }}% right on the first try</span>
    </section>

    @if (mistakes().length > 0) {
      <h2>Mistakes</h2>
      @for (m of mistakes(); track m.expression.id) {
        <section class="card mistake">
          <p class="sentence">{{ fill(m.expression.saetning, m.expression.praeposition) }}</p>
          <p>
            <strong>{{ m.expression.udtryk }}</strong> — {{ m.expression.forklaring }}
            <span class="muted">(you chose “{{ m.chosen }}”)</span>
          </p>
          <p class="muted">{{ m.expression.ukrainsk }}</p>
          <p class="muted">{{ m.expression.engelsk }}</p>
        </section>
      }
    } @else {
      <p>Everything right — flot!</p>
    }

    <div class="actions">
      <button class="primary" (click)="again()">Practice again</button>
      <a class="button" routerLink="/">Home</a>
      <a class="button" routerLink="/stats">Statistics</a>
    </div>
  `,
  styles: `
    .score {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .score strong {
      font-size: 2rem;
    }
    .mistake p {
      margin: 0.2rem 0;
    }
    .sentence {
      font-size: 1.1rem;
    }
  `,
})
export class SummaryPage implements OnInit {
  private readonly quiz = inject(QuizService);
  private readonly router = inject(Router);

  protected readonly results = this.quiz.results;
  protected readonly correct = computed(() => this.results().filter((r) => r.correct).length);
  protected readonly mistakes = computed(() => this.results().filter((r) => !r.correct));
  protected readonly pct = computed(() => percent(this.correct(), this.results().length));

  ngOnInit(): void {
    if (!this.quiz.finished()) void this.router.navigate(['/']);
  }

  protected fill(sentence: string, answer: string): string {
    return sentence.replace(GAP, answer.toUpperCase());
  }

  protected again(): void {
    if (this.quiz.start(this.quiz.settings()) > 0) void this.router.navigate(['/quiz']);
  }
}
