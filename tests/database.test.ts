import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, it } from 'node:test';

import type { Session } from '../src/types/index.ts';
import type { SqlConnection, SqlDatabaseLoader } from '../src/services/db.service.ts';
import {
  ActivityEventRepository,
  LocalDatabaseService,
  PreferencesRepository,
  PrivacySettingsRepository,
  SessionRepository,
} from '../src/services/db.service.ts';
import type { AwayDetectionEvent } from '../src/services/awayDetection.service.ts';

const migrationSql = readFileSync(
  new URL('../src-tauri/migrations/0001_initial.sql', import.meta.url),
  'utf8',
);

interface TestDatabase {
  path: string;
  loadCount(): number;
  migrationCount(): number;
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

function toNodeSqliteQuery(query: string): string {
  return query.replace(/\$\d+/g, '?');
}

function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'focuslens-sqlite-'));
  const path = join(directory, 'focuslens-test.db');
  let loads = 0;
  let migrations = 0;
  const loader: SqlDatabaseLoader = async () => {
    loads += 1;
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
        migrations += 1;
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
    loadCount: () => loads,
    migrationCount: () => migrations,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function runningSession(id = 'session-1'): Session {
  return {
    id,
    status: 'running',
    plannedDurationSeconds: 1_500,
    startedAt: '2026-10-15T00:00:00.000Z',
    pausedAt: null,
    endedAt: null,
    elapsedSeconds: 0,
    pausedDurationSeconds: 0,
  };
}

async function setup() {
  const testDatabase = createTestDatabase();
  const database = new LocalDatabaseService(testDatabase.loader, testDatabase.path);
  const sessions = new SessionRepository(database);
  const events = new ActivityEventRepository(database);
  const preferences = new PreferencesRepository(database);
  const privacy = new PrivacySettingsRepository(database);
  await database.initialize();
  return { testDatabase, database, sessions, events, preferences, privacy };
}

describe('Local SQLite database and repositories', () => {
  it('creates all initial tables, indexes, constraints, and foreign-key enforcement', async () => {
    const { testDatabase, database } = await setup();
    try {
      const tables = await database.select<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name IN ('sessions', 'activity_events', 'user_preferences', 'privacy_settings')
         ORDER BY name`,
      );
      assert.deepEqual(tables.map((row) => row.name), [
        'activity_events',
        'privacy_settings',
        'sessions',
        'user_preferences',
      ]);
      const indexes = await database.select<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type = 'index'
         AND name IN (
           'idx_sessions_status_started_at',
           'idx_activity_events_session_timestamp',
           'idx_activity_events_timestamp'
         )`,
      );
      assert.equal(indexes.length, 3);
      const foreignKeys = await database.select<Array<{ foreign_keys: number }>>(
        'PRAGMA foreign_keys',
      );
      assert.equal(foreignKeys[0].foreign_keys, 1);
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('initializes only once per service and does not rerun the completed schema migration after reconnect', async () => {
    const testDatabase = createTestDatabase();
    const first = new LocalDatabaseService(testDatabase.loader, testDatabase.path);
    try {
      await Promise.all([first.initialize(), first.initialize(), first.initialize()]);
      assert.equal(testDatabase.loadCount(), 1);
      assert.equal(testDatabase.migrationCount(), 1);
      await first.close();

      const reconnected = new LocalDatabaseService(testDatabase.loader, testDatabase.path);
      await reconnected.initialize();
      assert.equal(testDatabase.loadCount(), 2);
      assert.equal(testDatabase.migrationCount(), 1);
      await reconnected.close();
    } finally {
      await first.close();
      testDatabase.cleanup();
    }
  });

  it('creates, retrieves, filters, updates, completes, cancels, and deletes sessions', async () => {
    const { testDatabase, database, sessions } = await setup();
    try {
      const created = runningSession();
      await sessions.create(created);
      assert.deepEqual(await sessions.getById(created.id), created);
      assert.equal((await sessions.list({ status: 'running' })).length, 1);

      const paused: Session = {
        ...created,
        status: 'paused',
        pausedAt: '2026-10-15T00:01:00.000Z',
        elapsedSeconds: 60,
      };
      await sessions.update(paused);
      assert.deepEqual(await sessions.getById(created.id), paused);
      const resumed: Session = {
        ...paused,
        status: 'running',
        pausedAt: null,
        pausedDurationSeconds: 30,
      };
      await sessions.update(resumed);
      await sessions.complete(resumed.id, '2026-10-15T00:20:00.000Z', 1_200);
      assert.equal((await sessions.getById(resumed.id))?.status, 'completed');

      const cancelled = runningSession('session-2');
      await sessions.create(cancelled);
      await sessions.cancel(cancelled.id, '2026-10-15T00:02:00.000Z', 120);
      assert.equal((await sessions.getById(cancelled.id))?.status, 'cancelled');
      assert.equal(await sessions.delete(cancelled.id), true);
      assert.equal(await sessions.delete(cancelled.id), false);
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('enforces valid lifecycle state transitions and timestamps', async () => {
    const { testDatabase, database, sessions } = await setup();
    try {
      const invalid = { ...runningSession(), status: 'idle' } as unknown as Session;
      await assert.rejects(sessions.create(invalid), /Unsupported persisted session status/);
      await assert.rejects(
        sessions.create({ ...runningSession(), endedAt: '2026-10-14T00:00:00.000Z' }),
        /earlier than its start time/,
      );
      const completed = {
        ...runningSession(),
        status: 'completed' as const,
        endedAt: '2026-10-15T00:10:00.000Z',
      };
      await sessions.create(completed);
      await assert.rejects(
        sessions.update({ ...completed, status: 'running', endedAt: null }),
        /Invalid focus-session transition/,
      );
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('interrupts unfinished sessions on startup without adding downtime to elapsed time', async () => {
    const { testDatabase, database, sessions } = await setup();
    try {
      await sessions.create(runningSession());
      await sessions.create({
        ...runningSession('session-paused'),
        status: 'paused',
        pausedAt: '2026-10-15T00:02:00.000Z',
        elapsedSeconds: 120,
      });
      assert.equal(await sessions.interruptUnfinished('2026-10-15T00:05:00.000Z'), 2);
      const interrupted = await sessions.list({ status: 'interrupted' });
      assert.equal(interrupted.length, 2);
      assert.equal(interrupted.find((session) => session.id === 'session-paused')?.elapsedSeconds, 120);
      assert.ok(interrupted.every((session) => session.pausedAt === null));
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('records away events with the correct session and upserts final duration', async () => {
    const { testDatabase, database, sessions, events } = await setup();
    try {
      await sessions.create(runningSession());
      const start = Date.parse('2026-10-15T00:01:00.000Z');
      const threshold = start + 60_000;
      const awayEvent: AwayDetectionEvent = {
        id: 'away-event-1',
        sessionId: 'session-1',
        type: 'away',
        timestamp: threshold,
        awayStartedAt: start,
        thresholdReachedAt: threshold,
        endedAt: null,
        duration: 60,
      };
      await events.record(awayEvent);
      await events.record({ ...awayEvent, duration: 95, endedAt: threshold + 35_000 });
      const stored = await events.listBySession('session-1');
      assert.equal(stored.length, 1);
      assert.deepEqual(stored[0], { ...awayEvent, duration: 95, endedAt: threshold + 35_000 });
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('rejects nonexistent session references, duplicate conflicts, and invalid events', async () => {
    const { testDatabase, database, sessions, events } = await setup();
    try {
      const start = Date.parse('2026-10-15T00:01:00.000Z');
      const event: AwayDetectionEvent = {
        id: 'away-event-1',
        sessionId: 'missing-session',
        type: 'away',
        timestamp: start + 60_000,
        awayStartedAt: start,
        thresholdReachedAt: start + 60_000,
        endedAt: null,
        duration: 60,
      };
      await assert.rejects(events.record(event));
      await sessions.create(runningSession());
      await assert.rejects(
        events.record({ ...event, sessionId: 'session-1', thresholdReachedAt: start - 1 }),
        /valid start, threshold, and optional end timestamps/,
      );
      await events.record({ ...event, sessionId: 'session-1' });
      await assert.rejects(
        events.record({
          ...event,
          sessionId: 'session-1',
          timestamp: event.timestamp + 1,
          thresholdReachedAt: event.timestamp + 1,
        }),
        /conflicts with an existing event/,
      );

      await assert.rejects(
        database.execute('INSERT INTO sessions (id, status, planned_duration_seconds, started_at) VALUES ($1, $2, $3, $4)', [
          'bad-session',
          'unknown',
          0,
          '2026-10-15T00:00:00.000Z',
        ]),
      );
      await assert.rejects(
        database.execute(
          'INSERT INTO activity_events (event_id, session_id, event_type, occurred_at) VALUES ($1, $2, $3, $4)',
          ['invalid-fk', 'nonexistent', 'focused', start],
        ),
      );
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });

  it('persists user preferences and validated privacy settings locally', async () => {
    const { testDatabase, database, preferences, privacy } = await setup();
    try {
      await preferences.set('away.thresholdMinutes', 5);
      assert.equal(await preferences.get<number>('away.thresholdMinutes'), 5);
      await preferences.set('away.thresholdMinutes', 3);
      assert.equal(await preferences.get<number>('away.thresholdMinutes'), 3);
      await assert.rejects(preferences.set('apiKey', 'not-allowed'), /must not be stored as plaintext/);

      await privacy.set('saveVideoLocally', false);
      assert.equal(await privacy.get('saveVideoLocally'), false);
      await privacy.set('dataRetentionDays', 30);
      assert.equal(await privacy.get('dataRetentionDays'), 30);
      await assert.rejects(privacy.set('dataRetentionDays', -1), /between 0 and 3650 days/);
    } finally {
      await database.close();
      testDatabase.cleanup();
    }
  });
});
