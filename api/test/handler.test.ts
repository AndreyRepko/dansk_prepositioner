import { describe, expect, it } from 'vitest';
import { handleProgress, MAX_BODY_CHARS } from '../src/handler.js';
import { ProgressRepo, RowConflictError, StoredProgress } from '../src/progress-repo.js';

type Row = { name: string; json: string; passwordHash?: string; etag: string };

class MemoryRepo implements ProgressRepo {
  rows = new Map<string, Row>();
  puts = 0;
  claims = 0;
  private version = 0;
  /** Runs between the handler's read and its write, like another request would. */
  beforeWrite?: () => void;
  set(key: string, row: Omit<Row, 'etag'>) {
    this.rows.set(key, { ...row, etag: `v${++this.version}` });
  }
  async get(key: string): Promise<StoredProgress | null> {
    const row = this.rows.get(key);
    if (!row) return null;
    const { json, passwordHash, etag } = row;
    return passwordHash === undefined ? { json, etag } : { json, passwordHash, etag };
  }
  async put(
    key: string,
    name: string,
    json: string,
    passwordHash: string,
    expected?: string | null,
  ) {
    this.check(key, expected);
    this.puts++;
    this.set(key, { name, json, passwordHash });
  }
  async claim(key: string, passwordHash: string, etag: string) {
    this.check(key, etag);
    this.claims++;
    this.set(key, { ...this.rows.get(key)!, passwordHash });
  }
  private check(key: string, expected: string | null | undefined) {
    this.beforeWrite?.();
    this.beforeWrite = undefined;
    if (expected !== undefined && (this.rows.get(key)?.etag ?? null) !== expected) {
      throw new RowConflictError(key);
    }
  }
}

