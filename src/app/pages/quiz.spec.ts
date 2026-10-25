import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
    expect(el.querySelector('.sentence')?.textContent).toContain('Sætning 1 ___ slut.');
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
