import { Expression } from '../models/expression';
import { ItemProgress } from '../models/progress';

export function testExpression(id: number, overrides: Partial<Expression> = {}): Expression {
  return {
    id,
    udtryk: `udtryk ${id}`,
    praeposition: 'på',
    saetning: `Sætning ${id} ___ slut.`,
    forkerte: ['i', 'til', 'om'],
    forklaring: 'forklaring',
    ukrainsk: 'переклад',
    kategori: 'udsagnsord',
    mine_fejl: false,
    ...overrides,
  };
}

export function testProgress(overrides: Partial<ItemProgress> = {}): ItemProgress {
  return { box: 2, seen: 1, correct: 1, wrong: 0, lastSeen: 0, due: 0, ...overrides };
}

/** Deterministic pseudo-random generator for shuffles. */
export function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