const progress = { version: 1, items: { 1: { box: 2, seen: 1, correct: 1, wrong: 0, lastSeen: 1, due: 2 } }, sessions: [] };
const PW = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('handleProgress', () => {
  it('returns 404 for an unknown name', async () => {
    expect(await handleProgress('GET', 'Andrii', undefined, PW, new MemoryRepo())).toEqual({ status: 404 });
  });

  it('stores and returns progress, case-insensitively by name', async () => {
    const repo = new MemoryRepo();
    expect(await handleProgress('PUT', '  Andrii ', JSON.stringify(progress), PW, repo)).toEqual({ status: 204 });
    expect(repo.rows.get('andrii')).toMatchObject({ name: 'Andrii', passwordHash: PW });

    const reply = await handleProgress('GET', 'ANDRII', undefined, PW, repo);
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body!)).toEqual(progress);
  });

  it('keeps names apart', async () => {
    const repo = new MemoryRepo();
    await handleProgress('PUT', 'Andrii', JSON.stringify(progress), PW, repo);
    expect((await handleProgress('GET', 'Olena', undefined, PW, repo)).status).toBe(404);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'a'.repeat(63)],
    ['not hex', 'g'.repeat(64)],
    ['upper case', 'A'.repeat(64)],
  ])('rejects a %s password hash', async (_, hash) => {
    const repo = new MemoryRepo();
    expect((await handleProgress('GET', 'Andrii', undefined, hash, repo)).status).toBe(401);
    expect((await handleProgress('PUT', 'Andrii', JSON.stringify(progress), hash, repo)).status).toBe(401);
    expect(repo.rows.size).toBe(0);
  });

  it('rejects a wrong password without changing anything', async () => {
    const repo = new MemoryRepo();
    await handleProgress('PUT', 'Andrii', JSON.stringify(progress), PW, repo);
    expect((await handleProgress('GET', 'andrii', undefined, OTHER, repo)).status).toBe(403);
    const empty = JSON.stringify({ version: 1, items: {}, sessions: [] });
    expect((await handleProgress('PUT', 'andrii', empty, OTHER, repo)).status).toBe(403);
    expect(repo.rows.get('andrii')).toMatchObject({ json: JSON.stringify(progress), passwordHash: PW });
  });

  it('lets the first password used claim a name saved before passwords existed (GET)', async () => {
    const repo = new MemoryRepo();
    repo.set('andrii', { name: 'Andrii', json: JSON.stringify(progress) });
    const reply = await handleProgress('GET', 'Andrii', undefined, PW, repo);
    expect(JSON.parse(reply.body!)).toEqual(progress);
    expect(repo.rows.get('andrii')?.passwordHash).toBe(PW);
    expect(repo).toMatchObject({ claims: 1, puts: 0 }); // only the hash is written
    expect((await handleProgress('GET', 'Andrii', undefined, OTHER, repo)).status).toBe(403);
  });

  it('answers 409 when a new name is created on two devices at once, keeping the first', async () => {
    const repo = new MemoryRepo();
    repo.beforeWrite = () =>
      repo.set('andrii', { name: 'Andrii', json: '{"first":1}', passwordHash: OTHER });
    expect((await handleProgress('PUT', 'Andrii', JSON.stringify(progress), PW, repo)).status).toBe(
      409,
    );
    expect(repo.rows.get('andrii')).toMatchObject({ json: '{"first":1}', passwordHash: OTHER });
  });

  it.each(['GET', 'PUT'])(
    'answers 409 when an old name is claimed on two devices at once (%s)',
    async (method) => {
      const repo = new MemoryRepo();
      repo.set('andrii', { name: 'Andrii', json: '{}' });
      repo.beforeWrite = () =>
        repo.set('andrii', { name: 'Andrii', json: '{}', passwordHash: OTHER });
      const body = method === 'PUT' ? JSON.stringify(progress) : undefined;
      expect((await handleProgress(method, 'Andrii', body, PW, repo)).status).toBe(409);
      expect(repo.rows.get('andrii')?.passwordHash).toBe(OTHER);
    },
  );

  it('a claim on GET does not undo a save made meanwhile', async () => {
    const repo = new MemoryRepo();
    repo.set('andrii', { name: 'Andrii', json: '{}' });
    repo.beforeWrite = () =>
      repo.set('andrii', { name: 'Andrii', json: JSON.stringify(progress), passwordHash: PW });
    expect((await handleProgress('GET', 'Andrii', undefined, PW, repo)).status).toBe(409);
    expect(repo.rows.get('andrii')?.json).toBe(JSON.stringify(progress));
  });

  it('saves over a change made meanwhile once the name has a password (last save wins)', async () => {
    const repo = new MemoryRepo();
    await handleProgress('PUT', 'Andrii', JSON.stringify(progress), PW, repo);
    repo.beforeWrite = () => repo.set('andrii', { name: 'Andrii', json: '{}', passwordHash: PW });
    expect((await handleProgress('PUT', 'Andrii', JSON.stringify(progress), PW, repo)).status).toBe(
      204,
    );
  });

  it('lets the first password used claim a name saved before passwords existed (PUT)', async () => {
    const repo = new MemoryRepo();
    repo.set('andrii', { name: 'Andrii', json: '{}' });
    expect((await handleProgress('PUT', 'Andrii', JSON.stringify(progress), PW, repo)).status).toBe(
      204,
    );
    expect(repo.rows.get('andrii')?.passwordHash).toBe(PW);
  });

  it('does not write on GET once a name has a password', async () => {
    const repo = new MemoryRepo();
    await handleProgress('PUT', 'Andrii', JSON.stringify(progress), PW, repo);
    await handleProgress('GET', 'Andrii', undefined, PW, repo);
    expect(repo).toMatchObject({ puts: 1, claims: 0 });
  });

  it.each(['', ' ', '.hidden', 'a/b', 'a#b', 'what?', 'x'.repeat(31), 'bell\u0007'])(
    'rejects the name %j',
    async (name) => {
      expect((await handleProgress('GET', name, undefined, PW, new MemoryRepo())).status).toBe(400);
    },
  );

  it.each(['Andrii', 'Søren Ærø', 'Олена', "O'Neil", 'anna-2', 'x'.repeat(30)])('accepts the name %j', async (name) => {
    expect((await handleProgress('GET', name, undefined, PW, new MemoryRepo())).status).toBe(404);
  });

  it.each([
    ['missing body', undefined],
    ['not JSON', '{nope'],
    ['wrong version', JSON.stringify({ ...progress, version: 2 })],
    ['items missing', JSON.stringify({ version: 1, sessions: [] })],
    ['sessions not an array', JSON.stringify({ version: 1, items: {}, sessions: {} })],
  ])('rejects a PUT with %s', async (_, body) => {
    const repo = new MemoryRepo();
    expect((await handleProgress('PUT', 'Andrii', body, PW, repo)).status).toBe(400);
    expect(repo.rows.size).toBe(0);
  });

  it('rejects an oversized body', async () => {
    const body = JSON.stringify({ ...progress, padding: 'x'.repeat(MAX_BODY_CHARS) });
    expect((await handleProgress('PUT', 'Andrii', body, PW, new MemoryRepo())).status).toBe(413);
  });

  it('rejects other methods', async () => {
    expect((await handleProgress('DELETE', 'Andrii', undefined, PW, new MemoryRepo())).status).toBe(405);
  });
});
