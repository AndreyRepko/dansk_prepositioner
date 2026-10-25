import { TestBed } from '@angular/core/testing';
import { emptyProgress, ProgressState } from '../models/progress';
import { seededRng, testExpression, testProgress } from '../testing/fixtures';
import { ExpressionService } from './expression.service';
import { ProgressStore } from './progress-store';
import { QuizService } from './quiz.service';

class FakeStore extends ProgressStore {
  saved: ProgressState[] = [];
  stored: ProgressState = emptyProgress();
  loadFails = false;
  saveFails = false;
  override async load() {
    if (this.loadFails) throw new Error('load failed');
    return this.stored;
  }
  override async save(state: ProgressState) {
    if (this.saveFails) throw new Error('save failed');
    this.saved.push(state);
  }
}

const NOW = 1_000_000_000_000;
const expressions = [1, 2, 3].map((id) => testExpression(id));

describe('QuizService', () => {
  let quiz: QuizService;
  let store: FakeStore;

  beforeEach(() => {
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
    store.stored = {
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
});
