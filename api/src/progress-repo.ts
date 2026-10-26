import { TableClient } from '@azure/data-tables';

export interface StoredProgress {
  json: string;
  /** SHA-256 hex of password + name key; missing for names saved before passwords existed. */
  passwordHash?: string;
  /** Version of the row, for writes that must not cross another one. */
  etag: string;
}

/** The row was created or changed by another request between reading and writing it. */
export class RowConflictError extends Error {
  constructor(key: string) {
    super(`progress row "${key}" changed meanwhile`);
    this.name = 'RowConflictError';
  }
}

export interface ProgressRepo {
  /** The stored progress, or null for an unknown name. */
  get(key: string): Promise<StoredProgress | null>;
  /**
   * Writes the row: with `expected` only if it still is that version (`null`: only if it does not
   * exist yet), otherwise rejecting with `RowConflictError`; without, whatever is there.
   */
  put(
    key: string,
    displayName: string,
    json: string,
    passwordHash: string,
    expected?: string | null,
  ): Promise<void>;
  /** Sets the password hash of a row saved without one, if it still is version `etag`. */
  claim(key: string, passwordHash: string, etag: string): Promise<void>;
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
  createEntity(entity: Entity): Promise<unknown>;
  updateEntity(
    entity: Entity,
    mode: 'Replace' | 'Merge',
    options: { etag: string },
  ): Promise<unknown>;
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
    const etag = String(entity['etag']);
    return typeof passwordHash === 'string' ? { json, passwordHash, etag } : { json, etag };
  }

  async put(
    key: string,
    displayName: string,
    json: string,
    passwordHash: string,
    expected?: string | null,
  ): Promise<void> {
    await this.ensureTable();
    const entity: Entity = { partitionKey: key, rowKey: ROW, name: displayName, passwordHash, updated: new Date() };
    let chunks = 0;
    for (let start = 0; start < json.length; start += CHUNK_CHARS) {
      entity[`data${chunks++}`] = json.slice(start, start + CHUNK_CHARS);
    }
    entity['chunks'] = chunks;
    // Replace (not merge) so chunks left over from a longer earlier value disappear.
    if (expected === undefined) await this.table.upsertEntity(entity, 'Replace');
    else if (expected === null) await conflictFree(key, this.table.createEntity(entity));
    else await conflictFree(key, this.table.updateEntity(entity, 'Replace', { etag: expected }));
  }

  async claim(key: string, passwordHash: string, etag: string): Promise<void> {
    await this.ensureTable();
    const entity: Entity = { partitionKey: key, rowKey: ROW, passwordHash };
    await conflictFree(key, this.table.updateEntity(entity, 'Merge', { etag }));
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

/** 409: created meanwhile; 412: changed since read; 404: deleted since read. */
async function conflictFree(key: string, write: Promise<unknown>): Promise<void> {
  try {
    await write;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 409 || status === 412 || status === 404) throw new RowConflictError(key);
    throw e;
  }
}
