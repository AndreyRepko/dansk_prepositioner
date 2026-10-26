import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { emptyProgress } from './models/progress';
import { ExpressionService } from './services/expression.service';
import { ProgressStore } from './services/progress-store';
import { QuizService } from './services/quiz.service';
import { UserService } from './services/user.service';
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

  it('shows the current name with a switch link, and only Share without a name', async () => {
    localStorage.clear();
    TestBed.inject(ExpressionService).expressions.set([testExpression(1)]);
    let el = await render();
    expect(el.querySelectorAll('nav a').length).toBe(0);
    expect(el.querySelector('nav .share')).toBeTruthy();

    TestBed.inject(UserService).select('Andrii');
    el = await render();
    expect(el.querySelector('.user')?.textContent).toContain('Andrii');
    expect(el.querySelector('a.switch')?.getAttribute('href')).toBe('/who');
  });

  it('shows a loading card while progress is fetched', async () => {
    TestBed.inject(ExpressionService).expressions.set([testExpression(1)]);
    TestBed.inject(QuizService).loading.set(true);
    const el = await render();
    expect(el.textContent).toContain('Loading progress');
    expect(el.querySelector('router-outlet')).toBeNull();
  });

  it('offers another name when progress could not be loaded', async () => {
    TestBed.inject(ExpressionService).expressions.set([testExpression(1)]);
    TestBed.inject(UserService).select('Andrii');
    TestBed.inject(QuizService).loadError.set(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const el = await render();

    const other = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('another name'))!;
    other.click();
    expect(TestBed.inject(UserService).current()).toBeNull();
    expect(TestBed.inject(QuizService).loadError()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/who']);
  });
});
