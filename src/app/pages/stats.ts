import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ExpressionService } from '../services/expression.service';
import { QuizService } from '../services/quiz.service';
import {
  byCategory,
  confusions,
  familiarMuchBetter,
  hardest,
  overview,
  percent,
  recognitionGap,
  sentenceBound,
  totals,
} from '../services/stats';

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
      @if (ov().mastered > 0) {
        <p>
          Of the mastered, right in 4 / 5 / all 6 different sentences:
          ★ <strong>{{ ov().tiers[0] }}</strong> · ★★ <strong>{{ ov().tiers[1] }}</strong> ·
          ★★★ <strong>{{ ov().tiers[2] }}</strong>
        </p>
      }
      <p>
        Answers: <strong>{{ all().answers }}</strong>, accuracy
        <strong>{{ pct(all().correct, all().answers) }}%</strong>, sessions:
        <strong>{{ progress().sessions.length }}</strong>
      </p>
      @if (all().dontKnow > 0) {
        <p class="muted">“Ved ikke” {{ all().dontKnow }} times (counted as wrong).</p>
      }
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

    <h2>New vs. familiar sentences</h2>
    <section class="card">
      @if (gap().newSeen === 0) {
        <p class="muted">No answers since sentences were counted.</p>
      } @else {
        <p>
          Sentences seen for the first time: <strong>{{ pct(gap().newCorrect, gap().newSeen) }}%</strong>
          right ({{ gap().newSeen }}) · seen before:
          <strong>{{ gap().repeatSeen ? pct(gap().repeatCorrect, gap().repeatSeen) + '%' : '–' }}</strong>
          right ({{ gap().repeatSeen }})
        </p>
        @if (bigGap()) {
          <p class="muted">
            Much better on familiar sentences: you may remember the sentences rather than the
            expressions.
          </p>
        }
        @if (bound().length > 0) {
          <table>
            <thead>
              <tr><th>Better in familiar sentences</th><th class="num">New</th><th class="num">Seen before</th></tr>
            </thead>
            <tbody>
              @for (b of bound(); track b.expression.id) {
                <tr>
                  <td>{{ b.expression.udtryk }}</td>
                  <td class="num">{{ b.newCorrect }} / {{ b.newSeen }}</td>
                  <td class="num">{{ b.repeatCorrect }} / {{ b.repeatSeen }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>

    <h2>Common mix-ups</h2>
    <section class="card">
      @if (mixUps().length === 0) {
        <p class="muted">No mistakes yet.</p>
      } @else {
        <table>
          <thead>
            <tr><th>Chose instead of</th><th class="num">Times</th></tr>
          </thead>
          <tbody>
            @for (c of mixUps(); track c.answer + '|' + c.chosen) {
              <tr>
                <td>
                  <strong>{{ c.chosen }}</strong> instead of <strong>{{ c.answer }}</strong><br />
                  <span class="muted">{{ examples(c.examples) }}</span>
                </td>
                <td class="num">{{ c.count }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    <h2>Hardest expressions</h2>
    <section class="card">
      @if (hard().length === 0) {
        <p class="muted">No mistakes yet.</p>
      } @else {
        <table>
          <thead>
            <tr><th>Expression</th><th class="num">Sentences</th><th class="num">Right</th><th class="num">Wrong</th></tr>
          </thead>
          <tbody>
            @for (h of hard(); track h.expression.id) {
              <tr>
                <td>{{ h.expression.udtryk }}<br /><span class="muted">{{ h.expression.ukrainsk }}</span><br /><span class="muted">{{ h.expression.engelsk }}</span></td>
                <td class="num">{{ h.known }} / {{ h.sentences }}{{ stars(h.tier) }}</td>
                <td class="num">{{ h.correct }}</td>
                <td class="num">
                  {{ h.wrong }}
                  @if (h.dontKnow > 0) {
                    <br /><span class="muted">{{ h.dontKnow }} ved ikke</span>
                  }
                </td>
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
  protected readonly gap = computed(() => recognitionGap(this.expressions(), this.progress()));
  protected readonly bigGap = computed(() => familiarMuchBetter(this.gap()));
  protected readonly bound = computed(() => sentenceBound(this.expressions(), this.progress(), 10));
  protected readonly mixUps = computed(() => confusions(this.expressions(), this.progress(), 8));
  protected readonly sessions = computed(() => this.progress().sessions.slice(-10).reverse());
  protected readonly pct = percent;

  protected stars(tier: number): string {
    return tier > 0 ? ' ' + '★'.repeat(tier) : '';
  }

  protected examples(list: { udtryk: string }[]): string {
    return list.map((e) => e.udtryk).join(', ');
  }

  protected reset(): void {
    if (confirm('Delete all progress and statistics?')) void this.quiz.resetProgress();
  }
}
