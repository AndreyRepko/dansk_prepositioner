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

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isItemProgress(v: unknown): v is ItemProgress {
  return (
    isObject(v) &&
    Number.isInteger(v['box']) &&
    (v['box'] as number) >= 0 &&
    (v['box'] as number) <= 5 &&
    ['seen', 'correct', 'wrong', 'lastSeen', 'due'].every((k) => isNum(v[k]))
  );
}

function isSessionRecord(v: unknown): v is SessionRecord {
  return isObject(v) && ['date', 'total', 'correct'].every((k) => isNum(v[k]));
}

/**
 * Validates persisted progress. Returns null when the shape is not recognised
 * (the caller decides what to do with the raw data); malformed single entries
 * are dropped. Future schema migrations belong here.
 */
export function parseProgress(raw: unknown): ProgressState | null {
  if (!isObject(raw) || raw['version'] !== 1) return null;
  const { items, sessions } = raw;
  if (!isObject(items) || !Array.isArray(sessions)) return null;
  return {
    version: 1,
    items: Object.fromEntries(
      Object.entries(items).filter((entry): entry is [string, ItemProgress] => isItemProgress(entry[1])),
    ),
    sessions: sessions.filter(isSessionRecord),
  };
}

/** Older sessions are dropped so saved progress stays small (Table Storage row limit). */
export const MAX_SESSIONS = 200;

export const isEmptyProgress = (p: ProgressState) => Object.keys(p.items).length === 0 && p.sessions.length === 0;

/**
 * Combines two separate histories (guest practice added to an account): per expression the
 * newer answer decides box and due date, and answer counts add up; sessions are interleaved by date.
 */
export function mergeProgress(a: ProgressState, b: ProgressState): ProgressState {
  const items: Record<number, ItemProgress> = { ...a.items };
  for (const [id, theirs] of Object.entries(b.items) as unknown as [number, ItemProgress][]) {
    const ours = items[id];
    if (!ours) {
      items[id] = theirs;
      continue;
    }
    const newer = theirs.lastSeen > ours.lastSeen ? theirs : ours;
    items[id] = {
      ...newer,
      seen: ours.seen + theirs.seen,
      correct: ours.correct + theirs.correct,
      wrong: ours.wrong + theirs.wrong,
    };
  }
  const sessions = [...a.sessions, ...b.sessions].sort((x, y) => x.date - y.date).slice(-MAX_SESSIONS);
  return { version: 1, items, sessions };
}
