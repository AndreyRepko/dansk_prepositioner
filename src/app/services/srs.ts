import { Category, DONT_KNOW, Expression, Sentence, sentencesOf } from '../models/expression';
import { Box, ItemProgress, ProgressState, SentenceProgress } from '../models/progress';

export type Rng = () => number;

const DAY = 24 * 60 * 60 * 1000;

/** Delay until an item in a given box is due again. Box 1 is due immediately. */
export const BOX_INTERVALS: Record<Box, number> = {
  0: 0,
  1: 0,
  2: 1 * DAY,
  3: 3 * DAY,
  4: 7 * DAY,
  5: 21 * DAY,
};

/** Items in this box or higher count as mastered. */
export const MASTERED_BOX: Box = 4;

/** An item reaches `MASTERED_BOX` only once this many different sentences are known. */
export const MIN_SENTENCES_FOR_MASTERY = 3;

/** Highest tier (★★★): every sentence known. */
export const MAX_TIER = 3;

export interface SessionFilter {
  category?: Category;
  onlyMineFejl?: boolean;
}

/**
 * Records one answer on sentence `sentence` (`chosen`: the option picked, for the confusion counts;
 * `DONT_KNOW` counts as a wrong answer, but as "Ved ikke", not as a confusion).
 * A wrong answer always sends the item back to box 1.
 * A correct answer only promotes an item that was due; answering a not-yet-due
 * item (session filler) correctly keeps its box and due date, so repeating
 * sessions cannot fast-track items to "mastered". Nor can one sentence learnt by heart:
 * the item cannot move up into `MASTERED_BOX` until `MIN_SENTENCES_FOR_MASTERY` sentences are
 * known (items already there, from before sentences were counted, keep their box).
 */
export function applyAnswer(
  progress: ItemProgress | undefined,
  correct: boolean,
  now: number,
  sentence = 0,
  chosen?: string,
): ItemProgress {
  const prev = progress ?? { box: 0, seen: 0, correct: 0, wrong: 0, lastSeen: 0, due: 0 };
  const wasDue = prev.box === 0 || prev.due <= now;
  const before = withUntracked(prev)[sentence];
  const sentences = {
    ...prev.sentences,
    [sentence]: {
      seen: (before?.seen ?? 0) + 1,
      correct: (before?.correct ?? 0) + (correct ? 1 : 0),
      lastSeen: now,
      first: before ? before.first : correct,
      last: correct,
    },
  };
  const confusions =
    correct || chosen === undefined || chosen === DONT_KNOW
      ? prev.confusions
      : { ...prev.confusions, [chosen]: (prev.confusions?.[chosen] ?? 0) + 1 };
  const dontKnow = (prev.dontKnow ?? 0) + (chosen === DONT_KNOW ? 1 : 0);
  const counts = {
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    lastSeen: now,
    sentences,
    ...(confusions && { confusions }),
    ...(dontKnow > 0 && { dontKnow }),
  };
  if (correct && !wasDue) return { ...counts, box: prev.box, due: prev.due };
  // Box 1 is reserved for recent mistakes, so a correct answer lands in box 2 or higher.
  let box: Box = correct ? (Math.min(Math.max(prev.box + 1, 2), 5) as Box) : 1;
  if (box >= MASTERED_BOX && countKnown(sentences) < MIN_SENTENCES_FOR_MASTERY) {
    box = Math.max(prev.box, MASTERED_BOX - 1) as Box;
  }
  return { box, ...counts, due: now + BOX_INTERVALS[box] };
}

/**
 * `progress.sentences`, plus sentence 0 for the answers given before sentences were tracked (they
 * were all on sentence 0), so they count as seen before rather than as a first answer later.
 */
function withUntracked(progress: ItemProgress): Record<number, SentenceProgress> {
  const sentences = progress.sentences ?? {};
  const tracked = Object.values(sentences);
  const seen = progress.seen - tracked.reduce((n, s) => n + s.seen, 0);
  if (sentences[0] || seen <= 0) return sentences;
  const right = progress.correct - tracked.reduce((n, s) => n + s.correct, 0);
  const correct = Math.min(Math.max(right, 0), seen);
  // When they started is unknown: guess the first one right if any was, and the oldest of all.
  return { ...sentences, 0: { seen, correct, lastSeen: 0, first: correct > 0, last: false } };
}

