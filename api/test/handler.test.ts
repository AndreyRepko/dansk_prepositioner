import { describe, expect, it } from 'vitest';
import { handleProgress, MAX_BODY_CHARS } from '../src/handler.js';
import { ProgressRepo } from '../src/progress-repo.js';

class MemoryRepo implements ProgressRepo {
  rows = new Map<string, { name: string; json: string }>();
  async get(key: string) {
    return this.rows.get(key)?.json ?? null;
  }
  async put(key: string, name: string, json: string) {
    this.rows.set(key, { name, json });
  }
}

const progress = { version: 1, items: { 1: { box: 2, seen: 1, correct: 1, wrong: 0, lastSeen: 1, due: 2 } }, sessions: [] };

describe('handleProgress', () => {
  it('returns 404 for an unknown name', async () => {
    expect(await handleProgress('GET', 'Andrii', undefined, new MemoryRepo())).toEqual({ status: 404 });
  });

  it('stores and returns progress, case-insensitively by name', async () => {
    const repo = new MemoryRepo();
    expect(await handleProgress('PUT', '  Andrii ', JSON.stringify(progress), repo)).toEqual({ status: 204 });
    expect(repo.rows.get('andrii')?.name).toBe('Andrii');

    const reply = await handleProgress('GET', 'ANDRII', undefined, repo);
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body!)).toEqual(progress);
  });

  it('keeps names apart', async () => {
    const repo = new MemoryRepo();
    await handleProgress('PUT', 'Andrii', JSON.stringify(progress), repo);
    expect((await handleProgress('GET', 'Olena', undefined, repo)).status).toBe(404);
  });

  it.each(['', ' ', '.hidden', 'a/b', 'a#b', 'what?', 'x'.repeat(31), 'bell\u0007'])(
    'rejects the name %j',
    async (name) => {
      expect((await handleProgress('GET', name, undefined, new MemoryRepo())).status).toBe(400);
    },
  );

  it.each(['Andrii', 'Søren Ærø', 'Олена', "O'Neil", 'anna-2', 'x'.repeat(30)])('accepts the name %j', async (name) => {
    expect((await handleProgress('GET', name, undefined, new MemoryRepo())).status).toBe(404);
  });

  it.each([
    ['missing body', undefined],
    ['not JSON', '{nope'],
    ['wrong version', JSON.stringify({ ...progress, version: 2 })],
    ['items missing', JSON.stringify({ version: 1, sessions: [] })],
    ['sessions not an array', JSON.stringify({ version: 1, items: {}, sessions: {} })],
  ])('rejects a PUT with %s', async (_, body) => {
    const repo = new MemoryRepo();
    expect((await handleProgress('PUT', 'Andrii', body, repo)).status).toBe(400);
    expect(repo.rows.size).toBe(0);
  });

  it('rejects an oversized body', async () => {
    const body = JSON.stringify({ ...progress, padding: 'x'.repeat(MAX_BODY_CHARS) });
    expect((await handleProgress('PUT', 'Andrii', body, new MemoryRepo())).status).toBe(413);
  });

  it('rejects other methods', async () => {
    expect((await handleProgress('DELETE', 'Andrii', undefined, new MemoryRepo())).status).toBe(405);
  });
});
