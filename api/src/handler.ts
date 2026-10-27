import { timingSafeEqual } from 'node:crypto';
import { cleanName, nameKey } from './names.js';
import { ProgressRepo, RowConflictError } from './progress-repo.js';

/**
 * Real progress for 230 expressions is ~30K chars, up to ~155K with answers on every sentence.
 * Stored as UTF-16 that is ~800 KB at this limit, under the 1 MiB Table entity limit: keep it so.
 */
export const MAX_BODY_CHARS = 400_000;

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
 * A name saved before passwords existed is claimed by the first password used with it. Creating
 * and claiming a name only succeed if nobody else did so meanwhile (409 otherwise).
 */
export async function handleProgress(
  method: string,
  rawName: string | undefined,
  body: string | undefined,
  passwordHash: string | null | undefined,
  repo: ProgressRepo,
): Promise<Reply> {
  try {
    return await handle(method, rawName, body, passwordHash, repo);
  } catch (e) {
    if (e instanceof RowConflictError)
      return { status: 409, body: JSON.stringify({ error: 'conflict' }) };
    throw e;
  }
}

async function handle(
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
    if (stored.passwordHash === undefined) await repo.claim(key, passwordHash, stored.etag);
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
  // A new or unclaimed name is written only if nobody took it meanwhile.
  const expected =
    stored === null ? null : stored.passwordHash === undefined ? stored.etag : undefined;
  await repo.put(key, name, JSON.stringify(parsed), passwordHash, expected);
  return { status: 204 };
}
