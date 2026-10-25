import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { emptyProgress } from './models/progress';
import { ExpressionService } from './services/expression.service';
import { ProgressStore } from './services/progress-store';
import { QuizService } from './services/quiz.service';
import { testExpression } from './testing/fixtures';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ProgressStore, useValue: { load: async () => emptyProgress(), save: async () => {} } },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows an error card with a retry button when no expressions are loaded', async () => {
    const el = await render();
    expect(el.querySelector('.error')).toBeTruthy();
    expect(el.querySelector('.error button')?.textContent).toContain('Retry');
    expect(el.querySelector('router-outlet')).toBeNull();
  });

  it('renders the router outlet once expressions are loaded', async () => {
    TestBed.inject(ExpressionService).expressions.set([testExpression(1)]);
    const el = await render();
    expect(el.querySelector('.error')).toBeNull();
    expect(el.querySelector('.warning')).toBeNull();
    expect(el.querySelector('router-outlet')).toBeTruthy();
  });

  it('shows the error card when saved progress could not be loaded', async () => {
    TestBed.inject(ExpressionService).expressions.set([testExpression(1)]);
    TestBed.inject(QuizService).loadError.set(true);
    const el = await render();
    expect(el.querySelector('.error')).toBeTruthy();
    expect(el.querySelector('router-outlet')).toBeNull();
  });

  it('warns when progress is not being saved', async () => {
    TestBed.inject(ExpressionService).expressions.set([testExpression(1)]);
    TestBed.inject(QuizService).saveError.set(true);
    const el = await render();
    expect(el.querySelector('.warning')?.textContent).toContain('not being saved');
  });
});
