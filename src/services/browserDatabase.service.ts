import initSqlJs from 'sql.js';
import type { Database, SqlValue } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import initialSchema from '../../src-tauri/migrations/0001_initial.sql?raw';
import reproducibleScoringMigration from '../../src-tauri/migrations/0002_reproducible_scoring.sql?raw';
import type { SqlConnection, SqlQueryResult } from './db.service';

const STORAGE_DATABASE_NAME = 'focuslens-browser-storage';
const STORAGE_DATABASE_VERSION = 1;
const STORAGE_STORE_NAME = 'sqlite-databases';
const DATABASE_VERSION = 2;

let sqlRuntime: ReturnType<typeof initSqlJs> | null = null;

export async function loadBrowserDatabase(path: string): Promise<SqlConnection> {
  if (!sqlRuntime) {
    sqlRuntime = initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  let runtime: Awaited<ReturnType<typeof initSqlJs>>;
  try {
    runtime = await sqlRuntime;
  } catch (error) {
    sqlRuntime = null;
    throw error;
  }
  const storedBytes = await readDatabase(path);
  const database = new runtime.Database(storedBytes);
  database.run('PRAGMA foreign_keys = ON');

  const version = Number(database.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
  if (version < DATABASE_VERSION) {
    try {
      database.run('BEGIN IMMEDIATE');
      if (version < 1) database.exec(initialSchema);
      if (version < 2) database.exec(reproducibleScoringMigration);
      database.run(`PRAGMA user_version = ${DATABASE_VERSION}`);
      database.run('COMMIT');
    } catch (error) {
      try {
        database.run('ROLLBACK');
      } catch (rollbackError) {
        database.close();
        throw new AggregateError(
          [error, rollbackError],
          'Unable to apply or roll back the local browser database schema.',
        );
      }
      database.close();
      throw new Error('Unable to apply the local browser database schema.', { cause: error });
    }
    try {
      await writeDatabase(path, database.export());
    } catch (error) {
      database.close();
      throw new Error('Unable to persist the local browser database schema.', { cause: error });
    }
  }

  return new BrowserSqlConnection(path, database);
}

class BrowserSqlConnection implements SqlConnection {
  private readonly path: string;
  private readonly database: Database;
  private operations: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(path: string, database: Database) {
    this.path = path;
    this.database = database;
  }

  execute(query: string, bindValues: unknown[] = []): Promise<SqlQueryResult> {
    return this.enqueue(async () => {
      this.assertOpen();
      let rowsAffected: number;
      if (bindValues.length === 0 && (query.includes(';') || /^\s*PRAGMA\b/i.test(query))) {
        this.database.exec(query);
        rowsAffected = this.database.getRowsModified();
      } else {
        const statement = this.database.prepare(normalizePlaceholders(query));
        try {
          statement.bind(toSqlValues(bindValues));
          while (statement.step()) {
          }
          rowsAffected = this.database.getRowsModified();
        } finally {
          statement.free();
        }
      }

      const lastInsertId = Number(
        this.database.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0,
      );
      await writeDatabase(this.path, this.database.export());
      return { rowsAffected, lastInsertId };
    });
  }

  select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    return this.enqueue(() => {
      this.assertOpen();
      const statement = this.database.prepare(normalizePlaceholders(query));
      try {
        statement.bind(toSqlValues(bindValues));
        const rows: Record<string, SqlValue>[] = [];
        while (statement.step()) {
          rows.push(statement.getAsObject() as Record<string, SqlValue>);
        }
        return rows as T;
      } finally {
        statement.free();
      }
    });
  }

  close(): Promise<boolean> {
    return this.enqueue(() => {
      if (!this.closed) {
        this.database.close();
        this.closed = true;
      }
      return true;
    });
  }

  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('The local browser database connection is closed.');
    }
  }
}

function normalizePlaceholders(query: string): string {
  return query.replace(/\$\d+/g, '?');
}

function toSqlValues(values: unknown[]): SqlValue[] {
  return values.map((value) => {
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || value instanceof Uint8Array
    ) {
      return value;
    }
    throw new Error('The local browser database received an unsupported bind value.');
  });
}

async function readDatabase(path: string): Promise<Uint8Array | undefined> {
  const database = await openStorage();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORAGE_STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORAGE_STORE_NAME).get(path);
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (value === undefined) {
          resolve(undefined);
        } else if (value instanceof Uint8Array) {
          resolve(value);
        } else if (value instanceof ArrayBuffer) {
          resolve(new Uint8Array(value));
        } else {
          reject(new Error('Stored browser database data has an invalid format.'));
        }
      };
      request.onerror = () => reject(request.error ?? new Error('Unable to read browser database storage.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Browser database read was aborted.'));
    });
  } finally {
    database.close();
  }
}

async function writeDatabase(path: string, bytes: Uint8Array): Promise<void> {
  const database = await openStorage();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORAGE_STORE_NAME, 'readwrite');
      transaction.objectStore(STORAGE_STORE_NAME).put(bytes, path);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save browser database storage.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Browser database write was aborted.'));
    });
  } finally {
    database.close();
  }
}

function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DATABASE_NAME, STORAGE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        request.result.createObjectStore(STORAGE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open browser database storage.'));
    request.onblocked = () => reject(new Error('Browser database storage upgrade is blocked by another tab.'));
  });
}
