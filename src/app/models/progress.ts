/** Leitner box: 0 = never answered, 1 = learning ... 5 = long-term. */
export type Box = 0 | 1 | 2 | 3 | 4 | 5;

export interface ItemProgress {
  box: Box;
  seen: number;
  correct: number;
  wrong: number;
  /** Epoch ms of the last answer. */
  lastSeen: number;
  /** Epoch ms when the item is due again. */
  due: number;
}

export interface SessionRecord {
  /** Epoch ms when the session finished. */
  date: number;
  total: number;
  correct: number;
}

export interface ProgressState {
  version: 1;
  items: Record<number, ItemProgress>;
  sessions: SessionRecord[];
}

export function emptyProgress(): ProgressState {
  return { version: 1, items: {}, sessions: [] };
}
