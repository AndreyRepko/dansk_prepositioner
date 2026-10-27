import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DONT_KNOW } from '../models/expression';
import { emptyProgress } from '../models/progress';
import { ExpressionService } from '../services/expression.service';
import { ProgressStore } from '../services/progress-store';
import { QuizService } from '../services/quiz.service';
import { testExpression } from '../testing/fixtures';
import { SummaryPage } from './summary';

describe('SummaryPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SummaryPage],
      providers: [
        provideRouter([]),
        { provide: ProgressStore, useValue: { load: async () => emptyProgress(), save: async () => {} } },
        { provide: ExpressionService, useValue: { expressions: () => [] } },
      ],
    });
  });

  it('shows the chosen option of a mistake, and "(ved ikke)" for "Ved ikke"', async () => {
    const quiz = TestBed.inject(QuizService);
    const [one, two, three] = [1, 2, 3].map((id) => testExpression(id));
    quiz.results.set([
      { expression: one, saetning: one.saetning, chosen: 'i', correct: false },
      { expression: two, saetning: two.saetning, chosen: DONT_KNOW, correct: false },
      { expression: three, saetning: three.saetning, chosen: 'på', correct: true },
    ]);
    quiz.finished.set(true);

    const fixture = TestBed.createComponent(SummaryPage);
    await fixture.whenStable();
    const mistakes = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.mistake')];

    expect(mistakes.length).toBe(2);
    expect(mistakes[0].textContent).toContain('(you chose “i”)');
    expect(mistakes[1].textContent).toContain('(ved ikke)');
    expect(mistakes[1].textContent).not.toContain('you chose');
  });
});
