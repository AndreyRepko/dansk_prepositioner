import { emptyProgress, ProgressState } from '../models/progress';
import { seededRng, testExpression, testProgress } from '../testing/fixtures';
import { Box } from '../models/progress';
import { applyAnswer, buildOptions, selectSession, shuffle } from './srs';

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('applyAnswer', () => {
  it('puts a new item answered correctly into box 2, due in a day', () => {
    const p = applyAnswer(undefined, true, NOW);
    expect(p).toEqual({ box: 2, seen: 1, correct: 1, wrong: 0, lastSeen: NOW, due: NOW + DAY });
  });

  it.each<[Box, Box, number]>([
    [0, 2, 1],
    [1, 2, 1],
    [2, 3, 3],
    [3, 4, 7],
    [4, 5, 21],
    [5, 5, 21],
  ])('moves a due item from box %i to box %i, due in %i days', (from, to, days) => {
    const p = applyAnswer(testProgress({ box: from, due: NOW }), true, NOW);
    expect(p.box).toBe(to);
    expect(p.due).toBe(NOW + days * DAY);
  });

  it('keeps box and due date when a not-yet-due item is answered correctly', () => {
    const p = applyAnswer(testProgress({ box: 2, seen: 1, correct: 1, due: NOW + DAY }), true, NOW);
    expect(p).toEqual({ box: 2, seen: 2, correct: 2, wrong: 0, lastSeen: NOW, due: NOW + DAY });
  });

  it('still demotes a not-yet-due item answered wrong', () => {
    const p = applyAnswer(testProgress({ box: 4, due: NOW + DAY }), false, NOW);
    expect(p).toEqual(expect.objectContaining({ box: 1, due: NOW }));
  });

  it('sends a wrong answer back to box 1, due immediately', () => {
    const p = applyAnswer(testProgress({ box: 4, seen: 5, correct: 5 }), false, NOW);
    expect(p).toEqual({ box: 1, seen: 6, correct: 5, wrong: 1, lastSeen: NOW, due: NOW });
  });

  it('moves a box-1 item to box 2 when answered correctly', () => {
    expect(applyAnswer(testProgress({ box: 1 }), true, NOW).box).toBe(2);
  });
});

describe('selectSession', () => {
  const ids = (list: { id: number }[]) => list.map((e) => e.id).sort((a, b) => a - b);

  function state(items: ProgressState['items']): ProgressState {
    return { ...emptyProgress(), items };
  }

  it('caps the session at the requested size', () => {
    const all = Array.from({ length: 30 }, (_, i) => testExpression(i + 1));
    expect(selectSession(all, emptyProgress(), 10, {}, NOW, seededRng()).length).toBe(10);
  });

  it('returns everything when the pool is smaller than the size', () => {
    const all = [testExpression(1), testExpression(2)];
    expect(selectSession(all, emptyProgress(), 10, {}, NOW, seededRng()).length).toBe(2);
  });

  it('prefers recent mistakes, then due items, then new items, then not-yet-due items', () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => testExpression(id));
    const s = state({
      1: testProgress({ box: 3, due: NOW + DAY }), // not due
      2: testProgress({ box: 1, due: NOW - 10 }), // mistake
      3: testProgress({ box: 2, due: NOW - 5 }), // due
      // 4..8 new
    });
    expect(ids(selectSession(all, s, 2, {}, NOW, seededRng()))).toEqual([2, 3]);
    expect(ids(selectSession(all, s, 7, {}, NOW, seededRng()))).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(ids(selectSession(all, s, 8, {}, NOW, seededRng()))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('orders recent mistakes by due date and other due items by box', () => {
    const all = [1, 2, 3, 4].map((id) => testExpression(id));
    const s = state({
      1: testProgress({ box: 1, due: NOW - 10 }),
      2: testProgress({ box: 1, due: NOW - 20 }),
      3: testProgress({ box: 4, due: NOW - 30 }),
      4: testProgress({ box: 2, due: NOW }), // due exactly now counts as due
    });
    expect(ids(selectSession(all, s, 1, {}, NOW, seededRng()))).toEqual([2]);
    expect(ids(selectSession(all, s, 3, {}, NOW, seededRng()))).toEqual([1, 2, 4]);
  });

  it('picks mine_fejl items first among new items', () => {
    const all = [
      testExpression(1),
      testExpression(2, { mine_fejl: true }),
      testExpression(3),
      testExpression(4, { mine_fejl: true }),
    ];
    expect(ids(selectSession(all, emptyProgress(), 2, {}, NOW, seededRng()))).toEqual([2, 4]);
  });

  it('fills with the least recently seen not-yet-due items', () => {
    const all = [1, 2, 3].map((id) => testExpression(id));
    const s = state({
      1: testProgress({ box: 4, due: NOW + DAY, lastSeen: NOW - 100 }),
      2: testProgress({ box: 4, due: NOW + DAY, lastSeen: NOW - 300 }),
      3: testProgress({ box: 4, due: NOW + DAY, lastSeen: NOW - 200 }),
    });
    expect(ids(selectSession(all, s, 2, {}, NOW, seededRng()))).toEqual([2, 3]);
  });

  it('applies the category and mine_fejl filters', () => {
    const all = [
      testExpression(1, { kategori: 'tid' }),
      testExpression(2, { kategori: 'tid', mine_fejl: true }),
      testExpression(3, { kategori: 'sted', mine_fejl: true }),
    ];
    expect(ids(selectSession(all, emptyProgress(), 10, { category: 'tid' }, NOW))).toEqual([1, 2]);
    expect(ids(selectSession(all, emptyProgress(), 10, { onlyMineFejl: true }, NOW))).toEqual([2, 3]);
    expect(
      ids(selectSession(all, emptyProgress(), 10, { category: 'tid', onlyMineFejl: true }, NOW)),
    ).toEqual([2]);
  });
});

describe('buildOptions', () => {
  it('contains the answer and all wrong options exactly once', () => {
    const options = buildOptions(testExpression(1), seededRng(7));
    expect([...options].sort()).toEqual(['i', 'om', 'på', 'til']);
  });
});

describe('shuffle', () => {
  it('is deterministic with a seeded rng and keeps all elements', () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRng(3));
    const b = shuffle([1, 2, 3, 4, 5], seededRng(3));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
