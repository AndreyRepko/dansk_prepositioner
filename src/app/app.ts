import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ExpressionService } from './services/expression.service';
import { QuizService } from './services/quiz.service';
import { UserService } from './services/user.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  host: { '(document:visibilitychange)': 'onVisibilityChange()' },
  template: `
    <header class="top">
      <a routerLink="/" class="brand">Præpositioner</a>
      @if (user(); as name) {
        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Practice</a>
          <a routerLink="/stats" routerLinkActive="active">Statistics</a>
          <span class="user">{{ name }} · <a routerLink="/who" class="switch">switch</a></span>
        </nav>
      }
    </header>
    <main>
      @if (expressions().length === 0) {
        <div class="card error">
          <p>Could not load the expressions.</p>
          <button (click)="retry()">Retry</button>
        </div>
      } @else if (loadError()) {
        <div class="card error">
          <p>Could not load the saved progress for {{ user() }}.</p>
          <div class="actions">
            <button (click)="retry()">Retry</button>
            <button (click)="otherName()">Use another name</button>
          </div>
        </div>
      } @else if (loading()) {
        <p class="card muted">Loading progress…</p>
      } @else {
        @if (saveError()) {
          <p class="card warning">Progress is not being saved.</p>
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
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.25rem 1rem;
    }
    .user {
      color: var(--text);
    }
    nav a.switch {
      color: var(--accent);
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
  private readonly router = inject(Router);
  protected readonly expressions = inject(ExpressionService).expressions;
  protected readonly user = inject(UserService).current;
  protected readonly loading = this.quiz.loading;
  protected readonly loadError = this.quiz.loadError;
  protected readonly saveError = this.quiz.saveError;

  protected retry(): void {
    this.quiz.init().catch((e) => console.error(e));
  }

  /** Picks up practice done on another device while this tab was in the background. */
  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible') void this.quiz.refresh();
  }

  protected otherName(): void {
    this.quiz.signOut();
    void this.router.navigate(['/who']);
  }
}
