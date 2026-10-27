import { emptyProgress, ProgressState, SentenceProgress } from '../models/progress';
import { testExpression, testProgress } from '../testing/fixtures';
import {
  byCategory,
  confusions,
  hardest,
  overview,
  percent,
  recognitionGap,
  sentenceBound,
  totals,
} from './stats';

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
    expect(overview(all, state, NOW)).toEqual({
      total: 4,
      fresh: 1,
      learning: 2,
      mastered: 1,
      dueNow: 1,
      tiers: [0, 0, 0],
    });
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

  const sentence = (seen: number, correct: number, first: boolean, last = true): SentenceProgress => ({
    seen,
    correct,
    lastSeen: 0,
    first,
    last,
  });

  it('counts mastered items per tier', () => {
    const known = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, sentence(1, 1, true)]));
    const three = [1, 2, 3].map((id) => testExpression(id)); // 3 sentences each
    const s: ProgressState = {
      ...emptyProgress(),
      items: {
        1: testProgress({ box: 4, due: NOW + 1, sentences: known(3) }),
        2: testProgress({ box: 4, due: NOW + 1, sentences: known(2) }),
        3: testProgress({ box: 3, due: NOW + 1, sentences: known(3) }),
      },
    };
    expect(overview(three, s, NOW).tiers).toEqual([0, 0, 1]);
  });

  describe('new vs. familiar sentences', () => {
    const s: ProgressState = {
      ...emptyProgress(),
      items: {
        // wrong on both new sentences, right every time after
        1: testProgress({ sentences: { 0: sentence(3, 2, false), 1: sentence(2, 1, false) } }),
        // right on new sentences, one slip later
        2: testProgress({ sentences: { 0: sentence(3, 2, true), 1: sentence(1, 1, true) } }),
        // only one new sentence: too little to tell
        3: testProgress({ sentences: { 0: sentence(4, 3, false) } }),
      },
    };

    it('adds up first answers and later answers', () => {
      expect(recognitionGap(all, s)).toEqual({ newSeen: 5, newCorrect: 2, repeatSeen: 8, repeatCorrect: 7 });
    });

    it('lists expressions answered better on familiar sentences', () => {
      expect(sentenceBound(all, s, 10)).toEqual([
        { expression: all[0], newSeen: 2, newCorrect: 0, repeatSeen: 3, repeatCorrect: 3 },
      ]);
    });
  });

  it('adds up mix-ups per right answer and chosen option', () => {
    const list = [
      testExpression(1, { praeposition: 'i', udtryk: 'a' }),
      testExpression(2, { praeposition: 'i', udtryk: 'b' }),
      testExpression(3, { praeposition: 'på', udtryk: 'c' }),
    ];
    const s: ProgressState = {
      ...emptyProgress(),
      items: {
        1: testProgress({ confusions: { på: 1, til: 1 } }),
        2: testProgress({ confusions: { på: 3 } }),
        3: testProgress({ confusions: { i: 1 } }),
      },
    };
    expect(confusions(list, s, 2)).toEqual([
      { answer: 'i', chosen: 'på', count: 4, examples: [list[1], list[0]] },
      { answer: 'i', chosen: 'til', count: 1, examples: [list[0]] },
    ]);
  });

  it('computes percentages safely', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});
