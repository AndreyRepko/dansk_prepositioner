import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { InsecureContextError } from '../services/password-hash';
import { Account, ConflictError } from '../services/progress-store';
import { QuizService, SignInResult } from '../services/quiz.service';
import { cleanName, MAX_NAME_LENGTH, nameKey } from '../services/user-name';
import { KnownUser, UserService } from '../services/user.service';

type Problem =
  | 'invalid-name'
  | 'no-password'
  | 'unknown'
  | 'wrong-password'
  | 'offline'
  | 'conflict'
  | 'insecure'
  | 'failed';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-who',
  template: `
    <h1>Sign in</h1>

    @if (users.known().length > 0) {
      <section class="card">
        <p class="muted">Used in this browser:</p>
        <ul class="known">
          @for (user of users.known(); track user.name) {
            <li>
              <button
                class="name"
                [class.primary]="isCurrent(user)"
                [disabled]="busy()"
                (click)="choose(user)"
              >
                {{ user.name }}
              </button>
              <button
                class="forget"
                [attr.aria-label]="'Remove ' + user.name + ' from this list'"
                [disabled]="busy()"
                (click)="forget(user.name)"
              >
                ×
              </button>
            </li>
          }
        </ul>
      </section>
    }

    <form class="card" (submit)="submit($event)">
      <label for="name">Name</label>
      <input
        #nameInput
        id="name"
        name="username"
        autocomplete="username"
        [maxLength]="maxLength"
        [value]="name()"
        (input)="edited(nameInput.value, password())"
      />
      <label for="password">Password</label>
      <div class="row">
        <input
          #passwordInput
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          [value]="password()"
          (input)="edited(name(), passwordInput.value)"
        />
        <button class="primary" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </div>

      @switch (problem()) {
        @case ('invalid-name') {
          <p class="error">Use 1–{{ maxLength }} letters, digits, spaces or . _ ' -</p>
        }
        @case ('no-password') {
          <p class="error">Type a password — any password will do.</p>
        }
        @case ('wrong-password') {
          <p class="error">Wrong password for {{ name() }} — or choose another name.</p>
        }
        @case ('offline') {
          <p class="error">Could not reach the server. Your progress is unchanged; try again.</p>
        }
        @case ('conflict') {
          <p class="error">{{ name() }} was just set up on another device. Try again.</p>
        }
        @case ('insecure') {
          <p class="error">
            Signing in needs a secure (https) page. Open the app over https or on localhost.
          </p>
        }
        @case ('failed') {
          <p class="error">
            Something went wrong on the server. Your progress is unchanged; try again later.
          </p>
        }
        @case ('unknown') {
          <div class="create">
            <p>No account “{{ name() }}” yet.</p>
            <button class="primary" type="button" [disabled]="busy()" (click)="signIn(true)">Create account</button>
          </div>
        }
      }

      <p class="muted small">
        New here? Pick a name and a password of your choice. The password only keeps someone else
        from using your name by mistake. Sign in with the same name and password on your phone and
        laptop to share progress.
        @if (guestPractised() > 0) {
          The {{ guestPractised() }} expressions you practised as guest are added to the account.
        }
      </p>
    </form>
  `,
  styles: `
    .known {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .known li {
      display: flex;
    }
    .known .name {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    .known .forget {
      border-left: none;
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      color: var(--muted);
      padding: 0.6rem 0.7rem;
    }
    label {
      display: block;
      margin: 0.75rem 0 0.5rem;
    }
    label:first-child {
      margin-top: 0;
    }
    .row {
      display: flex;
      gap: 0.5rem;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      flex: 1;
      min-width: 0;
      font: inherit;
      padding: 0.55rem 0.7rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
    }
    .create {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      margin: 1rem 0;
    }
    .create p {
      margin: 0;
    }
    .small {
      font-size: 0.9rem;
      margin-bottom: 0;
    }
  `,
})
export class WhoPage {
  private readonly quiz = inject(QuizService);
  private readonly router = inject(Router);
  protected readonly users = inject(UserService);
  protected readonly maxLength = MAX_NAME_LENGTH;
  private readonly passwordInput = viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');

  protected readonly name = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('name') ?? '');
  protected readonly password = signal('');
  protected readonly problem = signal<Problem | null>(null);
  protected readonly busy = signal(false);
  /** Shown only for a guest: their progress moves into the account. */
  protected readonly guestPractised = computed(() =>
    this.users.current() ? 0 : Object.keys(this.quiz.progress().items).length,
  );

  protected isCurrent(user: KnownUser): boolean {
    const current = this.users.current();
    return !!current && nameKey(current.name) === nameKey(user.name);
  }

  protected edited(name: string, password: string): void {
    this.name.set(name);
    this.password.set(password);
    this.problem.set(null);
  }

  protected forget(name: string): void {
    this.quiz.forget(name).catch((e) => console.error(e)); // shown by loadError
  }

  protected submit(event: Event): void {
    event.preventDefault();
    void this.signIn(false);
  }

  /** One tap for a remembered account; a name from before passwords needs one typed first. */
  protected choose(user: KnownUser): void {
    this.edited(user.name, '');
    if (user.hash) {
      // Remembered accounts exist; if the server lost one, it is simply made again.
      void this.run(() => this.quiz.signInAs(user as Account, true));
      return;
    }
    this.passwordInput().nativeElement.focus();
  }

  protected async signIn(create: boolean): Promise<void> {
    if (!cleanName(this.name())) return this.problem.set('invalid-name');
    if (!this.password()) return this.problem.set('no-password');
    await this.run(async () => (await this.quiz.signIn(this.name(), this.password(), create))!);
  }

  private async run(signIn: () => Promise<SignInResult>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.problem.set(null);
    try {
      const result = await signIn();
      if (result === 'ok') {
        void this.router.navigate(['/']);
        return;
      }
      if (result !== 'superseded') this.problem.set(result);
    } catch (e) {
      console.error(e);
      this.problem.set(problemFor(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function problemFor(error: unknown): Problem {
  if (error instanceof ConflictError) return 'conflict';
  if (error instanceof InsecureContextError) return 'insecure';
  if (error instanceof HttpErrorResponse && error.status === 0) return 'offline';
  return 'failed';
}
