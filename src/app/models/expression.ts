export type Category =
  | 'tillægsord'
  | 'udsagnsord'
  | 'navneord'
  | 'tid'
  | 'sted'
  | 'faste vendinger';

/** One fixed expression, mirrors an item of `udtryk` in data/praepositioner.json. */
export interface Expression {
  id: number;
  udtryk: string;
  praeposition: string;
  /** Sentence with exactly one gap written as `___`. */
  saetning: string;
  forkerte: string[];
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