/** Number of sentences whose latest answer was right, of the first `sentenceCount`. */
export function knownSentences(progress: ItemProgress | undefined, sentenceCount = Infinity): number {
  return countKnown(progress?.sentences, sentenceCount);
}

const countKnown = (sentences: Record<number, SentenceProgress> = {}, sentenceCount = Infinity) =>
  Object.entries(sentences).filter(([i, s]) => Number(i) < sentenceCount && s.last).length;

/**
 * Stars on top of mastered: 0 until mastered, then one per sentence known beyond
 * `MIN_SENTENCES_FOR_MASTERY` (with 6 sentences: ★ 4, ★★ 5, ★★★ all 6).
 * With fewer sentences the top tier still means "all of them".
 */
export function tier(progress: ItemProgress | undefined, sentenceCount: number): number {
  if (!isMastered(progress)) return 0;
  const known = knownSentences(progress, sentenceCount);
  if (known >= sentenceCount) return MAX_TIER;
  return Math.min(Math.max(known - MIN_SENTENCES_FOR_MASTERY, 0), MAX_TIER - 1);
}

/**
 * Which sentence to ask: one never answered (random among them), otherwise the one answered
 * longest ago, so each review shows another sentence than the last one.
 */
export function pickSentence(
  expression: Expression,
  progress: ItemProgress | undefined,
  rng: Rng = Math.random,
): number {
  const indexes = sentencesOf(expression).map((_, i) => i);
  const answered = progress ? withUntracked(progress) : {};
  const unseen = indexes.filter((i) => !answered[i]);
  if (unseen.length > 0) return unseen[Math.floor(rng() * unseen.length)];
  return indexes.reduce((oldest, i) =>
    answered[i].lastSeen < answered[oldest].lastSeen ? i : oldest,
  );
}

/**
 * Picks up to `size` expressions, in priority order:
 * 1. due items from box 1 (recent mistakes), earliest due first
 * 2. other due items, lowest box first
 * 3. new items, `mine_fejl` first
 * 4. not-yet-due items, least recently seen first (filler)
 * The picked set is shuffled so the order does not reveal the priority.
 */
export function selectSession(
  expressions: Expression[],
  state: ProgressState,
  size: number,
  filter: SessionFilter,
  now: number,
  rng: Rng = Math.random,
): Expression[] {
  const pool = expressions.filter(
    (e) =>
      (!filter.category || e.kategori === filter.category) && (!filter.onlyMineFejl || e.mine_fejl),
  );

  const learning: Expression[] = [];
  const due: Expression[] = [];
  const fresh: Expression[] = [];
  const later: Expression[] = [];
  for (const e of pool) {
    const p = state.items[e.id];
    if (!p || p.box === 0) fresh.push(e);
    else if (p.due > now) later.push(e);
    else if (p.box === 1) learning.push(e);
    else due.push(e);
  }

  const prog = (e: Expression) => state.items[e.id];
  learning.sort((a, b) => prog(a).due - prog(b).due);
  due.sort((a, b) => prog(a).box - prog(b).box || prog(a).due - prog(b).due);
  // Shuffle new items first so ties within the mine_fejl groups are random.
  shuffle(fresh, rng).sort((a, b) => Number(b.mine_fejl) - Number(a.mine_fejl));
  later.sort((a, b) => prog(a).lastSeen - prog(b).lastSeen);

  return shuffle([...learning, ...due, ...fresh, ...later].slice(0, size), rng);
}

/** A random sentence other than `current` (`current` itself when there is no other). */
export function otherSentence(
  expression: Expression,
  current: number,
  rng: Rng = Math.random,
): number {
  const others = sentencesOf(expression)
    .map((_, i) => i)
    .filter((i) => i !== current);
  return others.length > 0 ? others[Math.floor(rng() * others.length)] : current;
}

/** The correct answer plus the sentence's wrong options, shuffled. */
export function buildOptions(answer: string, sentence: Sentence, rng: Rng = Math.random): string[] {
  return shuffle([answer, ...sentence.forkerte], rng);
}

/** Fisher-Yates in place; returns the same array. */
export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function isMastered(progress: ItemProgress | undefined): boolean {
  return !!progress && progress.box >= MASTERED_BOX;
}
