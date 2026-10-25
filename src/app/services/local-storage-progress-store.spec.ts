import { emptyProgress, ProgressState } from '../models/progress';
import { testProgress } from '../testing/fixtures';
import {
  LocalStorageProgressStore,
  readLegacyProgress,
  retireLegacyProgress,
  STORAGE_KEY,
  storageKey,
} from './local-storage-progress-store';

describe('LocalStorageProgressStore', () => {
  const store = new LocalStorageProgressStore();
  const key = storageKey('Andrii');

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const backups = () => Object.keys(localStorage).filter((k) => k.startsWith(`${key}-corrupt-`));

  it('returns empty progress when nothing is stored', async () => {
    expect(await store.load('Andrii')).toEqual(emptyProgress());
  });

  it('round-trips saved progress', async () => {
    const state: ProgressState = {
      version: 1,
      items: { 7: testProgress({ box: 3 }) },
      sessions: [{ date: 1, total: 10, correct: 8 }],
    };
    await store.save('Andrii', state);
    expect(await store.load('Andrii')).toEqual(state);
  });

  it('keeps names apart and ignores case', async () => {
    const state: ProgressState = { version: 1, items: { 7: testProgress() }, sessions: [] };
    await store.save('Andrii', state);
    expect(await store.load('ANDRII')).toEqual(state);
    expect(await store.load('Olena')).toEqual(emptyProgress());
    expect(key).toBe(`${STORAGE_KEY}:andrii`);
  });

  it.each(['{not json', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, items: null, sessions: [] })])(
    'returns empty progress for unreadable data and keeps a backup: %s',
    async (raw) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(key, raw);

      expect(await store.load('Andrii')).toEqual(emptyProgress());
      expect(backups().map((k) => localStorage.getItem(k))).toEqual([raw]);
      expect(console.error).toHaveBeenCalled();
    },
  );

  it('drops malformed entries but keeps valid ones', async () => {
    const good = testProgress({ box: 3 });
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        items: { 1: good, 2: null, 3: { box: 9, seen: 1 } },
        sessions: [{ date: 1, total: 2, correct: 1 }, { date: 'x' }],
      }),
    );
    expect(await store.load('Andrii')).toEqual({
      version: 1,
      items: { 1: good },
      sessions: [{ date: 1, total: 2, correct: 1 }],
    });
    expect(backups()).toEqual([]);
  });

  it('returns empty progress when storage is blocked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(await store.load('Andrii')).toEqual(emptyProgress());
  });

  it('rejects when saving fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    await expect(store.save('Andrii', emptyProgress())).rejects.toThrow('QuotaExceededError');
  });
});

describe('legacy progress (saved before names existed)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is null when there is none', () => {
    expect(readLegacyProgress()).toBeNull();
  });

  it('is read from the old key and retired to an "-imported" copy', () => {
    const state: ProgressState = { version: 1, items: { 1: testProgress() }, sessions: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    expect(readLegacyProgress()).toEqual(state);

    retireLegacyProgress();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(`${STORAGE_KEY}-imported`)!)).toEqual(state);
    expect(readLegacyProgress()).toBeNull();
  });
});
