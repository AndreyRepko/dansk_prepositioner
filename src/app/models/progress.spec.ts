import { testProgress } from '../testing/fixtures';
import {
  emptyProgress,
  isEmptyProgress,
  ItemProgress,
  MAX_SESSIONS,
  mergeProgress,
  parseProgress,
  progressSince,
  ProgressState,
  SentenceProgress,
} from './progress';

const sentence = (overrides: Partial<SentenceProgress> = {}): SentenceProgress => ({
  seen: 1,
  correct: 1,
  lastSeen: 0,
  first: true,
  last: true,
  ...overrides,
});

describe('mergeProgress', () => {
  it('keeps items only one side has', () => {
    const a: ProgressState = { version: 1, items: { 1: testProgress({ box: 3 }) }, sessions: [] };
    const b: ProgressState = { version: 1, items: { 2: testProgress({ box: 1 }) }, sessions: [] };
    expect(mergeProgress(a, b).items).toEqual({ 1: testProgress({ box: 3 }), 2: testProgress({ box: 1 }) });
  });

  it('takes box and due date from the newer answer and adds up the counts', () => {
    const older = testProgress({ box: 4, seen: 5, correct: 5, wrong: 0, lastSeen: 10, due: 100 });
    const newer = testProgress({ box: 1, seen: 2, correct: 1, wrong: 1, lastSeen: 20, due: 20 });
    const expected = testProgress({ box: 1, seen: 7, correct: 6, wrong: 1, lastSeen: 20, due: 20 });
    const one = (item: typeof older): ProgressState => ({ version: 1, items: { 1: item }, sessions: [] });

    expect(mergeProgress(one(older), one(newer)).items[1]).toEqual(expected);
    expect(mergeProgress(one(newer), one(older)).items[1]).toEqual(expected);
  });

  it('adds up sentence answers and mix-ups; the newer answer sets `last`, the account keeps `first`', () => {
    const account = testProgress({
      lastSeen: 10,
      sentences: { 0: sentence({ seen: 2, correct: 1, lastSeen: 10, first: false, last: true }) },
      confusions: { i: 1 },
    });
    const guest = testProgress({
      lastSeen: 20,
      sentences: {
        0: sentence({ seen: 1, correct: 0, lastSeen: 20, first: true, last: false }),
        1: sentence({ lastSeen: 20 }),
      },
      confusions: { i: 2, til: 1 },
    });
    const one = (item: typeof account): ProgressState => ({ version: 1, items: { 1: item }, sessions: [] });

    expect(mergeProgress(one(account), one(guest)).items[1]).toEqual(
      expect.objectContaining({
        sentences: {
          0: sentence({ seen: 3, correct: 1, lastSeen: 20, first: false, last: false }),
          1: sentence({ lastSeen: 20 }),
        },
        confusions: { i: 3, til: 1 },
      }),
    );
  });

  it('takes `last` from the account when its answer on the sentence is newer', () => {
    const one = (item: ItemProgress): ProgressState => ({ version: 1, items: { 1: item }, sessions: [] });
    const account = testProgress({
      lastSeen: 30,
      sentences: { 0: sentence({ lastSeen: 30, first: false, correct: 0, last: false }) },
    });
    const guest = testProgress({ lastSeen: 20, sentences: { 0: sentence({ lastSeen: 20 }) }, confusions: { i: 1 } });

    expect(mergeProgress(one(account), one(guest)).items[1]).toEqual(
      expect.objectContaining({
        sentences: { 0: sentence({ seen: 2, correct: 1, lastSeen: 30, first: false, last: false }) },
        confusions: { i: 1 },
      }),
    );
  });

  it('merges sentence answers into an item saved before sentences were counted', () => {
    const one = (item: ItemProgress): ProgressState => ({ version: 1, items: { 1: item }, sessions: [] });
    const legacy = testProgress({ seen: 4, lastSeen: 10 });
    const guest = testProgress({ lastSeen: 20, sentences: { 2: sentence({ lastSeen: 20 }) } });

    expect(mergeProgress(one(legacy), one(guest)).items[1]).toEqual(
      expect.objectContaining({ seen: 5, sentences: { 2: sentence({ lastSeen: 20 }) } }),
    );
  });

  it('interleaves sessions by date and keeps the most recent', () => {
    const a: ProgressState = { version: 1, items: {}, sessions: [1, 4].map((date) => ({ date, total: 1, correct: 1 })) };
    const b: ProgressState = { version: 1, items: {}, sessions: [2, 3].map((date) => ({ date, total: 1, correct: 0 })) };
    expect(mergeProgress(a, b).sessions.map((s) => s.date)).toEqual([1, 2, 3, 4]);

    const many: ProgressState = {
      version: 1,
      items: {},
      sessions: Array.from({ length: MAX_SESSIONS }, (_, i) => ({ date: i + 10, total: 1, correct: 1 })),
    };
    const merged = mergeProgress(many, a).sessions;
    expect(merged.length).toBe(MAX_SESSIONS);
    expect(merged[0].date).toBe(10); // the two oldest (1 and 4) are dropped
  });

  it('does not change its inputs', () => {
    const a: ProgressState = { version: 1, items: { 1: testProgress() }, sessions: [] };
    const copy = structuredClone(a);
    mergeProgress(a, a);
    mergeProgress(emptyProgress(), a);
    expect(a).toEqual(copy);
  });
});

