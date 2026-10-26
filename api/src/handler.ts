import { cleanName, nameKey } from './names.js';
import { ProgressRepo } from './progress-repo.js';

/** Real progress for 230 expressions is ~30K chars; this leaves plenty of room. */
export const MAX_BODY_CHARS = 200_000;

export interface Reply {
  status: number;
  body?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Shape check only; the app validates entries in detail when it loads progress. */
function isProgress(v: unknown): boolean {
  return isObject(v) && v['version'] === 1 && isObject(v['items']) && Array.isArray(v['sessions']);
}

export async function handleProgress(
  method: string,
  rawName: string | undefined,
  body: string | undefined,
  repo: ProgressRepo,
): Promise<Reply> {
  const name = cleanName(rawName ?? '');
  if (!name) return { status: 400, body: JSON.stringify({ error: 'invalid name' }) };
  const key = nameKey(name);

  if (method === 'GET') {
    const json = await repo.get(key);
    return json === null ? { status: 404 } : { status: 200, body: json };
  }

  if (method === 'PUT') {
    if (!body) return { status: 400, body: JSON.stringify({ error: 'missing body' }) };
    if (body.length > MAX_BODY_CHARS) return { status: 413 };
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { status: 400, body: JSON.stringify({ error: 'body is not JSON' }) };
    }
    if (!isProgress(parsed)) return { status: 400, body: JSON.stringify({ error: 'not progress data' }) };
    await repo.put(key, name, JSON.stringify(parsed));
    return { status: 204 };
  }

  return { status: 405 };
}
