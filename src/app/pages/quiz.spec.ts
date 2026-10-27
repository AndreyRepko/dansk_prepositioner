import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DONT_KNOW } from '../models/expression';
import { emptyProgress } from '../models/progress';
import { ExpressionService } from '../services/expression.service';
import { ProgressStore } from '../services/progress-store';
import { QuizService } from '../services/quiz.service';
import { seededRng, testExpression } from '../testing/fixtures';
import { QuizPage } from './quiz';

describe('QuizPage', () => {
  let quiz: QuizService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [QuizPage],
      providers: [
        provideRouter([]),
        { provide: ProgressStore, useValue: { load: async () => emptyProgress(), save: async () => {} } },
        { provide: ExpressionService, useValue: { expressions: () => [testExpression(1)] } },
      ],
    });
    quiz = TestBed.inject(QuizService);
    quiz.rng = seededRng();
    quiz.start({ size: 1 });
  });

  async function render() {
    const fixture = TestBed.createComponent(QuizPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the sentence with a gap and four options', async () => {
    const { el } = await render();
    expect(el.querySelector('.sentence')?.textContent).toContain(quiz.current()!.saetning);
    expect(el.querySelectorAll('.options button').length).toBe(4);
  });

  it('answers with number keys and shows the explanation', async () => {
    const { fixture, el } = await render();
    const index = quiz.current()!.options.indexOf('på');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: String(index + 1) }));
    await fixture.whenStable();

    expect(quiz.isCorrect()).toBe(true);
    expect(el.querySelector('.sentence .gap')?.textContent?.trim()).toBe('på');
    expect(el.querySelector('.feedback')?.textContent).toContain('Rigtigt');
  });

  const key = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
    document.dispatchEvent(event);
    return event;
  };
  const keyFor = (option: string) => String(quiz.current()!.options.indexOf(option) + 1);

  it('ignores Enter before an answer and digits with modifier keys', async () => {
    await render();
    key('Enter');
    key(keyFor('på'), { ctrlKey: true });
    key(keyFor('på'), { altKey: true });
    key(keyFor('på'), { metaKey: true });
    key('0', { ctrlKey: true });
    key('5');
    expect(quiz.chosen()).toBeNull();
    expect(quiz.index()).toBe(0);
  });

  it('moves on with Enter after a wrong answer, preventing the default action', async () => {
    await render();
    key(keyFor('i'));
    const enter = key('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(quiz.index()).toBe(1);
    expect(quiz.current()?.retry).toBe(true);
  });

  it('answers "Ved ikke" with 0: shows the answer without marking it wrong, and retries it', async () => {
    const { fixture, el } = await render();
    key('0');
    await fixture.whenStable();

    expect(quiz.chosen()).toBe(DONT_KNOW);
    expect(quiz.isCorrect()).toBe(false);
    expect(el.querySelector('.sentence .gap')?.classList).not.toContain('bad');
    expect(el.querySelector('.feedback')?.textContent).toContain('The answer is “på”');
    expect(el.querySelector('.feedback')?.textContent).not.toContain('Forkert');
    expect(el.querySelector('.feedback')?.classList).not.toContain('bad');
    expect(el.querySelector('.options button.good')?.textContent).toContain('på');
    expect(el.querySelector('.options button.bad')).toBeNull();
    expect(quiz.queue().at(-1)?.retry).toBe(true);
  });

  it('answers "Ved ikke" with its button', async () => {
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.dont-know')!.click();
    await fixture.whenStable();
    expect(quiz.chosen()).toBe(DONT_KNOW);
    const button = el.querySelector<HTMLButtonElement>('.dont-know')!;
    expect(button.disabled).toBe(true);
    expect(button.classList).toContain('chosen');
  });

  it('navigates to the summary after the last question', async () => {
    await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    key(keyFor('på'));
    key('Enter');
    expect(quiz.finished()).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/summary']);
  });

  it('marks a wrong click and reveals the right answer', async () => {
    const { fixture, el } = await render();
    const wrong = [...el.querySelectorAll<HTMLButtonElement>('.options button')].find(
      (b) => !b.textContent?.includes('på'),
    )!;
    wrong.click();
    await fixture.whenStable();

    expect(wrong.classList).toContain('bad');
    expect(el.querySelector('.options button.good')?.textContent).toContain('på');
    expect(el.querySelector('.feedback')?.textContent).toContain('Forkert');
  });
});