describe('progressSince', () => {
  const snapshot: ProgressState = {
    version: 1,
    items: {
      1: testProgress({ seen: 2, correct: 1, wrong: 1, lastSeen: 10 }),
      2: testProgress({ lastSeen: 10 }),
    },
    sessions: [{ date: 10, total: 2, correct: 1 }],
  };

  it('is empty when nothing happened since the snapshot', () => {
    expect(isEmptyProgress(progressSince(snapshot, snapshot))).toBe(true);
  });

  it('keeps new items, and only the answers since for items answered again', () => {
    const now: ProgressState = {
      version: 1,
      items: {
        ...snapshot.items,
        1: testProgress({ box: 3, seen: 3, correct: 2, wrong: 1, lastSeen: 20, due: 30 }),
        3: testProgress({ lastSeen: 20 }),
      },
      sessions: [...snapshot.sessions, { date: 20, total: 1, correct: 1 }],
    };
    expect(progressSince(now, snapshot)).toEqual({
      version: 1,
      items: {
        1: testProgress({ box: 3, seen: 1, correct: 1, wrong: 0, lastSeen: 20, due: 30 }),
        3: now.items[3],
      },
      sessions: [{ date: 20, total: 1, correct: 1 }],
    });
  });

  it('adds up and subtracts "Ved ikke" counts', () => {
    const one = (dontKnow: number | undefined, lastSeen: number): ProgressState => ({
      version: 1,
      items: { 1: testProgress({ lastSeen, ...(dontKnow !== undefined && { dontKnow }) }) },
      sessions: [],
    });
    expect(mergeProgress(one(2, 10), one(1, 20)).items[1].dontKnow).toBe(3);
    expect(mergeProgress(one(undefined, 10), one(1, 20)).items[1].dontKnow).toBe(1);
    expect(progressSince(one(3, 20), one(1, 10)).items[1].dontKnow).toBe(2);
    expect(progressSince(one(1, 20), one(1, 10)).items[1]).not.toHaveProperty('dontKnow');
  });

  it('keeps only the sentence answers and mix-ups since', () => {
    const then = testProgress({
      lastSeen: 10,
      sentences: { 0: sentence({ lastSeen: 10 }), 1: sentence({ lastSeen: 10 }) },
      confusions: { i: 1, til: 1 },
    });
    const now = testProgress({
      lastSeen: 20,
      sentences: {
        0: sentence({ lastSeen: 10 }),
        1: sentence({ seen: 3, correct: 2, lastSeen: 20, last: false }),
        2: sentence({ lastSeen: 20 }),
      },
      confusions: { i: 1, til: 2 },
    });
    const one = (item: typeof now): ProgressState => ({ version: 1, items: { 1: item }, sessions: [] });

    const since = progressSince(one(now), one(then)).items[1];
    expect(since.sentences).toEqual({
      1: sentence({ seen: 2, correct: 1, lastSeen: 20, last: false }),
      2: sentence({ lastSeen: 20 }),
    });
    expect(since.confusions).toEqual({ til: 1 });
  });

  it('adds nothing twice when merged again', () => {
    const account: ProgressState = {
      version: 1,
      items: { 1: testProgress({ seen: 5, lastSeen: 5 }) },
      sessions: [],
    };
    const now: ProgressState = {
      ...snapshot,
      items: { ...snapshot.items, 3: testProgress({ lastSeen: 20 }) },
    };
    const once = mergeProgress(mergeProgress(account, snapshot), progressSince(now, snapshot));
    expect(once).toEqual(mergeProgress(account, now));
  });

  it('adds no sentence answer or mix-up twice when merged again', () => {
    const one = (item: ItemProgress): ProgressState => ({ version: 1, items: { 1: item }, sessions: [] });
    const account = one(
      testProgress({ seen: 2, lastSeen: 5, sentences: { 0: sentence({ seen: 2, correct: 2, lastSeen: 5 }) } }),
    );
    const then = testProgress({
      seen: 2,
      lastSeen: 10,
      sentences: { 0: sentence({ lastSeen: 10 }), 1: sentence({ lastSeen: 10 }) },
      confusions: { i: 1 },
    });
    const now = testProgress({
      seen: 5,
      lastSeen: 20,
      sentences: {
        0: sentence({ lastSeen: 10 }),
        1: sentence({ seen: 3, correct: 1, lastSeen: 20, last: false }),
        2: sentence({ lastSeen: 20 }),
      },
      confusions: { i: 3 },
    });
    const once = mergeProgress(mergeProgress(account, one(then)), progressSince(one(now), one(then)));
    expect(once).toEqual(mergeProgress(account, one(now)));
  });

  it('never claims a right first answer it does not count', () => {
    const one = (item: ItemProgress): ProgressState => ({ version: 1, items: { 1: item }, sessions: [] });
    const then = testProgress({ lastSeen: 10, sentences: { 0: sentence({ lastSeen: 10 }) } });
    const now = testProgress({
      seen: 2,
      lastSeen: 20,
      sentences: { 0: sentence({ seen: 2, correct: 1, lastSeen: 20, last: false }) },
    });
    expect(progressSince(one(now), one(then)).items[1].sentences).toEqual({
      0: sentence({ seen: 1, correct: 0, lastSeen: 20, first: false, last: false }),
    });
  });
});

