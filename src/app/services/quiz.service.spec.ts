import { TestBed } from '@angular/core/testing';
import { emptyProgress, ProgressState } from '../models/progress';
import { seededRng, testExpression } from '../testing/fixtures';
import { ExpressionService } from './expression.service';
import { ProgressStore } from './progress-store';
import { QuizService } from './quiz.service';

class FakeStore extends ProgressStore {
  saved: ProgressState[] = [];
  override async load() {
    return emptyProgress();
  }
  override async save(state: ProgressState) {
    this.saved.push(state);
  }
}

const NOW = 1_000_000_000_000;

describe('QuizService', () => {
  let quiz: QuizService;
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProgressStore, useValue: store },
        { provide: ExpressionService, useValue: { expressions: () => [1, 2, 3].map((id) => testExpression(id)) } },
      ],
    });
    quiz = TestBed.inject(QuizService);
    quiz.now = () => NOW;
    quiz.rng = seededRng();
  });

  it('builds a session with 4 options per question', () => {
    expect(quiz.start({ size: 2 })).toBe(2);
    expect(quiz.queue().length).toBe(2);
    expect(quiz.current()?.options.length).toBe(4);
  });

  it('records a correct first attempt and saves progress', () => {
    quiz.start({ size: 1 });
    const id = quiz.current()!.expression.id;
    quiz.answer('på');

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

  it('keeps re-asking until the item is answered correctly', () => {
    quiz.start({ size: 1 });
    quiz.answer('i');
    quiz.next();
    quiz.answer('til');
    quiz.next();
    expect(quiz.finished()).toBe(false);
    expect(quiz.current()?.retry).toBe(true);
  });

  it('stores a session record when finished', () => {
    quiz.start({ size: 2 });
    quiz.answer('på');
    quiz.next();
    quiz.answer('på');
    quiz.next();

    expect(quiz.finished()).toBe(true);
    expect(quiz.progress().sessions).toEqual([{ date: NOW, total: 2, correct: 2 }]);
    expect(store.saved.at(-1)?.sessions.length).toBe(1);
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
});
