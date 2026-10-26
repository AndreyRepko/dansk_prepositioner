import { testProgress } from '../testing/fixtures';
import { emptyProgress, MAX_SESSIONS, mergeProgress, ProgressState } from './progress';

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
