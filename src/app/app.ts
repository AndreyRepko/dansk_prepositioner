import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ExpressionService } from './services/expression.service';
import { QuizService } from './services/quiz.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  template: `
    <header class="top">
      <a routerLink="/" class="brand">Præpositioner</a>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Practice</a>
        <a routerLink="/stats" routerLinkActive="active">Statistics</a>
      </nav>
    </header>
    <main>
      @if (expressions().length === 0 || loadError()) {
        <div class="card error">
          <p>Could not load the expressions or your saved progress.</p>
          <button (click)="retry()">Retry</button>
        </div>
      } @else {
        @if (saveError()) {
          <p class="card warning">Progress is not being saved in this browser.</p>
        }
        <router-outlet />
      }
    </main>
  `,
  styles: `
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      max-width: 720px;
      margin: 0 auto;
      padding: 1rem;
    }
    .brand {
      font-weight: 700;
      font-size: 1.15rem;
      color: var(--text);
      text-decoration: none;
    }
    nav {
      display: flex;
      gap: 1rem;
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
    }
    nav a.active {
      color: var(--accent);
      font-weight: 600;
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 0 1rem 2rem;
    }
  `,
})
export class App {
  private readonly quiz = inject(QuizService);
  protected readonly expressions = inject(ExpressionService).expressions;
  protected readonly loadError = this.quiz.loadError;
  protected readonly saveError = this.quiz.saveError;

  protected retry(): void {
    this.quiz.init().catch((e) => console.error(e));
  }
}
