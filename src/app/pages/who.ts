import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { QuizService } from '../services/quiz.service';
import { cleanName, MAX_NAME_LENGTH } from '../services/user-name';
import { UserService } from '../services/user.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-who',
  template: `
    <h1>Hvem øver?</h1>

    @if (users.known().length > 0) {
      <section class="card">
        <p class="muted">Used in this browser:</p>
        <ul class="known">
          @for (name of users.known(); track name) {
            <li>
              <button class="name" [class.primary]="name === users.current()" (click)="choose(name)">{{ name }}</button>
              <button class="forget" [attr.aria-label]="'Remove ' + name + ' from this list'" (click)="users.forget(name)">
                ×
              </button>
            </li>
          }
        </ul>
      </section>
    }

    <form class="card" (submit)="submit($event, input.value)">
      <label for="name">{{ users.known().length > 0 ? 'Or type a name' : 'Your name' }}</label>
      <div class="row">
        <input #input id="name" name="name" autocomplete="nickname" [maxLength]="maxLength" (input)="invalid.set(false)" />
        <button class="primary" type="submit">Start</button>
      </div>
      @if (invalid()) {
        <p class="error">Use 1–{{ maxLength }} letters, digits, spaces or . _ ' -</p>
      }
      <p class="muted small">
        No password: your progress is saved under this name, so use the same name on your phone and
        laptop. Anyone who types the same name shares that progress.
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
      margin-bottom: 0.5rem;
    }
    .row {
      display: flex;
      gap: 0.5rem;
    }
    input {
      flex: 1;
      min-width: 0;
      font: inherit;
      padding: 0.55rem 0.7rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
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
  protected readonly invalid = signal(false);

  protected submit(event: Event, value: string): void {
    event.preventDefault();
    this.choose(value);
  }

  protected choose(name: string): void {
    // Checked first: an invalid name must not send someone already signed in back to their own progress.
    if (!cleanName(name)) {
      this.invalid.set(true);
      return;
    }
    void this.quiz.switchUser(name).catch((e) => console.error(e)); // shown by the app shell (loadError)
    // Navigate right away; the shell shows "Loading…" until the progress arrives.
    void this.router.navigate(['/']);
  }
}
