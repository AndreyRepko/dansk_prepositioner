import { TestBed } from '@angular/core/testing';
import { sentencesOf } from '../models/expression';
import { emptyProgress, MAX_SESSIONS, ProgressState } from '../models/progress';
import { seededRng, testExpression, testProgress } from '../testing/fixtures';
import { ExpressionService } from './expression.service';
import { GuestProgressStore, MERGE_KEY, STORAGE_KEY } from './local-storage-progress-store';
import { passwordHash } from './password-hash';
import { Account, ProgressStore, WrongPasswordError } from './progress-store';
import { QuizService } from './quiz.service';
import { UserService } from './user.service';

/** Accounts by name; checks passwords like the API. */
class FakeStore extends ProgressStore {
  saved: ProgressState[] = [];
  savedFor: string[] = [];
  stored: Record<string, ProgressState> = {};
  hashes: Record<string, string> = {};
  loadFails = false;
  /** Load fails only for this name. */
  loadFailsFor?: string;
  saveFails = false;
  /** save() stores, then rejects as if the response never arrived. */
  loseResponse = false;
  loads = 0;
  /** When set, load() waits for this before answering. */
  gate?: Promise<void>;
  /** When set, save() waits for this before storing. */
  saveGate?: Promise<void>;
  override async load(account: Account) {
    this.loads++;
    await this.gate;
    if (this.loadFails || this.loadFailsFor === account.name) throw new Error('load failed');
    this.check(account);
    return this.stored[account.name] ?? null;
  }
  override async save(account: Account, state: ProgressState) {
    await this.saveGate;
    if (this.saveFails) throw new Error('save failed');
    this.check(account);
    this.saved.push(state);
    this.savedFor.push(account.name);
    this.stored[account.name] = state;
    this.hashes[account.name] = account.hash;
    if (this.loseResponse) throw new Error('response lost');
  }
  private check(account: Account) {
    const hash = this.hashes[account.name];
    if (hash && hash !== account.hash) throw new WrongPasswordError(account.name);
  }
}

const ANDRII: Account = { name: 'Andrii', hash: 'a'.repeat(64) };
const OLENA: Account = { name: 'Olena', hash: 'b'.repeat(64) };

/** A promise plus the function that resolves it. */
function gate(): [Promise<void>, () => void] {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return [promise, release];
}

/** Answers counted over all items. */
const seen = (p: ProgressState) => Object.values(p.items).reduce((n, item) => n + item.seen, 0);

const NOW = 1_000_000_000_000;
const expressions = [1, 2, 3].map((id) => testExpression(id));

