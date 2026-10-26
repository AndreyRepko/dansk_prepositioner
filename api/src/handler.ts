import { timingSafeEqual } from 'node:crypto';
import { cleanName, nameKey } from './names.js';
import { ProgressRepo } from './progress-repo.js';

/** Real progress for 230 expressions is ~30K chars; this leaves plenty of room. */
export const MAX_BODY_CHARS = 200_000;

/** The app sends SHA-256(password + name key) as lowercase hex. */
const HASH = /^[0-9a-f]{64}$/;

export interface Reply {
  status: number;
  body?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Shape check only; the app validates entries in detail when it loads progress. */
function isProgress(v: unknown): boolean {
  return isObject(v) && v['version'] === 1 && isObject(v['items']) && Array.isArray(v['sessions']);
}

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The password only keeps a name from being reused by accident; it is not meant as real security.
 * A name saved before passwords existed is claimed by the first password used with it.
 */
export async function handleProgress(
  method: string,
  rawName: string | undefined,
  body: string | undefined,
  passwordHash: string | null | undefined,
  repo: ProgressRepo,
): Promise<Reply> {
  const name = cleanName(rawName ?? '');
  if (!name) return { status: 400, body: JSON.stringify({ error: 'invalid name' }) };
  if (method !== 'GET' && method !== 'PUT') return { status: 405 };
  if (!passwordHash || !HASH.test(passwordHash)) {
    return { status: 401, body: JSON.stringify({ error: 'missing password' }) };
  }
  const key = nameKey(name);
  const stored = await repo.get(key);
  if (stored?.passwordHash !== undefined && !sameHash(stored.passwordHash, passwordHash)) {
    return { status: 403, body: JSON.stringify({ error: 'wrong password' }) };
  }

  if (method === 'GET') {
    if (stored === null) return { status: 404 };
    if (stored.passwordHash === undefined) await repo.put(key, name, stored.json, passwordHash);
    return { status: 200, body: stored.json };
  }

  if (!body) return { status: 400, body: JSON.stringify({ error: 'missing body' }) };
  if (body.length > MAX_BODY_CHARS) return { status: 413 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, body: JSON.stringify({ error: 'body is not JSON' }) };
  }
  if (!isProgress(parsed)) return { status: 400, body: JSON.stringify({ error: 'not progress data' }) };
  await repo.put(key, name, JSON.stringify(parsed), passwordHash);
  return { status: 204 };
}
