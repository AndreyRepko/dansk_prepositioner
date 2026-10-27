import { DONT_KNOW } from '../models/expression';
import { emptyProgress, ProgressState, SentenceProgress } from '../models/progress';
import { seededRng, testExpression, testProgress } from '../testing/fixtures';
import { Box } from '../models/progress';
import {
  applyAnswer,
  buildOptions,
  knownSentences,
  otherSentence,
  pickSentence,
  selectSession,
  shuffle,
  tier,
} from './srs';

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const sentence = (overrides: Partial<SentenceProgress> = {}): SentenceProgress => ({
  seen: 1,
  correct: 1,
  lastSeen: 0,
  first: true,
  last: true,
  ...overrides,
});

/** Sentences 0..n-1 answered right once. */
const knownUpTo = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, sentence()]));

describe('applyAnswer', () => {
  it('puts a new item answered correctly into box 2, due in a day', () => {
    const p = applyAnswer(undefined, true, NOW);
    expect(p).toEqual({
      box: 2,
      seen: 1,
      correct: 1,
      wrong: 0,
      lastSeen: NOW,
      due: NOW + DAY,
      sentences: { 0: sentence({ lastSeen: NOW }) },
    });
  });

  it.each<[Box, Box, number]>([
    [0, 2, 1],
    [1, 2, 1],
    [2, 3, 3],
    [3, 4, 7],
    [4, 5, 21],
    [5, 5, 21],
  ])('moves a due item from box %i to box %i, due in %i days', (from, to, days) => {
    const p = applyAnswer(testProgress({ box: from, due: NOW, sentences: knownUpTo(2) }), true, NOW, 2);
    expect(p.box).toBe(to);
    expect(p.due).toBe(NOW + days * DAY);
  });

  it('keeps box and due date when a not-yet-due item is answered correctly', () => {
    const p = applyAnswer(testProgress({ box: 2, seen: 1, correct: 1, due: NOW + DAY }), true, NOW);
    expect(p).toEqual(
      expect.objectContaining({ box: 2, seen: 2, correct: 2, wrong: 0, lastSeen: NOW, due: NOW + DAY }),
    );
  });

  it('still demotes a not-yet-due item answered wrong', () => {
    const p = applyAnswer(testProgress({ box: 4, due: NOW + DAY }), false, NOW);
    expect(p).toEqual(expect.objectContaining({ box: 1, due: NOW }));
  });

  it('sends a wrong answer back to box 1, due immediately', () => {
    const p = applyAnswer(testProgress({ box: 4, seen: 5, correct: 5 }), false, NOW);
    expect(p).toEqual(
      expect.objectContaining({ box: 1, seen: 6, correct: 5, wrong: 1, lastSeen: NOW, due: NOW }),
    );
  });

  it('records each sentence: the first answer stays, the latest one counts as known', () => {
    let p = applyAnswer(undefined, false, NOW, 1, 'i');
    p = applyAnswer(p, true, NOW + 1, 1);
    p = applyAnswer(p, true, NOW + 2, 0);
    expect(p.sentences).toEqual({
      0: sentence({ lastSeen: NOW + 2 }),
      1: sentence({ seen: 2, correct: 1, lastSeen: NOW + 1, first: false, last: true }),
    });
    expect(knownSentences(applyAnswer(p, false, NOW + 3, 0, 'til'))).toBe(1);
  });

  it('counts "Ved ikke" as wrong, but not as a mix-up', () => {
    let p = applyAnswer(testProgress({ box: 3, due: NOW, seen: 2, correct: 2 }), false, NOW, 1, DONT_KNOW);
    p = applyAnswer(p, false, NOW, 2, DONT_KNOW);
    expect(p).toEqual(expect.objectContaining({ box: 1, seen: 4, correct: 2, wrong: 2, dontKnow: 2 }));
    expect(p.confusions).toBeUndefined();
    expect(p.sentences?.[1]).toEqual(expect.objectContaining({ first: false, last: false }));
  });

  it('counts the wrong options chosen', () => {
    let p = applyAnswer(undefined, false, NOW, 0, 'i');
    p = applyAnswer(p, false, NOW, 1, 'i');
    p = applyAnswer(p, false, NOW, 0, 'til');
    p = applyAnswer(p, true, NOW, 2, 'på');
    expect(p.confusions).toEqual({ i: 2, til: 1 });
  });

  it('keeps an item below mastered until 3 different sentences are known', () => {
    const due = { box: 3 as Box, due: NOW };
    expect(applyAnswer(testProgress({ ...due, sentences: knownUpTo(1) }), true, NOW, 0)).toEqual(
      expect.objectContaining({ box: 3, due: NOW + 3 * DAY }),
    );
    expect(applyAnswer(testProgress({ ...due, sentences: knownUpTo(1) }), true, NOW, 1).box).toBe(3);
    expect(applyAnswer(testProgress({ ...due, sentences: knownUpTo(2) }), true, NOW, 2).box).toBe(4);
  });

  it('does not demote an item mastered before sentences were counted', () => {
    expect(applyAnswer(testProgress({ box: 4, due: NOW }), true, NOW, 1)).toEqual(
      expect.objectContaining({ box: 4, due: NOW + 7 * DAY }),
    );
    expect(applyAnswer(testProgress({ box: 5, due: NOW }), true, NOW, 1)).toEqual(
      expect.objectContaining({ box: 5, due: NOW + 21 * DAY }),
    );
  });

  it('holds an item mastered before sentences were counted at box 3 once it slips', () => {
    let p = applyAnswer(testProgress({ box: 4, due: NOW }), false, NOW, 1);
    expect(p.box).toBe(1);
    for (const step of [1, 2, 3, 4]) p = applyAnswer(p, true, NOW + step * 30 * DAY, 1);
    expect(p.box).toBe(3);
  });

  it('counts answers given before sentences were counted as answers on sentence 0', () => {
    const legacy = testProgress({ box: 3, seen: 5, correct: 4, wrong: 1, due: NOW });
    expect(applyAnswer(legacy, true, NOW, 0).sentences).toEqual({
      0: sentence({ seen: 6, correct: 5, lastSeen: NOW, first: true, last: true }),
    });
    const elsewhere = applyAnswer(legacy, false, NOW, 2, 'i');
    expect(elsewhere.sentences).toEqual({ 2: sentence({ correct: 0, lastSeen: NOW, first: false, last: false }) });
    expect(applyAnswer(elsewhere, true, NOW + 1, 0).sentences?.[0]).toEqual(
      sentence({ seen: 6, correct: 5, lastSeen: NOW + 1, first: true, last: true }),
    );
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
    const options = buildOptions('på', testExpression(1).flere_saetninger[0], seededRng(7));
    expect([...options].sort()).toEqual(['af', 'for', 'med', 'på']);
  });
});

