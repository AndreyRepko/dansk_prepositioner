import { emptyProgress, ProgressState } from '../models/progress';
import { testProgress } from '../testing/fixtures';
import {
  GuestProgressStore,
  LocalStorageProgressStore,
  passwordKey,
  STORAGE_KEY,
  storageKey,
} from './local-storage-progress-store';
import { WrongPasswordError } from './progress-store';

const ANDRII = { name: 'Andrii', hash: 'a'.repeat(64) };

describe('LocalStorageProgressStore', () => {
  const store = new LocalStorageProgressStore();
  const key = storageKey('Andrii');

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const backups = () => Object.keys(localStorage).filter((k) => k.startsWith(`${key}-corrupt-`));

  it('returns null for a name without an account', async () => {
    expect(await store.load(ANDRII)).toBeNull();
  });

  it('round-trips saved progress', async () => {
    const state: ProgressState = {
      version: 1,
      items: { 7: testProgress({ box: 3 }) },
      sessions: [{ date: 1, total: 10, correct: 8 }],
    };
    await store.save(ANDRII, state);
    expect(await store.load(ANDRII)).toEqual(state);
  });

  it('keeps names apart and ignores case', async () => {
    const state: ProgressState = { version: 1, items: { 7: testProgress() }, sessions: [] };
    await store.save(ANDRII, state);
    expect(await store.load({ ...ANDRII, name: 'ANDRII' })).toEqual(state);
    expect(await store.load({ ...ANDRII, name: 'Olena' })).toBeNull();
    expect(key).toBe(`${STORAGE_KEY}:andrii`);
  });

  it('rejects a wrong password like the API', async () => {
    await store.save(ANDRII, emptyProgress());
    const other = { ...ANDRII, hash: 'b'.repeat(64) };
    await expect(store.load(other)).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(store.save(other, emptyProgress())).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('lets the first password claim progress saved before passwords existed', async () => {
    localStorage.setItem(key, JSON.stringify(emptyProgress()));
    expect(await store.load(ANDRII)).toEqual(emptyProgress());
    expect(localStorage.getItem(passwordKey('Andrii'))).toBe(ANDRII.hash);
  });

  it.each(['{not json', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, items: null, sessions: [] })])(
    'returns empty progress for unreadable data and keeps a backup: %s',
    async (raw) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(key, raw);

      expect(await store.load(ANDRII)).toEqual(emptyProgress());
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
    expect(await store.load(ANDRII)).toEqual({
      version: 1,
      items: { 1: good },
      sessions: [{ date: 1, total: 2, correct: 1 }],
    });
    expect(backups()).toEqual([]);
  });

  it('keeps only one backup of the same unreadable data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(key, '{not json');
    await store.load(ANDRII);
    await store.load(ANDRII);
    expect(backups().length).toBe(1);
  });

  it('rejects when storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await expect(store.load(ANDRII)).rejects.toThrow('blocked');
  });

  it('rejects when saving fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    await expect(store.save(ANDRII, emptyProgress())).rejects.toThrow('QuotaExceededError');
  });
});

describe('GuestProgressStore', () => {
  const guest = new GuestProgressStore();
  const state: ProgressState = { version: 1, items: { 1: testProgress() }, sessions: [] };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is empty when nothing is stored', async () => {
    expect(await guest.load()).toEqual(emptyProgress());
  });

  it('round-trips under the key used before names existed, and clears', async () => {
    await guest.save(state);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(state);
    expect(await guest.load()).toEqual(state);

    await guest.clear();
    expect(await guest.load()).toEqual(emptyProgress());
  });

  it('keeps a backup of unreadable data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(await guest.load()).toEqual(emptyProgress());
    expect(Object.keys(localStorage).some((k) => k.startsWith(`${STORAGE_KEY}-corrupt-`))).toBe(true);
  });
});
