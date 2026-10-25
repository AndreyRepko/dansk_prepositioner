import { emptyProgress, ProgressState } from '../models/progress';
import { testExpression, testProgress } from '../testing/fixtures';
import { byCategory, hardest, overview, percent, totals } from './stats';

const NOW = 1_000;

describe('stats', () => {
  const all = [
    testExpression(1, { kategori: 'tid' }),
    testExpression(2, { kategori: 'tid' }),
    testExpression(3, { kategori: 'sted' }),
    testExpression(4, { kategori: 'sted' }),
  ];
  const state: ProgressState = {
    ...emptyProgress(),
    items: {
      1: testProgress({ box: 4, seen: 3, correct: 3, due: NOW + 1 }),
      2: testProgress({ box: 1, seen: 3, correct: 1, wrong: 2, due: NOW }),
      3: testProgress({ box: 2, seen: 2, correct: 1, wrong: 1, due: NOW + 1 }),
    },
  };

  it('counts new, learning, mastered and due items', () => {
    expect(overview(all, state, NOW)).toEqual({ total: 4, fresh: 1, learning: 2, mastered: 1, dueNow: 1 });
  });

  it('aggregates per category', () => {
    expect(byCategory(all, state)).toEqual([
      { category: 'tid', total: 2, mastered: 1, answers: 6, correct: 4 },
      { category: 'sted', total: 2, mastered: 0, answers: 2, correct: 1 },
    ]);
  });

  it('lists items with mistakes, most mistakes first', () => {
    expect(hardest(all, state, 10).map((h) => h.expression.id)).toEqual([2, 3]);
  });

  it('totals answers over current expressions only', () => {
    const withRemoved: ProgressState = { ...state, items: { ...state.items, 99: testProgress({ seen: 50, correct: 50 }) } };
    expect(totals(all, withRemoved)).toEqual({ answers: 8, correct: 5 });
  });

  it('computes percentages safely', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});
