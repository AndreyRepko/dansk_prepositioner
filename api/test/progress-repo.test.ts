import { describe, expect, it } from 'vitest';
import {
  CHUNK_CHARS,
  RowConflictError,
  TableLike,
  TableProgressRepo,
} from '../src/progress-repo.js';

type Entity = Record<string, unknown> & { partitionKey: string; rowKey: string };
const fail = (statusCode: number) =>
  Object.assign(new Error(`status ${statusCode}`), { statusCode });

/** Behaves like Table Storage for the calls the repo makes, ETags included. */
class FakeTable implements TableLike {
  entities = new Map<string, Record<string, unknown>>();
  createCalls = 0;
  private version = 0;
  async createTable() {
    this.createCalls++;
  }
  async getEntity<T extends object>(partitionKey: string, rowKey: string): Promise<T> {
    const e = this.entities.get(`${partitionKey}|${rowKey}`);
    if (!e) throw fail(404);
    return { ...e } as T;
  }
  async upsertEntity(entity: Entity) {
    this.store(entity);
  }
  async createEntity(entity: Entity) {
    if (this.entities.has(`${entity.partitionKey}|${entity.rowKey}`)) throw fail(409);
    this.store(entity);
  }
  async updateEntity(entity: Entity, mode: 'Replace' | 'Merge', { etag }: { etag: string }) {
    const old = this.entities.get(`${entity.partitionKey}|${entity.rowKey}`);
    if (!old) throw fail(404);
    if (old['etag'] !== etag) throw fail(412);
    this.store(mode === 'Merge' ? { ...old, ...entity } : entity);
  }
  /** Writes a row as any request would, with a new ETag. */
  store(entity: Entity) {
    this.entities.set(`${entity.partitionKey}|${entity.rowKey}`, {
      ...entity,
      etag: `v${++this.version}`,
    });
  }
}

const HASH = 'ab'.repeat(32);

describe('TableProgressRepo', () => {
  it('returns null for an unknown key', async () => {
    expect(await new TableProgressRepo(new FakeTable()).get('andrii')).toBeNull();
  });

  it('round-trips JSON longer than one table property', async () => {
    const table = new FakeTable();
    const repo = new TableProgressRepo(table);
    const json = JSON.stringify({ text: 'æøå'.repeat(CHUNK_CHARS) });
    await repo.put('andrii', 'Andrii', json, HASH);

    const entity = table.entities.get('andrii|progress')!;
    expect(entity['chunks']).toBe(4);
    expect(entity['name']).toBe('Andrii');
    expect(await repo.get('andrii')).toEqual({
      json,
      passwordHash: HASH,
      etag: expect.any(String),
    });
  });

  it('reads rows saved before passwords existed', async () => {
    const table = new FakeTable();
    table.store({ partitionKey: 'a', rowKey: 'progress', chunks: 1, data0: '{}' });
    expect(await new TableProgressRepo(table).get('a')).toEqual({
      json: '{}',
      etag: expect.any(String),
    });
  });

  it('creates a row only if it does not exist yet', async () => {
    const repo = new TableProgressRepo(new FakeTable());
    await repo.put('a', 'a', '{"one":1}', HASH, null);
    await expect(repo.put('a', 'a', '{"two":2}', HASH, null)).rejects.toThrow(RowConflictError);
    expect((await repo.get('a'))?.json).toBe('{"one":1}');
  });

  it('replaces a row only if it did not change since it was read', async () => {
    const repo = new TableProgressRepo(new FakeTable());
    await repo.put('a', 'a', '{}', HASH);
    const { etag } = (await repo.get('a'))!;
    await repo.put('a', 'a', '{"one":1}', HASH, etag);
    await expect(repo.put('a', 'a', '{"two":2}', HASH, etag)).rejects.toThrow(RowConflictError);
    expect((await repo.get('a'))?.json).toBe('{"one":1}');
  });

  it('claims a row by adding only the hash, if it did not change since it was read', async () => {
    const table = new FakeTable();
    table.store({ partitionKey: 'a', rowKey: 'progress', chunks: 1, data0: '{}' });
    const repo = new TableProgressRepo(table);
    const { etag } = (await repo.get('a'))!;
    await repo.claim('a', HASH, etag);
    expect(await repo.get('a')).toEqual({
      json: '{}',
      passwordHash: HASH,
      etag: expect.any(String),
    });
    await expect(repo.claim('a', 'cd'.repeat(32), etag)).rejects.toThrow(RowConflictError);
  });

  it('drops chunks left over from a longer earlier value', async () => {
    const table = new FakeTable();
    const repo = new TableProgressRepo(table);
    await repo.put('andrii', 'Andrii', 'x'.repeat(CHUNK_CHARS * 2 + 1), HASH);
    await repo.put('andrii', 'Andrii', '{}', HASH);

    expect(table.entities.get('andrii|progress')!['data1']).toBeUndefined();
    expect((await repo.get('andrii'))?.json).toBe('{}');
  });

  it('creates the table once', async () => {
    const table = new FakeTable();
    const repo = new TableProgressRepo(table);
    await repo.get('a');
    await repo.put('a', 'a', '{}', HASH);
    expect(table.createCalls).toBe(1);
  });

  it.each([
    { chunks: 2, data0: '{"a":' },
    { chunks: 'x', data0: '{}' },
    { data0: '{}' },
  ])('throws for a damaged row instead of returning partial JSON: %o', async (fields) => {
    const table = new FakeTable();
    table.store({ partitionKey: 'a', rowKey: 'progress', ...fields });
    await expect(new TableProgressRepo(table).get('a')).rejects.toThrow('progress row "a"');
  });

  it('passes on errors other than not-found', async () => {
    const table = new FakeTable();
    table.getEntity = async () => {
      throw Object.assign(new Error('forbidden'), { statusCode: 403 });
    };
    await expect(new TableProgressRepo(table).get('a')).rejects.toThrow('forbidden');
  });
});
