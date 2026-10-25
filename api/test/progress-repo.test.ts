import { describe, expect, it } from 'vitest';
import { CHUNK_CHARS, TableLike, TableProgressRepo } from '../src/progress-repo.js';

class FakeTable implements TableLike {
  entities = new Map<string, Record<string, unknown>>();
  createCalls = 0;
  async createTable() {
    this.createCalls++;
  }
  async getEntity<T extends object>(partitionKey: string, rowKey: string): Promise<T> {
    const e = this.entities.get(`${partitionKey}|${rowKey}`);
    if (!e) throw Object.assign(new Error('not found'), { statusCode: 404 });
    return e as T;
  }
  async upsertEntity(entity: Record<string, unknown> & { partitionKey: string; rowKey: string }) {
    this.entities.set(`${entity.partitionKey}|${entity.rowKey}`, { ...entity });
  }
}

describe('TableProgressRepo', () => {
  it('returns null for an unknown key', async () => {
    expect(await new TableProgressRepo(new FakeTable()).get('andrii')).toBeNull();
  });

  it('round-trips JSON longer than one table property', async () => {
    const table = new FakeTable();
    const repo = new TableProgressRepo(table);
    const json = JSON.stringify({ text: 'æøå'.repeat(CHUNK_CHARS) });
    await repo.put('andrii', 'Andrii', json);

    const entity = table.entities.get('andrii|progress')!;
    expect(entity['chunks']).toBe(4);
    expect(entity['name']).toBe('Andrii');
    expect(await repo.get('andrii')).toBe(json);
  });

  it('drops chunks left over from a longer earlier value', async () => {
    const table = new FakeTable();
    const repo = new TableProgressRepo(table);
    await repo.put('andrii', 'Andrii', 'x'.repeat(CHUNK_CHARS * 2 + 1));
    await repo.put('andrii', 'Andrii', '{}');

    expect(table.entities.get('andrii|progress')!['data1']).toBeUndefined();
    expect(await repo.get('andrii')).toBe('{}');
  });

  it('creates the table once', async () => {
    const table = new FakeTable();
    const repo = new TableProgressRepo(table);
    await repo.get('a');
    await repo.put('a', 'a', '{}');
    expect(table.createCalls).toBe(1);
  });

  it('passes on errors other than not-found', async () => {
    const table = new FakeTable();
    table.getEntity = async () => {
      throw Object.assign(new Error('forbidden'), { statusCode: 403 });
    };
    await expect(new TableProgressRepo(table).get('a')).rejects.toThrow('forbidden');
  });
});
