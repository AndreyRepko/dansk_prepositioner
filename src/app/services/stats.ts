import { Category, Expression } from '../models/expression';
import { ProgressState } from '../models/progress';
import { isMastered } from './srs';

export interface Overview {
  total: number;
  fresh: number;
  learning: number;
  mastered: number;
  dueNow: number;
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
  wrong: number;
}

export function overview(expressions: Expression[], state: ProgressState, now: number): Overview {
  const result: Overview = { total: expressions.length, fresh: 0, learning: 0, mastered: 0, dueNow: 0 };
  for (const e of expressions) {
    const p = state.items[e.id];
    if (!p || p.box === 0) {
      result.fresh++;
      continue;
    }
    if (isMastered(p)) result.mastered++;
    else result.learning++;
    if (p.due <= now) result.dueNow++;
  }
  return result;
}

export function totals(state: ProgressState): { answers: number; correct: number } {
  let answers = 0;
  let correct = 0;
  for (const p of Object.values(state.items)) {
    answers += p.seen;
    correct += p.correct;
  }
  return { answers, correct };
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
      return { expression, correct: p?.correct ?? 0, wrong: p?.wrong ?? 0 };
    })
    .filter((i) => i.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.correct / (a.correct + a.wrong) - b.correct / (b.correct + b.wrong))
    .slice(0, limit);
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
