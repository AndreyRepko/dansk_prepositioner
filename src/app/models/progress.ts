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
  /** Answers per sentence, keyed by index in `sentencesOf` (absent in older progress). */
  sentences?: Record<number, SentenceProgress>;
  /** How often each wrong option was chosen (retries within a session are not recorded). */
  confusions?: Record<string, number>;
  /** How often "Ved ikke" was answered (also counted in `wrong`, not in `confusions`). */
  dontKnow?: number;
}

export interface SentenceProgress {
  seen: number;
  correct: number;
  /** Epoch ms of the last answer on this sentence. */
  lastSeen: number;
  /** The first answer on this sentence was right: the expression was known, not the sentence. */
  first: boolean;
  /** The latest answer on this sentence was right. */
  last: boolean;
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
  /** Ids of guest progress already added to this account (see QuizService.signInAs), newest last. */
  merged?: string[];
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

function isSentenceProgress(v: unknown): v is SentenceProgress {
  return (
    isObject(v) &&
    ['seen', 'correct', 'lastSeen'].every((k) => isNum(v[k])) &&
    typeof v['first'] === 'boolean' &&
    typeof v['last'] === 'boolean'
  );
}

/**
 * The item with malformed `sentences` / `confusions` entries dropped (and empty maps, or a
 * `dontKnow` that is not a positive count, left out).
 */
function parseItem(item: ItemProgress): ItemProgress {
  const { sentences, confusions, dontKnow, ...rest } = item as ItemProgress &
    Record<string, unknown>;
  const s = isObject(sentences)
    ? Object.entries(sentences).filter(
        ([k, v]) => /^(0|[1-9]\d*)$/.test(k) && isSentenceProgress(v),
      )
    : [];
  const c = isObject(confusions)
    ? Object.entries(confusions).filter(([, n]) => isNum(n) && n > 0)
    : [];
  return {
    ...rest,
    ...(s.length > 0 && { sentences: Object.fromEntries(s) }),
    ...(c.length > 0 && { confusions: Object.fromEntries(c) }),
    ...(isNum(dontKnow) && dontKnow > 0 && { dontKnow }),
  };
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
  const merged = raw['merged'];
  return {
    version: 1,
    items: Object.fromEntries(
      Object.entries(items)
        .filter((entry): entry is [string, ItemProgress] => isItemProgress(entry[1]))
        .map(([id, item]) => [id, parseItem(item)]),
    ),
    sessions: sessions.filter(isSessionRecord),
    ...(Array.isArray(merged) && {
      merged: merged.filter((id): id is string => typeof id === 'string'),
    }),
  };
}

/** Older sessions are dropped so saved progress stays small (Table Storage row limit). */
export const MAX_SESSIONS = 200;
/** Merge ids kept per account; only the most recent ones matter (a retried sign-in). */
export const MAX_MERGED = 20;

export const isEmptyProgress = (p: ProgressState) => Object.keys(p.items).length === 0 && p.sessions.length === 0;

/**
 * Combines two separate histories (guest practice added to an account `a`): per expression the
 * newer answer decides box and due date, and answer counts add up (per sentence and per wrong
 * option too); sessions are interleaved by date. The merge ids of `a` are kept.
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
    items[id] = withDetails(
      {
        ...newer,
        seen: ours.seen + theirs.seen,
        correct: ours.correct + theirs.correct,
        wrong: ours.wrong + theirs.wrong,
      },
      mergeSentences(ours.sentences ?? {}, theirs.sentences ?? {}),
      addCounts(ours.confusions ?? {}, theirs.confusions ?? {}, 1),
      (ours.dontKnow ?? 0) + (theirs.dontKnow ?? 0),
    );
  }
  const sessions = [...a.sessions, ...b.sessions].sort((x, y) => x.date - y.date).slice(-MAX_SESSIONS);
  return { version: 1, items, sessions, ...(a.merged && { merged: a.merged }) };
}

/** `item` with these sentence and confusion maps and "Ved ikke" count, left out when empty. */
function withDetails(
  item: ItemProgress,
  sentences: Record<number, SentenceProgress>,
  confusions: Record<string, number>,
  dontKnow: number,
): ItemProgress {
  const { sentences: _s, confusions: _c, dontKnow: _d, ...rest } = item;
  return {
    ...rest,
    ...(Object.keys(sentences).length > 0 && { sentences }),
    ...(Object.keys(confusions).length > 0 && { confusions }),
    ...(dontKnow > 0 && { dontKnow }),
  };
}

/**
 * Per sentence the counts add up and the newer answer sets `last`; `a` (the account) keeps its
 * `first`.
 */
function mergeSentences(
  a: Record<number, SentenceProgress>,
  b: Record<number, SentenceProgress>,
): Record<number, SentenceProgress> {
  const result = { ...a };
  for (const [key, theirs] of Object.entries(b) as unknown as [number, SentenceProgress][]) {
    const ours = result[key];
    if (!ours) {
      result[key] = theirs;
      continue;
    }
    const newer = theirs.lastSeen > ours.lastSeen ? theirs : ours;
    result[key] = {
      seen: ours.seen + theirs.seen,
      correct: ours.correct + theirs.correct,
      lastSeen: newer.lastSeen,
      first: ours.first,
      last: newer.last,
    };
  }
  return result;
}

/**
 * Sentences answered since `then`, with only the answers since counted. Their first answer on a
 * sentence answered before `then` is unknown: guessed right if any was, so `first` never claims a
 * right answer that is not counted.
 */
function sentencesSince(
  now: Record<number, SentenceProgress>,
  then: Record<number, SentenceProgress>,
): Record<number, SentenceProgress> {
  const result: Record<number, SentenceProgress> = {};
  for (const [key, n] of Object.entries(now) as unknown as [number, SentenceProgress][]) {
    const t = then[key];
    if (!t) result[key] = n;
    else if (n.lastSeen > t.lastSeen && n.seen > t.seen) {
      const correct = Math.max(0, n.correct - t.correct);
      result[key] = { ...n, seen: n.seen - t.seen, correct, first: correct > 0 };
    }
  }
  return result;
}

/** `a` plus (`sign` 1) or minus (`sign` -1) `b` per key; keys that drop to 0 or below are left out. */
function addCounts(
  a: Record<string, number>,
  b: Record<string, number>,
  sign: 1 | -1,
): Record<string, number> {
  const result = { ...a };
  for (const [key, n] of Object.entries(b)) result[key] = (result[key] ?? 0) + sign * n;
  return Object.fromEntries(Object.entries(result).filter(([, n]) => n > 0));
}

const sameSession = (x: SessionRecord, y: SessionRecord) =>
  x.date === y.date && x.total === y.total && x.correct === y.correct;

/**
 * What `current` holds beyond `snapshot`, an earlier copy of the same history: items answered since
 * (with only the answers since counted) and sessions not in the snapshot.
 */
export function progressSince(current: ProgressState, snapshot: ProgressState): ProgressState {
  const items: Record<number, ItemProgress> = {};
  for (const [id, now] of Object.entries(current.items) as unknown as [number, ItemProgress][]) {
    const then = snapshot.items[id];
    if (!then) {
      items[id] = now;
    } else if (now.lastSeen > then.lastSeen) {
      items[id] = withDetails(
        {
          ...now,
          seen: Math.max(0, now.seen - then.seen),
          correct: Math.max(0, now.correct - then.correct),
          wrong: Math.max(0, now.wrong - then.wrong),
        },
        sentencesSince(now.sentences ?? {}, then.sentences ?? {}),
        addCounts(now.confusions ?? {}, then.confusions ?? {}, -1),
        (now.dontKnow ?? 0) - (then.dontKnow ?? 0),
      );
    }
  }
  const sessions = current.sessions.filter(
    (s) => !snapshot.sessions.some((t) => sameSession(s, t)),
  );
  return { version: 1, items, sessions };
}
