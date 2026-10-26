import { TableClient } from '@azure/data-tables';

export interface StoredProgress {
  json: string;
  /** SHA-256 hex of password + name key; missing for names saved before passwords existed. */
  passwordHash?: string;
}

export interface ProgressRepo {
  /** The stored progress, or null for an unknown name. */
  get(key: string): Promise<StoredProgress | null>;
  put(key: string, displayName: string, json: string, passwordHash: string): Promise<void>;
}

/** Table string properties hold at most 64 KiB (32K UTF-16 chars), so the JSON is split. */
export const CHUNK_CHARS = 30_000;
const ROW = 'progress';

type Entity = Record<string, unknown> & { partitionKey: string; rowKey: string };

/** The subset of TableClient the repo uses (lets tests pass a fake). */
export interface TableLike {
  createTable(): Promise<unknown>;
  getEntity<T extends object>(partitionKey: string, rowKey: string): Promise<T>;
  upsertEntity(entity: Entity, mode: 'Replace'): Promise<unknown>;
}

/** One row per name: PartitionKey = name key, RowKey = "progress", JSON in data0..dataN. */
export class TableProgressRepo implements ProgressRepo {
  private ready?: Promise<unknown>;

  constructor(private readonly table: TableLike) {}

  static fromConnectionString(connectionString: string, tableName = 'progress'): TableProgressRepo {
    const client = TableClient.fromConnectionString(connectionString, tableName, {
      allowInsecureConnection: connectionString.startsWith('UseDevelopmentStorage'), // Azurite
    });
    return new TableProgressRepo(client);
  }

  async get(key: string): Promise<StoredProgress | null> {
    await this.ensureTable();
    let entity: Record<string, unknown>;
    try {
      entity = await this.table.getEntity<Record<string, unknown>>(key, ROW);
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return null;
      throw e;
    }
    const chunks = Number(entity['chunks']);
    if (!Number.isInteger(chunks) || chunks < 0) throw new Error(`progress row "${key}" has bad chunks value`);
    let json = '';
    for (let i = 0; i < chunks; i++) {
      const part = entity[`data${i}`];
      if (typeof part !== 'string') throw new Error(`progress row "${key}" is missing data${i}`);
      json += part;
    }
    const passwordHash = entity['passwordHash'];
    return typeof passwordHash === 'string' ? { json, passwordHash } : { json };
  }

  async put(key: string, displayName: string, json: string, passwordHash: string): Promise<void> {
    await this.ensureTable();
    const entity: Entity = { partitionKey: key, rowKey: ROW, name: displayName, passwordHash, updated: new Date() };
    let chunks = 0;
    for (let start = 0; start < json.length; start += CHUNK_CHARS) {
      entity[`data${chunks++}`] = json.slice(start, start + CHUNK_CHARS);
    }
    entity['chunks'] = chunks;
    // Replace (not merge) so chunks left over from a longer earlier value disappear.
    await this.table.upsertEntity(entity, 'Replace');
  }

  private ensureTable(): Promise<unknown> {
    // createTable succeeds when the table already exists.
    this.ready ??= this.table.createTable().catch((e) => {
      this.ready = undefined;
      throw e;
    });
    return this.ready;
  }
}