describe('pickSentence', () => {
  const e = testExpression(1); // 3 sentences

  it('picks a sentence never answered yet', () => {
    const p = testProgress({ sentences: { 0: sentence(), 2: sentence() } });
    expect(pickSentence(e, p, seededRng())).toBe(1);
    expect([0, 0.5, 0.99].map((r) => pickSentence(e, undefined, () => r))).toEqual([0, 1, 2]);
  });

  it('otherwise picks the sentence answered longest ago', () => {
    const p = testProgress({
      sentences: { 0: sentence({ lastSeen: 30 }), 1: sentence({ lastSeen: 10 }), 2: sentence({ lastSeen: 20 }) },
    });
    expect(pickSentence(e, p, seededRng())).toBe(1);
  });

  it('treats sentence 0 as answered long ago when answers were given before sentences were counted', () => {
    const legacy = testProgress({ seen: 4 });
    expect([0, 0.99].map((r) => pickSentence(e, legacy, () => r))).toEqual([1, 2]);
    const rest = { 1: sentence({ lastSeen: 10 }), 2: sentence({ lastSeen: 20 }) };
    expect(pickSentence(e, testProgress({ seen: 6, sentences: rest }), seededRng())).toBe(0);
  });
});

describe('otherSentence', () => {
  it('picks any sentence but the current one', () => {
    const e = testExpression(1); // 3 sentences
    expect([0, 0.99].map((r) => otherSentence(e, 1, () => r))).toEqual([0, 2]);
  });

  it('keeps the only sentence there is', () => {
    expect(otherSentence(testExpression(1, { flere_saetninger: [] }), 0, () => 0.5)).toBe(0);
  });
});

describe('tier', () => {
  it('gives stars only to mastered items, one per sentence known beyond 3', () => {
    expect(tier(testProgress({ box: 3, sentences: knownUpTo(6) }), 6)).toBe(0);
    expect(tier(testProgress({ box: 4, sentences: knownUpTo(3) }), 6)).toBe(0);
    expect(tier(testProgress({ box: 4, sentences: knownUpTo(4) }), 6)).toBe(1);
    expect(tier(testProgress({ box: 5, sentences: knownUpTo(5) }), 6)).toBe(2);
    expect(tier(testProgress({ box: 5, sentences: knownUpTo(6) }), 6)).toBe(3);
  });

  it('counts only sentences whose latest answer was right', () => {
    const sentences = { ...knownUpTo(6), 5: sentence({ last: false }) };
    expect(tier(testProgress({ box: 5, sentences }), 6)).toBe(2);
  });

  it('gives the top tier when all of fewer sentences are known', () => {
    expect(tier(testProgress({ box: 4, sentences: knownUpTo(3) }), 3)).toBe(3);
  });

  it('ignores answers on sentences the expression no longer has', () => {
    const sentences = { ...knownUpTo(4), 7: sentence(), 9: sentence() };
    expect(knownSentences(testProgress({ sentences }), 6)).toBe(4);
    expect(tier(testProgress({ box: 4, sentences }), 6)).toBe(1);
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
