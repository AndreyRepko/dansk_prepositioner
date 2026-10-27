import { Category, Expression, sentencesOf } from '../models/expression';
import { ItemProgress, ProgressState } from '../models/progress';
import { isMastered, knownSentences, MAX_TIER, tier } from './srs';

export interface Overview {
  total: number;
  fresh: number;
  learning: number;
  mastered: number;
  dueNow: number;
  /** Mastered items per tier: `tiers[0]` ★, `tiers[1]` ★★, `tiers[2]` ★★★. */
  tiers: number[];
}

export interface CategoryStats {
  category: Category;
  total: number;
  mastered: number;
  answers: number;
  correct: number;
}

export interface HardItem {
  expression: Expression;
  correct: number;
  /** Wrong answers, "Ved ikke" included. */
  wrong: number;
  dontKnow: number;
  /** Sentences whose latest answer was right, of `sentences`. */
  known: number;
  sentences: number;
  tier: number;
}

/** First answers on sentences never seen before vs. later answers on sentences seen before. */
export interface RecognitionGap {
  newSeen: number;
  newCorrect: number;
  repeatSeen: number;
  repeatCorrect: number;
}

export interface SentenceBoundItem extends RecognitionGap {
  expression: Expression;
}

export interface Confusion {
  answer: string;
  chosen: string;
  count: number;
  /** Up to 3 expressions where it happened, most often first. */
  examples: Expression[];
}

export function overview(expressions: Expression[], state: ProgressState, now: number): Overview {
  const result: Overview = {
    total: expressions.length,
    fresh: 0,
    learning: 0,
    mastered: 0,
    dueNow: 0,
    tiers: Array<number>(MAX_TIER).fill(0),
  };
  for (const e of expressions) {
    const p = state.items[e.id];
    if (!p || p.box === 0) {
      result.fresh++;
      continue;
    }
    if (isMastered(p)) result.mastered++;
    else result.learning++;
    const t = tier(p, sentencesOf(e).length);
    if (t > 0) result.tiers[t - 1]++;
    if (p.due <= now) result.dueNow++;
  }
  return result;
}

/** Answers over the current expressions (progress for removed ids is ignored, as in the other stats). */
export function totals(
  expressions: Expression[],
  state: ProgressState,
): { answers: number; correct: number; dontKnow: number } {
  let answers = 0;
  let correct = 0;
  let dontKnow = 0;
  for (const e of expressions) {
    const p = state.items[e.id];
    if (!p) continue;
    answers += p.seen;
    correct += p.correct;
    dontKnow += p.dontKnow ?? 0;
  }
  return { answers, correct, dontKnow };
}

export function byCategory(expressions: Expression[], state: ProgressState): CategoryStats[] {
  const map = new Map<Category, CategoryStats>();
  for (const e of expressions) {
    let s = map.get(e.kategori);
    if (!s) {
      s = { category: e.kategori, total: 0, mastered: 0, answers: 0, correct: 0 };
      map.set(e.kategori, s);
    }
    const p = state.items[e.id];
    s.total++;
    if (isMastered(p)) s.mastered++;
    s.answers += p?.seen ?? 0;
    s.correct += p?.correct ?? 0;
  }
  return [...map.values()];
}

/** Items with at least one mistake, most mistakes (then worst ratio) first. */
export function hardest(expressions: Expression[], state: ProgressState, limit: number): HardItem[] {
  return expressions
    .map((expression) => {
      const p = state.items[expression.id];
      return {
        expression,
        correct: p?.correct ?? 0,
        wrong: p?.wrong ?? 0,
        dontKnow: p?.dontKnow ?? 0,
        known: knownSentences(p, sentencesOf(expression).length),
        sentences: sentencesOf(expression).length,
        tier: tier(p, sentencesOf(expression).length),
      };
    })
    .filter((i) => i.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.correct / (a.correct + a.wrong) - b.correct / (b.correct + b.wrong))
    .slice(0, limit);
}

function gapOf(p: ItemProgress | undefined): RecognitionGap {
  const gap: RecognitionGap = { newSeen: 0, newCorrect: 0, repeatSeen: 0, repeatCorrect: 0 };
  for (const s of Object.values(p?.sentences ?? {})) {
    gap.newSeen++;
    if (s.first) gap.newCorrect++;
    // Clamped so an inconsistent entry cannot show negative or impossible counts.
    const repeats = Math.max(0, s.seen - 1);
    gap.repeatSeen += repeats;
    gap.repeatCorrect += Math.min(Math.max(0, s.correct - (s.first ? 1 : 0)), repeats);
  }
  return gap;
}

/**
 * Accuracy on sentences seen for the first time vs. seen before. Much better on familiar sentences
 * means sentences are remembered rather than the expression.
 */
export function recognitionGap(expressions: Expression[], state: ProgressState): RecognitionGap {
  const total: RecognitionGap = { newSeen: 0, newCorrect: 0, repeatSeen: 0, repeatCorrect: 0 };
  for (const e of expressions) {
    const gap = gapOf(state.items[e.id]);
    total.newSeen += gap.newSeen;
    total.newCorrect += gap.newCorrect;
    total.repeatSeen += gap.repeatSeen;
    total.repeatCorrect += gap.repeatCorrect;
  }
  return total;
}

/** Answers needed on each side before `familiarMuchBetter` says anything. */
export const MIN_GAP_ANSWERS = 10;

/**
 * More than 15 percentage points (rounded) better on familiar sentences than on new ones, with at
 * least `MIN_GAP_ANSWERS` answers on each side.
 */
export function familiarMuchBetter(g: RecognitionGap): boolean {
  const diff = percent(g.repeatCorrect, g.repeatSeen) - percent(g.newCorrect, g.newSeen);
  return g.newSeen >= MIN_GAP_ANSWERS && g.repeatSeen >= MIN_GAP_ANSWERS && diff > 15;
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

/**
 * Expressions answered better on familiar sentences than on new ones (at least 2 new sentences
 * and one repeat answer), biggest difference first.
 */
export function sentenceBound(
  expressions: Expression[],
  state: ProgressState,
  limit: number,
): SentenceBoundItem[] {
  const diff = (i: RecognitionGap) =>
    ratio(i.repeatCorrect, i.repeatSeen) - ratio(i.newCorrect, i.newSeen);
  return expressions
    .map((expression) => ({ expression, ...gapOf(state.items[expression.id]) }))
    .filter((i) => i.newSeen >= 2 && i.repeatSeen >= 1 && diff(i) > 0)
    .sort((a, b) => diff(b) - diff(a))
    .slice(0, limit);
}

/** Wrong options chosen, per pair of right answer and chosen option, most frequent first. */
export function confusions(
  expressions: Expression[],
  state: ProgressState,
  limit: number,
): Confusion[] {
  type Pair = Omit<Confusion, 'examples'> & { by: [Expression, number][] };
  const pairs = new Map<string, Pair>();
  for (const e of expressions) {
    for (const [chosen, n] of Object.entries(state.items[e.id]?.confusions ?? {})) {
      const key = `${e.praeposition}|${chosen}`;
      let pair = pairs.get(key);
      if (!pair) {
        pair = { answer: e.praeposition, chosen, count: 0, by: [] };
        pairs.set(key, pair);
      }
      pair.count += n;
      pair.by.push([e, n]);
    }
  }
  return [...pairs.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ answer, chosen, count, by }) => ({
      answer,
      chosen,
      count,
      examples: by.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e),
    }));
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
