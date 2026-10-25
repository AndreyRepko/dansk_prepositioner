import { Category, Expression } from '../models/expression';
import { Box, ItemProgress, ProgressState } from '../models/progress';

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

export interface SessionFilter {
  category?: Category;
  onlyMineFejl?: boolean;
}

/**
 * Records one answer. A wrong answer always sends the item back to box 1.
 * A correct answer only promotes an item that was due; answering a not-yet-due
 * item (session filler) correctly keeps its box and due date, so repeating
 * sessions cannot fast-track items to "mastered".
 */
export function applyAnswer(
  progress: ItemProgress | undefined,
  correct: boolean,
  now: number,
): ItemProgress {
  const prev = progress ?? { box: 0, seen: 0, correct: 0, wrong: 0, lastSeen: 0, due: 0 };
  const wasDue = prev.box === 0 || prev.due <= now;
  const counts = {
    seen: prev.seen + 1,
    correct: prev.correct + (correct ? 1 : 0),
    wrong: prev.wrong + (correct ? 0 : 1),
    lastSeen: now,
  };
  if (correct && !wasDue) return { ...counts, box: prev.box, due: prev.due };
  // Box 1 is reserved for recent mistakes, so a correct answer lands in box 2 or higher.
  const box: Box = correct ? (Math.min(Math.max(prev.box + 1, 2), 5) as Box) : 1;
  return { box, ...counts, due: now + BOX_INTERVALS[box] };
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

/** The correct answer plus all wrong options, shuffled. */
export function buildOptions(expression: Expression, rng: Rng = Math.random): string[] {
  return shuffle([expression.praeposition, ...expression.forkerte], rng);
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
