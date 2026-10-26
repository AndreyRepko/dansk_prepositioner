import { TestBed } from '@angular/core/testing';
import { emptyProgress, ProgressState } from '../models/progress';
import { seededRng, testExpression, testProgress } from '../testing/fixtures';
import { ExpressionService } from './expression.service';
import { STORAGE_KEY } from './local-storage-progress-store';
import { ProgressStore } from './progress-store';
import { MAX_SESSIONS, QuizService } from './quiz.service';
import { UserService } from './user.service';

class FakeStore extends ProgressStore {
  saved: ProgressState[] = [];
  savedFor: string[] = [];
  stored: Record<string, ProgressState> = {};
  loadFails = false;
  /** Load fails only for this name. */
  loadFailsFor?: string;
  saveFails = false;
  loads = 0;
  /** When set, load() waits for this before answering. */
  gate?: Promise<void>;
  /** When set, save() waits for this before storing. */
  saveGate?: Promise<void>;
  override async load(user: string) {
    this.loads++;
    await this.gate;
    if (this.loadFails || this.loadFailsFor === user) throw new Error('load failed');
    return this.stored[user] ?? emptyProgress();
  }
  override async save(user: string, state: ProgressState) {
    await this.saveGate;
    if (this.saveFails) throw new Error('save failed');
    this.saved.push(state);
    this.savedFor.push(user);
    this.stored[user] = state;
  }
}

/** A promise plus the function that resolves it. */
function gate(): [Promise<void>, () => void] {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return [promise, release];
}

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
    users.select('Andrii');
    quiz = TestBed.inject(QuizService);
    quiz.now = () => NOW;
    quiz.rng = seededRng();
  });

  /** Lets queued saves run. */
  const flush = () => new Promise((resolve) => setTimeout(resolve));

  it('builds a session with 4 options per question', () => {
    expect(quiz.start({ size: 2 })).toBe(2);
    expect(quiz.queue().length).toBe(2);
    expect([...quiz.current()!.options].sort()).toEqual(['i', 'om', 'på', 'til']);
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

    it('does not load or save without a name', async () => {
      users.clear();
      await quiz.init();
      quiz.start({ size: 1 });
      quiz.answer('på');
      await flush();
      expect(store.saved).toEqual([]);
    });

    it('loads the progress of the new name and ends the running session on switch', async () => {
      store.stored['Olena'] = { version: 1, items: { 2: testProgress({ box: 3 }) }, sessions: [] };
      quiz.start({ size: 1 });
      quiz.answer('på');

      expect(await quiz.switchUser(' Olena ')).toBe(true);
      expect(users.current()).toBe('Olena');
      expect(quiz.active()).toBe(false);
      expect(quiz.progress().items).toEqual({ 2: testProgress({ box: 3 }) });
    });

    it('rejects an invalid name and keeps the current one', async () => {
      expect(await quiz.switchUser('a/b')).toBe(false);
      expect(users.current()).toBe('Andrii');
    });

    it('ignores a slow load for a name that was switched away from', async () => {
      let release!: () => void;
      store.gate = new Promise((resolve) => (release = resolve));
      store.stored['Andrii'] = { version: 1, items: { 1: testProgress() }, sessions: [] };
      const first = quiz.init();
      expect(quiz.loading()).toBe(true);

      store.stored['Olena'] = emptyProgress();
      const second = quiz.switchUser('Olena');
      release();
      await Promise.all([first, second]);

      expect(users.current()).toBe('Olena');
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
      const second = quiz.switchUser('Olena');
      release();
      await expect(first).rejects.toThrow('load failed');
      await second;

      expect(quiz.loadError()).toBe(false);
      expect(quiz.loading()).toBe(false);
      quiz.start({ size: 1 });
      quiz.answer('på');
      await flush();
      expect(store.savedFor).toEqual(['Olena']);
    });

    it('does not save while progress is loading', async () => {
      const [held, release] = gate();
      store.gate = held;
      const switching = quiz.switchUser('Olena');
      expect(quiz.loading()).toBe(true);
      await quiz.resetProgress();
      release();
      await switching;
      expect(store.saved).toEqual([]);
    });

    it('a save still running when the user switches goes to the old name, with the old progress', async () => {
      const [held, release] = gate();
      store.saveGate = held;
      quiz.start({ size: 1 });
      const id = quiz.current()!.expression.id;
      quiz.answer('på');
      const switching = quiz.switchUser('Olena');
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
      quiz.start({ size: 1 });
      quiz.answer('på');
      const switching = quiz.switchUser('Olena');
      release();
      await switching;

      expect(users.current()).toBe('Olena');
      expect(quiz.saveError()).toBe(false);
    });

    it('reloading a name waits for its save still in flight', async () => {
      const [held, release] = gate();
      store.saveGate = held;
      quiz.start({ size: 1 });
      const id = quiz.current()!.expression.id;
      quiz.answer('på');
      const away = quiz.switchUser('Olena');
      const back = quiz.switchUser('Andrii');
      await flush();
      expect(store.loads).toBe(0);
      release();
      await Promise.all([away, back]);

      expect(users.current()).toBe('Andrii');
      expect(quiz.progress().items[id]).toBeDefined();
    });

    it('sign-out clears the name and a load error', async () => {
      store.loadFails = true;
      await expect(quiz.init()).rejects.toThrow();
      quiz.signOut();
      expect(users.current()).toBeNull();
      expect(quiz.loadError()).toBe(false);
    });
  });

  describe('progress saved before names existed', () => {
    const legacy: ProgressState = {
      version: 1,
      items: { 3: testProgress({ box: 4 }) },
      sessions: [{ date: 5, total: 10, correct: 9 }],
    };

    it('is imported into the first name without progress and then retired', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      await quiz.init();

      expect(quiz.progress()).toEqual(legacy);
      expect(store.saved).toEqual([legacy]);
      expect(store.savedFor).toEqual(['Andrii']);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(`${STORAGE_KEY}-imported`)).toBe(JSON.stringify(legacy));

      await quiz.switchUser('Olena');
      expect(quiz.progress()).toEqual(emptyProgress());
    });

    it('is not imported into a name that already has progress', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      store.stored['Andrii'] = { version: 1, items: { 1: testProgress() }, sessions: [] };
      await quiz.init();

      expect(quiz.progress().items).toEqual({ 1: testProgress() });
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('stays in place when the import could not be saved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      store.saveFails = true;
      await quiz.init();

      expect(quiz.saveError()).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('is not imported into a second name chosen during the import save', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      const [held, release] = gate();
      store.saveGate = held;
      const first = quiz.init();
      await flush();
      expect(quiz.loading()).toBe(false);

      const second = quiz.switchUser('Olena');
      release();
      await Promise.all([first, second]);

      expect(store.savedFor).toEqual(['Andrii']);
      expect(quiz.progress()).toEqual(emptyProgress());
    });

    it('stays in place when the import save fails after a switch', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      const [held, release] = gate();
      store.saveGate = held;
      store.saveFails = true;
      const first = quiz.init();
      await flush();

      const second = quiz.switchUser('Olena');
      release();
      await Promise.all([first, second]);

      expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(legacy));
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
