import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { emptyProgress } from '../models/progress';
import { ExpressionService } from '../services/expression.service';
import { ProgressStore } from '../services/progress-store';
import { QuizService } from '../services/quiz.service';
import { testExpression } from '../testing/fixtures';
import { HomePage } from './home';

describe('HomePage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        { provide: ProgressStore, useValue: { load: async () => emptyProgress(), save: async () => {} } },
        {
          provide: ExpressionService,
          useValue: { expressions: () => [testExpression(1, { kategori: 'sted' }), testExpression(2, { kategori: 'tid' })] },
        },
      ],
    });
  });

  async function selects() {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const [size, category] = (fixture.nativeElement as HTMLElement).querySelectorAll('select');
    return { size, category };
  }

  it('shows the default settings in the selects', async () => {
    const { size, category } = await selects();
    expect(size.value).toBe('10');
    expect(category.value).toBe('');
  });

  it('shows settings kept from an earlier session', async () => {
    TestBed.inject(QuizService).settings.set({ size: 20, category: 'tid' });
    const { size, category } = await selects();
    expect(size.value).toBe('20');
    expect(category.value).toBe('tid');
  });
});