describe('parseProgress', () => {
  it('keeps a positive "Ved ikke" count and drops an invalid one', () => {
    const parse = (dontKnow: unknown) =>
      parseProgress({ version: 1, items: { 1: { ...testProgress(), dontKnow } }, sessions: [] })
        ?.items[1];
    expect(parse(2)?.dontKnow).toBe(2);
    expect(parse(0)).not.toHaveProperty('dontKnow');
    expect(parse('x')).not.toHaveProperty('dontKnow');
  });

  it('keeps the merge ids of an account', () => {
    expect(parseProgress({ version: 1, items: {}, sessions: [], merged: ['a', 1, 'b'] })).toEqual({
      version: 1,
      items: {},
      sessions: [],
      merged: ['a', 'b'],
    });
  });

  it('keeps valid sentence answers and mix-ups and drops malformed ones', () => {
    const item = {
      ...testProgress(),
      sentences: {
        0: sentence(),
        1: { seen: 1 },
        x: sentence(),
        '': sentence(),
        '-1': sentence(),
        '1.0': sentence(),
        '0x1': sentence(),
      },
      confusions: { i: 2, til: 'x', om: 0 },
    };
    expect(parseProgress({ version: 1, items: { 1: item }, sessions: [] })?.items[1]).toEqual({
      ...testProgress(),
      sentences: { 0: sentence() },
      confusions: { i: 2 },
    });
  });

  it('reads items saved before sentences were counted', () => {
    expect(parseProgress({ version: 1, items: { 1: testProgress() }, sessions: [] })?.items[1]).toStrictEqual(
      testProgress(),
    );
  });

  it('is kept through a merge into the account', () => {
    const account: ProgressState = { ...emptyProgress(), merged: ['a'] };
    expect(mergeProgress(account, emptyProgress()).merged).toEqual(['a']);
  });
});
