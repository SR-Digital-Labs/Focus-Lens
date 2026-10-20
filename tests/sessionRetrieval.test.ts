import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, it } from 'node:test';

import type { Session } from '../src/types/index.ts';
import type { SqlConnection, SqlDatabaseLoader } from '../src/services/db.service.ts';
import { LocalDatabaseService, SessionRepository } from '../src/services/db.service.ts';
import { SessionRetrievalService } from '../src/services/sessionRetrieval.service.ts';

const migrationSql = readFileSync(
  new URL('../src-tauri/migrations/0001_initial.sql', import.meta.url),
  'utf8',
);

const SESSION_UUID_1 = '123e4567-e89b-42d3-a456-426614174001';
const SESSION_UUID_2 = '123e4567-e89b-42d3-a456-426614174002';
const SESSION_UUID_3 = '123e4567-e89b-42d3-a456-426614174003';
const SESSION_UUID_4 = '123e4567-e89b-42d3-a456-426614174004';
const NON_EXISTENT_UUID = '123e4567-e89b-42d3-a456-426614174099';

interface TestDatabase {
  path: string;
  cleanup(): void;
  loader: SqlDatabaseLoader;
}

function toSqliteValues(values: unknown[]): SQLInputValue[] {
  return values.map((value) => {
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'bigint'
      || value instanceof Uint8Array
    ) {
      return value;
    }
    throw new Error('Test SQLite adapter received an unsupported bind value.');
  });
}

function toNodeSqliteQuery(query: string): string {
  return query.replace(/\$\d+/g, '?');
}

class NodeSqliteConnection implements SqlConnection {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async execute(query: string, bindValues: unknown[] = []) {
    if (bindValues.length === 0 && query.includes(';')) {
      this.database.exec(query);
      return { rowsAffected: 0 };
    }
    if (bindValues.length === 0 && /^\s*PRAGMA\b/i.test(query)) {
      this.database.exec(query);
      return { rowsAffected: 0 };
    }
    const result = this.database.prepare(toNodeSqliteQuery(query)).run(...toSqliteValues(bindValues));
    return {
      rowsAffected: Number(result.changes),
      lastInsertId: Number(result.lastInsertRowid),
    };
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    return this.database.prepare(toNodeSqliteQuery(query)).all(...toSqliteValues(bindValues)) as T;
  }

  async close(): Promise<boolean> {
    this.database.close();
    return true;
  }
}