describe('QuizService', () => {
  let quiz: QuizService;
  let store: FakeStore;
  let users: UserService;

  beforeEach(() => {
    localStorage.clear();
    store = new FakeStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProgressStore, useValue: store },
        {
          provide: ExpressionService,
          useValue: { expressions: () => expressions, load: async () => expressions },
        },
      ],
    });
    users = TestBed.inject(UserService);
    users.signIn(ANDRII);
    quiz = TestBed.inject(QuizService);
    quiz.now = () => NOW;
    quiz.rng = seededRng();
  });

  /** Lets queued saves run. */
  const flush = () => new Promise((resolve) => setTimeout(resolve));

  it('builds a session with 4 options per question', () => {
    expect(quiz.start({ size: 2 })).toBe(2);
    expect(quiz.queue().length).toBe(2);
    const q = quiz.current()!;
    expect([...q.options].sort()).toEqual(['på', ...sentencesOf(q.expression)[q.sentence].forkerte].sort());
  });

  it('asks one of the sentences of the expression, with its own wrong options', () => {
    quiz.start({ size: 3 });
    for (const q of quiz.queue()) {
      expect(sentencesOf(q.expression)[q.sentence].saetning).toBe(q.saetning);
    }
  });

  it('records the answer per sentence, with the wrong option chosen', () => {
    quiz.start({ size: 1 });
    const q = quiz.current()!;
    quiz.answer('i');
    expect(quiz.progress().items[q.expression.id]).toEqual(
      expect.objectContaining({
        sentences: { [q.sentence]: expect.objectContaining({ seen: 1, first: false, last: false }) },
        confusions: { i: 1 },
      }),
    );
    expect(quiz.results()).toEqual([expect.objectContaining({ saetning: q.saetning })]);
  });

  it('asks another sentence of the same expression next time', () => {
    const asked = new Set<number>();
    for (let i = 0; i < 3; i++) {
      quiz.start({ size: 3 });
      const q = quiz.queue().find((x) => x.expression.id === 1)!;
      asked.add(q.sentence);
      while (!quiz.finished()) {
        quiz.answer('på');
        quiz.next();
      }
    }
    expect([...asked].sort()).toEqual([0, 1, 2]);
  });

  it('asks a retry with the same sentence', () => {
    quiz.start({ size: 1 });
    const first = quiz.current()!;
    quiz.answer('i');
    quiz.next();
    expect(quiz.current()).toEqual(expect.objectContaining({ retry: true, sentence: first.sentence }));
  });

  it('records a correct first attempt and saves progress', async () => {
    quiz.start({ size: 1 });
    const id = quiz.current()!.expression.id;
    quiz.answer('på');
    await flush();

    expect(quiz.isCorrect()).toBe(true);
    expect(quiz.progress().items[id].box).toBe(2);
    expect(quiz.results()).toEqual([expect.objectContaining({ correct: true, chosen: 'på' })]);
    expect(store.saved.length).toBe(1);
  });

  it('ignores a second answer to the same question', () => {
    quiz.start({ size: 1 });
    quiz.answer('på');
    quiz.answer('i');
    expect(quiz.chosen()).toBe('på');
    expect(quiz.results().length).toBe(1);
  });

  it('re-queues a wrong answer at the end without counting the retry', () => {
    quiz.start({ size: 1 });
    const id = quiz.current()!.expression.id;
    quiz.answer('i');

    expect(quiz.isCorrect()).toBe(false);
    expect(quiz.progress().items[id]).toEqual(expect.objectContaining({ box: 1, wrong: 1 }));
    expect(quiz.queue().length).toBe(2);

    quiz.next();
    expect(quiz.current()?.retry).toBe(true);
    quiz.answer('på');
    expect(quiz.progress().items[id]).toEqual(expect.objectContaining({ box: 1, seen: 1 }));
    expect(quiz.results().length).toBe(1);

    quiz.next();
    expect(quiz.finished()).toBe(true);
  });

  it('keeps re-asking until the item is answered correctly, without touching progress', async () => {
    quiz.start({ size: 1 });
    const id = quiz.current()!.expression.id;
    quiz.answer('i');
    quiz.next();
    quiz.answer('til');
    await flush();

    expect(quiz.progress().items[id]).toEqual(expect.objectContaining({ box: 1, seen: 1, wrong: 1 }));
    expect(quiz.results().length).toBe(1);
    expect(store.saved.length).toBe(1);

    quiz.next();
    expect(quiz.finished()).toBe(false);
    expect(quiz.current()?.retry).toBe(true);
  });

  it('stores a session record when finished', async () => {
    quiz.start({ size: 2 });
    quiz.answer('på');
    quiz.next();
    quiz.answer('på');
    quiz.next();
    await flush();

    expect(quiz.finished()).toBe(true);
    expect(quiz.progress().sessions).toEqual([{ date: NOW, total: 2, correct: 2 }]);
    expect(store.saved.at(-1)?.sessions.length).toBe(1);
  });

  it('counts only first attempts in the session record', () => {
    quiz.start({ size: 2 });
    const first = quiz.current()!.expression.id;
    quiz.answer('i');
    quiz.next();
    quiz.answer('på');
    quiz.next();
    quiz.answer('på'); // retry of the first question
    quiz.next();

    expect(quiz.finished()).toBe(true);
    expect(quiz.progress().sessions).toEqual([{ date: NOW, total: 2, correct: 1 }]);
    expect(quiz.results()).toEqual([
      expect.objectContaining({ expression: expect.objectContaining({ id: first }), chosen: 'i', correct: false }),
      expect.objectContaining({ correct: true }),
    ]);
  });

  it('records a finished session only once', () => {
    quiz.start({ size: 1 });
    quiz.answer('på');
    quiz.next();
    quiz.next();
    expect(quiz.progress().sessions.length).toBe(1);
  });

  it('does not advance before an answer is given', () => {
    quiz.start({ size: 2 });
    quiz.next();
    expect(quiz.index()).toBe(0);
  });

  it('resets progress', async () => {
    quiz.start({ size: 1 });
    quiz.answer('på');
    await quiz.resetProgress();
    expect(quiz.progress()).toEqual(emptyProgress());
    expect(store.saved.at(-1)).toEqual(emptyProgress());
  });

  it('loads stored progress on init and keeps it when saving', async () => {
    store.stored['Andrii'] = {
      version: 1,
      items: { 99: testProgress({ box: 4 }) },
      sessions: [{ date: 1, total: 5, correct: 4 }],
    };
    await quiz.init();
    quiz.start({ size: 1 });
    quiz.answer('på');
    await flush();

    const saved = store.saved.at(-1)!;
    expect(saved.items[99]).toEqual(testProgress({ box: 4 }));
    expect(saved.sessions).toEqual([{ date: 1, total: 5, correct: 4 }]);
    expect(Object.keys(saved.items).length).toBe(2);
  });

  it('does not save when progress could not be loaded', async () => {
    store.loadFails = true;
    await expect(quiz.init()).rejects.toThrow('load failed');
    expect(quiz.loadError()).toBe(true);

    quiz.start({ size: 1 });
    quiz.answer('på');
    await flush();
    expect(store.saved).toEqual([]);

    store.loadFails = false;
    await quiz.init();
    expect(quiz.loadError()).toBe(false);
  });

  it('reports a failed save and recovers on the next one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.saveFails = true;
    quiz.start({ size: 2 });
    quiz.answer('på');
    await flush();
    expect(quiz.saveError()).toBe(true);

    store.saveFails = false;
    quiz.next();
    quiz.answer('på');
    await flush();
    expect(quiz.saveError()).toBe(false);
  });

  it('keeps only the most recent sessions', async () => {
    store.stored['Andrii'] = {
      version: 1,
      items: {},
      sessions: Array.from({ length: MAX_SESSIONS }, (_, i) => ({ date: i, total: 1, correct: 1 })),
    };
    await quiz.init();
    quiz.start({ size: 1 });
    quiz.answer('på');
    quiz.next();

    const sessions = quiz.progress().sessions;
    expect(sessions.length).toBe(MAX_SESSIONS);
    expect(sessions[0].date).toBe(1);
    expect(sessions.at(-1)?.date).toBe(NOW);
  });

  describe('users', () => {
    it('saves under the current name', async () => {
      quiz.start({ size: 1 });
      quiz.answer('på');
      await flush();
      expect(store.savedFor).toEqual(['Andrii']);
    });

    it('loads the progress of the new name and ends the running session on switch', async () => {
      store.stored['Olena'] = { version: 1, items: { 2: testProgress({ box: 3 }) }, sessions: [] };
      quiz.start({ size: 1 });
      quiz.answer('på');

      expect(await quiz.signInAs(OLENA)).toBe('ok');
      expect(users.current()).toEqual(OLENA);
      expect(quiz.active()).toBe(false);
      expect(quiz.progress().items).toEqual({ 2: testProgress({ box: 3 }) });
    });

    it('rejects an invalid name or empty password and keeps the current one', async () => {
      expect(await quiz.signIn('a/b', 'pw')).toBeNull();
      expect(await quiz.signIn('Olena', '')).toBeNull();
      expect(users.current()).toEqual(ANDRII);
      expect(store.loads).toBe(0);
    });

    it('signs in with the hash of password + name, never the password', async () => {
      store.stored['Olena'] = emptyProgress();
      expect(await quiz.signIn(' Olena ', 'secret')).toBe('ok');
      expect(users.current()).toEqual({ name: 'Olena', hash: await passwordHash('Olena', 'secret') });
    });

    it('ignores a slow load for a name that was switched away from', async () => {
      const [held, release] = gate();
      store.gate = held;
      store.stored['Andrii'] = { version: 1, items: { 1: testProgress() }, sessions: [] };
      const first = quiz.init();
      expect(quiz.loading()).toBe(true);

      store.stored['Olena'] = emptyProgress();
      const second = quiz.signInAs(OLENA);
      release();
      await Promise.all([first, second]);

      expect(users.current()).toEqual(OLENA);
      expect(quiz.progress()).toEqual(emptyProgress());
      expect(quiz.loading()).toBe(false);
    });

    it('ignores a slow failing load for a name that was switched away from', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const [held, release] = gate();
      store.gate = held;
      store.loadFailsFor = 'Andrii';
      const first = quiz.init();
      await flush();
      expect(store.loads).toBe(1);
      const second = quiz.signInAs(OLENA, true);
      release();
      await expect(first).rejects.toThrow('load failed');
      await second;

      expect(quiz.loadError()).toBe(false);
      expect(quiz.loading()).toBe(false);
      quiz.start({ size: 1 });
      quiz.answer('på');
      await flush();
      expect(store.savedFor).toEqual(['Olena', 'Olena']);
    });

    it('does not save while progress is loading', async () => {
      const [held, release] = gate();
      store.gate = held;
      const loading = quiz.init();
      expect(quiz.loading()).toBe(true);
      await quiz.resetProgress();
      release();
      await loading;
      expect(store.saved).toEqual([]);
    });

    it('a save still running when the user switches goes to the old name, with the old progress', async () => {
      const [held, release] = gate();
      store.saveGate = held;
      store.stored['Olena'] = emptyProgress();
      quiz.start({ size: 1 });
      const id = quiz.current()!.expression.id;
      quiz.answer('på');
      const switching = quiz.signInAs(OLENA);
      release();
      await switching;

      expect(store.savedFor).toEqual(['Andrii']);
      expect(store.saved[0].items[id]).toBeDefined();
      expect(quiz.progress()).toEqual(emptyProgress());
    });

    it('does not show a failed save for the previous name', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const [held, release] = gate();
      store.saveGate = held;
      store.saveFails = true;
      store.stored['Olena'] = emptyProgress();
      quiz.start({ size: 1 });
      quiz.answer('på');
      const switching = quiz.signInAs(OLENA);
      release();
      await switching;

      expect(users.current()).toEqual(OLENA);
      expect(quiz.saveError()).toBe(false);
    });

    it('only the last of quick switches takes effect, after saves in flight', async () => {
      const [held, release] = gate();
      store.saveGate = held;
      store.stored['Olena'] = emptyProgress();
      quiz.start({ size: 1 });
      const id = quiz.current()!.expression.id;
      quiz.answer('på');
      const away = quiz.signInAs(OLENA);
      const back = quiz.signInAs(ANDRII);
      await flush();
      expect(store.loads).toBe(0);
      release();
      await Promise.all([away, back]);

      expect(users.current()).toEqual(ANDRII);
      expect(quiz.progress().items[id]).toBeDefined();
    });

    it('sign-out goes back to guest progress and clears a load error', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items: { 3: testProgress() }, sessions: [] }));
      store.loadFails = true;
      await expect(quiz.init()).rejects.toThrow();
      await quiz.signOut();
      expect(users.current()).toBeNull();
      expect(quiz.loadError()).toBe(false);
      expect(quiz.progress().items).toEqual({ 3: testProgress() });
    });
  });

  describe('guest', () => {
    const guestState: ProgressState = {
      version: 1,
      items: { 3: testProgress({ box: 4, seen: 2, correct: 2, lastSeen: 50 }) },
      sessions: [{ date: 5, total: 10, correct: 9 }],
    };
    const storedGuest = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');

    beforeEach(async () => {
      users.signOut();
      await quiz.init();
    });

    it('practises without an account, keeping progress in this browser', async () => {
      quiz.start({ size: 1 });
      const id = quiz.current()!.expression.id;
      quiz.answer('på');
      await flush();
      expect(store.saved).toEqual([]);
      expect(storedGuest().items[id]).toBeDefined();
    });

    it('loads progress saved before (also from before names existed)', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      expect(quiz.progress()).toEqual(guestState);
    });

    it('reports an unknown name without changing anything', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      expect(await quiz.signInAs(OLENA)).toBe('unknown');
      expect(users.current()).toBeNull();
      expect(store.saved).toEqual([]);
      expect(quiz.progress()).toEqual(guestState);
    });

    it('creates an account that takes over the guest progress', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      expect(await quiz.signInAs(OLENA, true)).toBe('ok');

      expect(users.current()).toEqual(OLENA);
      expect(store.stored['Olena']).toEqual({ ...guestState, merged: [expect.any(String)] });
      expect(quiz.progress()).toEqual(store.stored['Olena']);
      expect(storedGuest()).toBeNull();
      expect(localStorage.getItem(MERGE_KEY)).toBeNull();
    });

    it('creates an empty account when there is no guest progress', async () => {
      expect(await quiz.signInAs(OLENA, true)).toBe('ok');
      expect(store.stored['Olena']).toEqual(emptyProgress());
    });

    it('adds guest progress to an existing account', async () => {
      store.stored['Olena'] = {
        version: 1,
        items: { 3: testProgress({ box: 2, seen: 1, correct: 0, wrong: 1, lastSeen: 10 }), 1: testProgress() },
        sessions: [{ date: 1, total: 4, correct: 2 }],
      };
      store.hashes['Olena'] = OLENA.hash;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      expect(await quiz.signInAs(OLENA)).toBe('ok');

      const merged = store.stored['Olena'];
      expect(merged.items[3]).toEqual(testProgress({ box: 4, seen: 3, correct: 2, wrong: 1, lastSeen: 50 }));
      expect(merged.items[1]).toEqual(testProgress());
      expect(merged.sessions.map((x) => x.date)).toEqual([1, 5]);
      expect(quiz.progress()).toEqual(merged);
      expect(storedGuest()).toBeNull();
    });

    it('does not save an existing account when there is nothing to add', async () => {
      store.stored['Olena'] = guestState;
      expect(await quiz.signInAs(OLENA)).toBe('ok');
      expect(store.saved).toEqual([]);
    });

    it('keeps everything as it was for a wrong password', async () => {
      store.stored['Olena'] = emptyProgress();
      store.hashes['Olena'] = OLENA.hash;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      expect(await quiz.signInAs({ name: 'Olena', hash: 'c'.repeat(64) })).toBe('wrong-password');

      expect(users.current()).toBeNull();
      expect(storedGuest()).toEqual(guestState);
      expect(quiz.progress()).toEqual(guestState);
    });

    it('keeps the guest progress when the account cannot be saved', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      store.saveFails = true;
      await expect(quiz.signInAs(OLENA, true)).rejects.toThrow('save failed');

      expect(users.current()).toBeNull();
      expect(storedGuest()).toEqual(guestState);
      expect(quiz.progress()).toEqual(guestState);
    });

    it('includes a guest answer whose save is still running', async () => {
      quiz.start({ size: 1 });
      const id = quiz.current()!.expression.id;
      quiz.answer('på');
      await quiz.signInAs(OLENA, true);
      expect(store.stored['Olena'].items[id]).toBeDefined();
    });

    it('keeps only guest answers given while the account was being saved, and adds them once', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      const [held, release] = gate();
      store.saveGate = held;
      const signingIn = quiz.signInAs(OLENA, true);
      await flush();
      quiz.start({ size: 1 });
      const id = quiz.current()!.expression.id;
      quiz.answer('på');
      release();
      await signingIn;
      await flush();

      expect(users.current()).toEqual(OLENA);
      expect(Object.keys(storedGuest().items)).toEqual([String(id)]);
      expect(seen(storedGuest())).toBe(1);
      expect(seen(store.stored['Olena'])).toBe(2);

      await quiz.signOut();
      expect(await quiz.signInAs(OLENA)).toBe('ok');
      expect(seen(store.stored['Olena'])).toBe(3); // 2 before signing in + 1 meanwhile
      expect(storedGuest()).toBeNull();
    });

    it('adds guest progress once when a sign-out overtakes the sign-in', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      const [held, release] = gate();
      store.saveGate = held;
      const signingIn = quiz.signInAs(OLENA, true);
      await flush();
      const signingOut = quiz.signOut();
      release();
      expect(await signingIn).toBe('superseded');
      await signingOut;

      expect(users.current()).toBeNull();
      expect(quiz.progress().items).toEqual(guestState.items); // still practising on it as guest
      expect(await quiz.signInAs(OLENA)).toBe('ok');
      expect(seen(store.stored['Olena'])).toBe(2);
      expect(store.stored['Olena'].sessions).toEqual(guestState.sessions);
      expect(storedGuest()).toBeNull();
    });

    it('does not add guest progress to a second account once it is in the first', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      const [held, release] = gate();
      store.saveGate = held;
      const signingIn = quiz.signInAs(OLENA, true);
      await flush();
      const signingOut = quiz.signOut();
      release();
      await signingIn;
      await signingOut;

      expect(await quiz.signInAs(ANDRII, true)).toBe('ok');
      expect(store.stored['Andrii'].items).toEqual({});
    });

    it('adds guest progress once when a sign-in is retried after its save reached the account', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      store.loseResponse = true;
      await expect(quiz.signInAs(OLENA, true)).rejects.toThrow('response lost');
      expect(storedGuest()).toEqual(guestState);
      store.loseResponse = false;

      expect(await quiz.signInAs(OLENA)).toBe('ok');
      expect(seen(store.stored['Olena'])).toBe(2);
      expect(storedGuest()).toBeNull();
      vi.restoreAllMocks();
    });

    it('still adds guest progress after a failed sign-in to another account', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      store.saveFails = true;
      await expect(quiz.signInAs(OLENA, true)).rejects.toThrow('save failed');
      store.saveFails = false;

      expect(await quiz.signInAs(ANDRII, true)).toBe('ok');
      expect(seen(store.stored['Andrii'])).toBe(2);
    });

    it('signs in without guest progress it cannot read, leaving it where it is', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      vi.spyOn(TestBed.inject(GuestProgressStore), 'load').mockRejectedValue(new Error('blocked'));

      expect(await quiz.signInAs(OLENA, true)).toBe('ok');
      expect(store.stored['Olena']).toEqual(emptyProgress());
      expect(storedGuest()).toEqual(guestState);
      vi.restoreAllMocks();
    });

    it('reports a wrong password when the name is claimed while the account is saved', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guestState));
      await quiz.init();
      const [held, release] = gate();
      store.saveGate = held;
      const signingIn = quiz.signInAs(OLENA, true);
      await flush();
      store.hashes['Olena'] = 'c'.repeat(64); // claimed by someone else between load and save
      release();
      expect(await signingIn).toBe('wrong-password');
      expect(users.current()).toBeNull();
    });
  });

  describe('refresh', () => {
    const newer: ProgressState = { version: 1, items: { 2: testProgress({ box: 5 }) }, sessions: [] };

    beforeEach(async () => {
      await quiz.init();
    });

    it('applies progress saved on another device', async () => {
      store.stored['Andrii'] = newer;
      await quiz.refresh();
      expect(quiz.progress()).toEqual(newer);
    });

    it('is skipped during a session', async () => {
      store.stored['Andrii'] = newer;
      quiz.start({ size: 1 });
      await quiz.refresh();
      expect(store.loads).toBe(1);
      expect(quiz.progress()).toEqual(emptyProgress());
    });

    it('does not replace an answer given while it was loading', async () => {
      store.stored['Andrii'] = newer;
      const [held, release] = gate();
      store.gate = held;
      const refreshing = quiz.refresh();
      quiz.start({ size: 1 });
      quiz.answer('på');
      quiz.next();
      release();
      await refreshing;
      expect(quiz.progress().sessions.length).toBe(1);
    });

    it('keeps the current progress when loading fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      quiz.start({ size: 1 });
      quiz.answer('på');
      quiz.next();
      await flush();
      const before = quiz.progress();
      store.loadFails = true;
      await quiz.refresh();
      expect(quiz.progress()).toBe(before);
      expect(quiz.loadError()).toBe(false);
    });
  });
});
