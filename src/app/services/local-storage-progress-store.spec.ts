import { emptyProgress, ProgressState } from '../models/progress';
import { testProgress } from '../testing/fixtures';
import { LocalStorageProgressStore, STORAGE_KEY } from './local-storage-progress-store';

describe('LocalStorageProgressStore', () => {
  const store = new LocalStorageProgressStore();

  beforeEach(() => localStorage.clear());

  it('returns empty progress when nothing is stored', async () => {
    expect(await store.load()).toEqual(emptyProgress());
  });

  it('round-trips saved progress', async () => {
    const state: ProgressState = {
      version: 1,
      items: { 7: testProgress({ box: 3 }) },
      sessions: [{ date: 1, total: 10, correct: 8 }],
    };
    await store.save(state);
    expect(await store.load()).toEqual(state);
  });

  it('returns empty progress for corrupt data', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(await store.load()).toEqual(emptyProgress());
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(await store.load()).toEqual(emptyProgress());
  });
});