function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'focuslens-retrieval-test-'));
  const path = join(directory, 'focuslens-test.db');
  const loader: SqlDatabaseLoader = async () => {
    const database = new DatabaseSync(path);
    database.exec('PRAGMA foreign_keys = ON');
    database.exec(`
      CREATE TABLE IF NOT EXISTS test_migration_versions (
        version INTEGER PRIMARY KEY NOT NULL
      )
    `);
    const applied = database.prepare(
      'SELECT version FROM test_migration_versions WHERE version = 1',
    ).get();
    if (!applied) {
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(migrationSql);
        database.prepare('INSERT INTO test_migration_versions(version) VALUES (1)').run();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        database.close();
        throw error;
      }
    }
    return new NodeSqliteConnection(database);
  };
  return {
    path,
    loader,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function createSampleSession(
  id: string,
  startedAt: string,
  status: Session['status'] = 'running',
  options: Partial<Session> = {},
): Session {
  const isTerminal = ['completed', 'cancelled', 'interrupted'].includes(status);
  const isPaused = status === 'paused';
  return {
    id,
    status,
    plannedDurationSeconds: 1_500,
    startedAt,
    pausedAt: isPaused ? (options.pausedAt ?? '2026-10-15T00:05:00.000Z') : null,
    endedAt: isTerminal ? (options.endedAt ?? '2026-10-15T00:25:00.000Z') : null,
    elapsedSeconds: options.elapsedSeconds ?? (isTerminal ? 1_500 : 300),
    pausedDurationSeconds: options.pausedDurationSeconds ?? 0,
    ...options,
  };
}

async function setup() {
  const testDatabase = createTestDatabase();
  const database = new LocalDatabaseService(testDatabase.loader, testDatabase.path);
  const repository = new SessionRepository(database);
  const retrievalService = new SessionRetrievalService(repository);
  await database.initialize();
  return { testDatabase, database, repository, retrievalService };
}

describe('SessionRetrievalService', () => {
  it('handles an empty database gracefully by returning empty collections and null', async () => {
    const { testDatabase, database, retrievalService } = await setup();
    try {
      // Direct methods
      const allSessions = await retrievalService.getAllSessions();
      assert.deepEqual(allSessions, []);

      const recentSessions = await retrievalService.getRecentSessions();
      assert.deepEqual(recentSessions, []);

      const completedSessions = await retrievalService.getSessionsByStatus('completed');
      assert.deepEqual(completedSessions, []);

      const singleSession = await retrievalService.getSessionById(SESSION_UUID_1);
      assert.equal(singleSession, null);

      const count = await retrievalService.getSessionCount();
      assert.equal(count, 0);

      const hasAny = await retrievalService.hasSessions();
      assert.equal(hasAny, false);

      // Safe result-wrapped methods
      const allResult = await retrievalService.getAllSessionsResult();
      assert.equal(allResult.success, true);
      assert.deepEqual(allResult.data, []);

      const singleResult = await retrievalService.getSessionByIdResult(SESSION_UUID_1);
      assert.equal(singleResult.success, true);
      assert.equal(singleResult.data, null);

      const recentResult = await retrievalService.getRecentSessionsResult();
      assert.equal(recentResult.success, true);
      assert.deepEqual(recentResult.data, []);

      const statusResult = await retrievalService.getSessionsByStatusResult('running');
      assert.equal(statusResult.success, true);
      assert.deepEqual(statusResult.data, []);

      const countResult = await retrievalService.getSessionCountResult();
      assert.equal(countResult.success, true);
      assert.equal(countResult.data, 0);
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('retrieves multiple saved sessions ordered consistently by start time descending by default', async () => {
    const { testDatabase, database, repository, retrievalService } = await setup();
    try {
      const session1 = createSampleSession(SESSION_UUID_1, '2026-10-15T08:00:00.000Z', 'running');
      const session2 = createSampleSession(SESSION_UUID_2, '2026-10-15T09:00:00.000Z', 'running');
      const session3 = createSampleSession(SESSION_UUID_3, '2026-10-15T10:00:00.000Z', 'running');

      await repository.create(session1);
      await repository.create(session2);
      await repository.create(session3);

      // Complete session 2 and 3 properly
      await repository.complete(session2.id, '2026-10-15T09:25:00.000Z', 1_500);
      await repository.cancel(session3.id, '2026-10-15T10:10:00.000Z', 600);

      const allSessions = await retrievalService.getAllSessions();
      assert.equal(allSessions.length, 3);
      // Descending by start time: session3 (10:00), session2 (09:00), session1 (08:00)
      assert.equal(allSessions[0].id, SESSION_UUID_3);
      assert.equal(allSessions[1].id, SESSION_UUID_2);
      assert.equal(allSessions[2].id, SESSION_UUID_1);

      // Explicit ascending order
      const ascSessions = await retrievalService.getAllSessions({ order: 'asc' });
      assert.equal(ascSessions.length, 3);
      assert.equal(ascSessions[0].id, SESSION_UUID_1);
      assert.equal(ascSessions[1].id, SESSION_UUID_2);
      assert.equal(ascSessions[2].id, SESSION_UUID_3);

      // Total count
      const totalCount = await retrievalService.getSessionCount();
      assert.equal(totalCount, 3);
      assert.equal(await retrievalService.hasSessions(), true);
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('retrieves an individual session by its ID and matches stored records exactly', async () => {
    const { testDatabase, database, repository, retrievalService } = await setup();
    try {
      const originalSession = createSampleSession(
        SESSION_UUID_1,
        '2026-10-15T08:00:00.000Z',
        'running',
        { plannedDurationSeconds: 2_700, elapsedSeconds: 450, pausedDurationSeconds: 15 },
      );
      await repository.create(originalSession);

      const retrieved = await retrievalService.getSessionById(SESSION_UUID_1);
      assert.notEqual(retrieved, null);
      assert.deepEqual(retrieved, originalSession);

      // Retrieve via safe result method
      const result = await retrievalService.getSessionByIdResult(SESSION_UUID_1);
      assert.equal(result.success, true);
      assert.deepEqual(result.data, originalSession);

      // Retrieve non-existent valid UUID
      const nonExistent = await retrievalService.getSessionById(NON_EXISTENT_UUID);
      assert.equal(nonExistent, null);

      const nonExistentResult = await retrievalService.getSessionByIdResult(NON_EXISTENT_UUID);
      assert.equal(nonExistentResult.success, true);
      assert.equal(nonExistentResult.data, null);
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('filters saved sessions by status, time ranges, and pagination', async () => {
    const { testDatabase, database, repository, retrievalService } = await setup();
    try {
      const s1 = createSampleSession(SESSION_UUID_1, '2026-10-15T08:00:00.000Z', 'running');
      const s2 = createSampleSession(SESSION_UUID_2, '2026-10-15T09:00:00.000Z', 'running');
      const s3 = createSampleSession(SESSION_UUID_3, '2026-10-15T10:00:00.000Z', 'running');
      const s4 = createSampleSession(SESSION_UUID_4, '2026-10-15T11:00:00.000Z', 'running');

      await repository.create(s1);
      await repository.create(s2);
      await repository.create(s3);
      await repository.create(s4);

      await repository.complete(s1.id, '2026-10-15T08:25:00.000Z', 1_500);
      await repository.complete(s2.id, '2026-10-15T09:25:00.000Z', 1_500);
      await repository.cancel(s3.id, '2026-10-15T10:10:00.000Z', 600);
      // s4 remains running

      // Filter by status
      const completed = await retrievalService.getSessionsByStatus('completed');
      assert.equal(completed.length, 2);
      assert.deepEqual(
        completed.map((s) => s.id),
        [SESSION_UUID_2, SESSION_UUID_1],
      );

      const running = await retrievalService.getSessionsByStatus('running');
      assert.equal(running.length, 1);
      assert.equal(running[0].id, SESSION_UUID_4);

      const cancelled = await retrievalService.getSessionsByStatus('cancelled');
      assert.equal(cancelled.length, 1);
      assert.equal(cancelled[0].id, SESSION_UUID_3);

      // Status count
      assert.equal(await retrievalService.getSessionCount('completed'), 2);
      assert.equal(await retrievalService.getSessionCount('running'), 1);
      assert.equal(await retrievalService.getSessionCount('cancelled'), 1);
      assert.equal(await retrievalService.getSessionCount('interrupted'), 0);

      // Time range filter
      const range = await retrievalService.getAllSessions({
        startedAfter: '2026-10-15T08:30:00.000Z',
        startedBefore: '2026-10-15T10:30:00.000Z',
      });
      assert.equal(range.length, 2);
      assert.deepEqual(
        range.map((s) => s.id),
        [SESSION_UUID_3, SESSION_UUID_2],
      );

      // Pagination with limit and offset
      const page1 = await retrievalService.getAllSessions({ limit: 2, offset: 0 });
      assert.equal(page1.length, 2);
      assert.deepEqual(
        page1.map((s) => s.id),
        [SESSION_UUID_4, SESSION_UUID_3],
      );

      const page2 = await retrievalService.getAllSessions({ limit: 2, offset: 2 });
      assert.equal(page2.length, 2);
      assert.deepEqual(
        page2.map((s) => s.id),
        [SESSION_UUID_2, SESSION_UUID_1],
      );

      // Recent sessions limit
      const recent = await retrievalService.getRecentSessions(2);
      assert.equal(recent.length, 2);
      assert.deepEqual(
        recent.map((s) => s.id),
        [SESSION_UUID_4, SESSION_UUID_3],
      );
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('validates session IDs and handles invalid IDs without crashing', async () => {
    const { testDatabase, database, retrievalService } = await setup();
    try {
      const invalidIds = [
        '',
        '   ',
        'not-a-uuid',
        '123',
        '123e4567-e89b-42d3-a456',
        '123e4567-e89b-42d3-a456-42661417400g', // invalid hex
        null,
        undefined,
        12345,
        {},
      ];

      for (const invalidId of invalidIds) {
        // Validation check
        assert.equal(
          retrievalService.isValidSessionId(invalidId),
          false,
          `Expected "${String(invalidId)}" to be invalid`,
        );

        // getSessionById throws an informative error
        if (typeof invalidId === 'string') {
          await assert.rejects(
            () => retrievalService.getSessionById(invalidId),
            /Invalid session ID/,
          );
        }

        // Safe getSessionByIdResult handles gracefully and returns error object
        const result = await retrievalService.getSessionByIdResult(invalidId);
        assert.equal(result.success, false);
        assert.equal(result.data, null);
        assert.match(result.error, /Invalid session ID/);
      }
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('handles database errors gracefully in safe result methods', async () => {
    // Use a broken stub repository that always rejects, simulating a database failure.
    // (Closing LocalDatabaseService and re-calling it causes re-initialization, so a
    // stub is the only reliable way to test permanent DB-error handling.)
    const DB_ERROR = new Error('A local database query failed.');
    const brokenRepository: SessionRepository = {
      create: () => Promise.reject(DB_ERROR),
      getById: () => Promise.reject(DB_ERROR),
      list: () => Promise.reject(DB_ERROR),
      getAll: () => Promise.reject(DB_ERROR),
      count: () => Promise.reject(DB_ERROR),
      update: () => Promise.reject(DB_ERROR),
      complete: () => Promise.reject(DB_ERROR),
      cancel: () => Promise.reject(DB_ERROR),
      interruptUnfinished: () => Promise.reject(DB_ERROR),
      delete: () => Promise.reject(DB_ERROR),
    } as unknown as SessionRepository;

    const retrievalService = new SessionRetrievalService(brokenRepository);

    // Safe result-wrapped methods return failure objects without throwing
    const allResult = await retrievalService.getAllSessionsResult();
    assert.equal(allResult.success, false);
    assert.deepEqual(allResult.data, []);
    assert.ok(typeof allResult.error === 'string' && allResult.error.length > 0);

    const singleResult = await retrievalService.getSessionByIdResult(SESSION_UUID_1);
    assert.equal(singleResult.success, false);
    assert.equal(singleResult.data, null);
    assert.ok(typeof singleResult.error === 'string' && singleResult.error.length > 0);

    const recentResult = await retrievalService.getRecentSessionsResult();
    assert.equal(recentResult.success, false);
    assert.deepEqual(recentResult.data, []);

    const statusResult = await retrievalService.getSessionsByStatusResult('running');
    assert.equal(statusResult.success, false);
    assert.deepEqual(statusResult.data, []);

    const countResult = await retrievalService.getSessionCountResult();
    assert.equal(countResult.success, false);
    assert.equal(countResult.data, 0);

    // Direct methods propagate the database error as expected
    await assert.rejects(() => retrievalService.getAllSessions(), /database query failed/);
    await assert.rejects(() => retrievalService.getSessionById(SESSION_UUID_1), /database query failed/);
    await assert.rejects(() => retrievalService.getSessionCount(), /database query failed/);
  });

  it('confirms that session retrieval is strictly read-only and does not create, modify, or delete records', async () => {
    const { testDatabase, database, repository, retrievalService } = await setup();
    try {
      const s1 = createSampleSession(SESSION_UUID_1, '2026-10-15T08:00:00.000Z', 'running');
      const s2 = createSampleSession(SESSION_UUID_2, '2026-10-15T09:00:00.000Z', 'running');
      await repository.create(s1);
      await repository.create(s2);

      // Query raw database records and timestamps before retrieval
      interface DbSessionRow {
        id: string;
        status: string;
        planned_duration_seconds: number;
        started_at: string;
        paused_at: string | null;
        ended_at: string | null;
        elapsed_seconds: number;
        paused_duration_seconds: number;
        created_at: string;
        updated_at: string;
      }

      const rowsBefore = await database.select<DbSessionRow[]>(
        'SELECT * FROM sessions ORDER BY id ASC',
      );
      assert.equal(rowsBefore.length, 2);

      // Perform a flurry of retrieval queries
      await retrievalService.getAllSessions();
      await retrievalService.getAllSessions({ order: 'asc' });
      await retrievalService.getAllSessions({ status: 'running' });
      await retrievalService.getRecentSessions(5);
      await retrievalService.getSessionById(SESSION_UUID_1);
      await retrievalService.getSessionById(SESSION_UUID_2);
      await retrievalService.getSessionById(NON_EXISTENT_UUID);
      await retrievalService.getSessionCount();
      await retrievalService.hasSessions();
      await retrievalService.getAllSessionsResult();
      await retrievalService.getSessionByIdResult(SESSION_UUID_1);
      await retrievalService.getRecentSessionsResult();

      // Query raw database records and timestamps after all retrieval queries
      const rowsAfter = await database.select<DbSessionRow[]>(
        'SELECT * FROM sessions ORDER BY id ASC',
      );

      // Verify exact equality of records and timestamps
      assert.equal(rowsAfter.length, 2);
      assert.deepEqual(rowsAfter, rowsBefore);
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });
});
