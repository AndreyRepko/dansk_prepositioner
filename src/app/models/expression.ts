export type Category =
  | 'tillægsord'
  | 'udsagnsord'
  | 'navneord'
  | 'tid'
  | 'sted'
  | 'faste vendinger';

/** A sentence with exactly one gap written as `___`, and three wrong options for it. */
export interface Sentence {
  saetning: string;
  forkerte: string[];
}

/** One fixed expression, mirrors an item of `udtryk` in data/praepositioner.json. */
export interface Expression extends Sentence {
  id: number;
  udtryk: string;
  praeposition: string;
  /** More sentences with the same expression (same answer, their own wrong options). */
  flere_saetninger: Sentence[];
  forklaring: string;
  ukrainsk: string;
  engelsk: string;
  kategori: Category;
  mine_fejl: boolean;
}

export interface ExpressionFile {
  titel: string;
  antal: number;
  udtryk: Expression[];
}

export const GAP = '___';

/** The answer "Ved ikke" (don't know): counted as wrong, shown with the right answer. */
export const DONT_KNOW = 'ved ikke';

/** All sentences of an expression; index 0 is `saetning`, progress refers to them by index. */
export function sentencesOf(e: Expression): Sentence[] {
  return [{ saetning: e.saetning, forkerte: e.forkerte }, ...(e.flere_saetninger ?? [])];
}
