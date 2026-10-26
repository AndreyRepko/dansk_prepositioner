import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ExpressionService } from './services/expression.service';
import { QuizService } from './services/quiz.service';
import { UserService } from './services/user.service';
import { ShareDialog } from './share/share-dialog';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ShareDialog],
  selector: 'app-root',
  host: { '(document:visibilitychange)': 'onVisibilityChange()' },
  template: `
    <header class="top">
      <a routerLink="/" class="brand">Præpositioner</a>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Practice</a>
        <a routerLink="/stats" routerLinkActive="active">Statistics</a>
        <button class="share" (click)="share.open()">Share</button>
        @if (user(); as account) {
          <span class="user">
            {{ account.name }} · <a routerLink="/who" class="switch">switch</a> ·
            <button class="link sign-out" (click)="signOut()">sign out</button>
          </span>
        } @else {
          <span class="user">Guest · <a routerLink="/who" class="switch">sign in</a></span>
        }
      </nav>
    </header>
    <app-share-dialog #share />
    <main>
      @if (expressions().length === 0) {
        <div class="card error">
          <p>Could not load the expressions.</p>
          <button (click)="retry()">Retry</button>
        </div>
      } @else if (loadError()) {
        <div class="card error">
          @if (user(); as account) {
            <p>Could not load the saved progress for {{ account.name }}.</p>
          } @else {
            <p>Could not load the progress saved in this browser.</p>
          }
          <div class="actions">
            <button (click)="retry()">Retry</button>
            @if (user()) {
              <button (click)="signOut()">Continue as guest</button>
            }
          </div>
        </div>
      } @else if (loading()) {
        <p class="card muted">Loading progress…</p>
      } @else {
        @if (saveError()) {
          <p class="card warning">Progress is not being saved.</p>
        }
        @if (!user() && needsPassword(); as name) {
          <p class="card notice">
            Progress saved under a name now needs a password.
            <a routerLink="/who" [queryParams]="{ name }">Sign in as {{ name }}</a> with a password
            of your choice to keep it yours.
          </p>
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
    nav .share,
    nav .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--muted);
    }
    nav .sign-out {
      color: var(--accent);
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
  private readonly users = inject(UserService);
  protected readonly user = this.users.current;
  /** A name used before passwords existed (its server progress waits for a password). */
  protected readonly needsPassword = computed(() => this.users.known().find((u) => !u.hash)?.name ?? null);
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

  protected signOut(): void {
    this.quiz.signOut().catch((e) => console.error(e)); // shown by loadError
    void this.router.navigate(['/']);
  }
}
