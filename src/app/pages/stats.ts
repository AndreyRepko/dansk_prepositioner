import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ExpressionService } from '../services/expression.service';
import { QuizService } from '../services/quiz.service';
import { byCategory, hardest, overview, percent, totals } from '../services/stats';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-stats',
  imports: [DatePipe],
  template: `
    <h1>Statistics</h1>

    <section class="card">
      <p>
        <strong>{{ ov().mastered }}</strong> of {{ ov().total }} mastered,
        <strong>{{ ov().learning }}</strong> learning, <strong>{{ ov().fresh }}</strong> new.
      </p>
      <p>
        Answers: <strong>{{ all().answers }}</strong>, accuracy
        <strong>{{ pct(all().correct, all().answers) }}%</strong>, sessions:
        <strong>{{ progress().sessions.length }}</strong>
      </p>
    </section>

    <h2>By category</h2>
    <section class="card">
      <table>
        <thead>
          <tr><th>Category</th><th class="num">Mastered</th><th class="num">Accuracy</th></tr>
        </thead>
        <tbody>
          @for (c of categories(); track c.category) {
            <tr>
              <td>{{ c.category }}</td>
              <td class="num">{{ c.mastered }} / {{ c.total }}</td>
              <td class="num">{{ c.answers ? pct(c.correct, c.answers) + '%' : '–' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </section>

    <h2>Hardest expressions</h2>
    <section class="card">
      @if (hard().length === 0) {
        <p class="muted">No mistakes yet.</p>
      } @else {
        <table>
          <thead>
            <tr><th>Expression</th><th class="num">Right</th><th class="num">Wrong</th></tr>
          </thead>
          <tbody>
            @for (h of hard(); track h.expression.id) {
              <tr>
                <td>{{ h.expression.udtryk }}<br /><span class="muted">{{ h.expression.ukrainsk }}</span><br /><span class="muted">{{ h.expression.engelsk }}</span></td>
                <td class="num">{{ h.correct }}</td>
                <td class="num">{{ h.wrong }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    <h2>Recent sessions</h2>
    <section class="card">
      @if (sessions().length === 0) {
        <p class="muted">No sessions yet.</p>
      } @else {
        <table>
          <tbody>
            @for (s of sessions(); track s.date) {
              <tr>
                <td>{{ s.date | date: 'dd.MM.yyyy HH:mm' }}</td>
                <td class="num">{{ s.correct }} / {{ s.total }}</td>
                <td class="num">{{ pct(s.correct, s.total) }}%</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    <div class="actions">
      <button (click)="reset()">Reset all progress</button>
    </div>
  `,
})
export class StatsPage {
  private readonly quiz = inject(QuizService);
  private readonly expressions = inject(ExpressionService).expressions;

  protected readonly progress = this.quiz.progress;
  protected readonly ov = computed(() => overview(this.expressions(), this.progress(), this.quiz.now()));
  protected readonly all = computed(() => totals(this.expressions(), this.progress()));
  protected readonly categories = computed(() => byCategory(this.expressions(), this.progress()));
  protected readonly hard = computed(() => hardest(this.expressions(), this.progress(), 10));
  protected readonly sessions = computed(() => this.progress().sessions.slice(-10).reverse());
  protected readonly pct = percent;

  protected reset(): void {
    if (confirm('Delete all progress and statistics?')) void this.quiz.resetProgress();
  }
}
