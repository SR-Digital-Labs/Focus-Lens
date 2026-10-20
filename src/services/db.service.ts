import type { ActivityEvent, PersistedSessionStatus, PrivacySettings, Session } from '../types';
import type { AwayDetectionEvent } from './awayDetection.service';

export interface SqlQueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlConnection {
  execute(query: string, bindValues?: unknown[]): Promise<SqlQueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  close(db?: string): Promise<boolean>;
}

export type SqlDatabaseLoader = (path: string) => Promise<SqlConnection>;

interface SessionRow {
  id: string;
  status: PersistedSessionStatus;
  planned_duration_seconds: number;
  started_at: string;
  paused_at: string | null;
  ended_at: string | null;
  elapsed_seconds: number;
  paused_duration_seconds: number;
}

interface ActivityEventRow {
  event_id: string;
  session_id: string;
  event_type: ActivityEvent['type'];
  occurred_at: number;
  duration_seconds: number | null;
  away_started_at: number | null;
  threshold_reached_at: number | null;
  ended_at: number | null;
}

export interface SessionQuery {
  status?: PersistedSessionStatus;
  startedAfter?: string;
  startedBefore?: string;
  limit?: number;
}

export type SessionUpdate = Partial<
  Pick<
    Session,
    'status' | 'pausedAt' | 'endedAt' | 'elapsedSeconds' | 'pausedDurationSeconds'
  >
>;

const DATABASE_PATH = 'sqlite:focuslens.db';
const SENSITIVE_PREFERENCE_KEY = /(password|secret|token|credential|api[-_.]?key)/i;
const SESSION_UPDATE_COLUMNS = {
  status: 'status',
  pausedAt: 'paused_at',
  endedAt: 'ended_at',
  elapsedSeconds: 'elapsed_seconds',
  pausedDurationSeconds: 'paused_duration_seconds',
} as const satisfies Record<keyof SessionUpdate, string>;
const PRIVACY_SETTING_KEYS = [
  'saveVideoLocally',
  'blurBackgroundInVideo',
  'dataRetentionDays',
] as const satisfies readonly (keyof PrivacySettings)[];

async function loadTauriDatabase(path: string): Promise<SqlConnection> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  return Database.load(path);
}

export class LocalDatabaseService {
  private readonly loader: SqlDatabaseLoader;
  private readonly path: string;
  private connection: SqlConnection | null = null;
  private initialization: Promise<void> | null = null;

  constructor(loader: SqlDatabaseLoader = loadTauriDatabase, path = DATABASE_PATH) {
    this.loader = loader;
    this.path = path;
  }

  initialize(): Promise<void> {
    if (this.connection) {
      return Promise.resolve();
    }
    if (!this.initialization) {
      this.initialization = this.openConnection().catch((error: unknown) => {
        this.initialization = null;
        throw new Error('Unable to initialize the local FocusLens database.', { cause: error });
      });
    }
    return this.initialization;
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.initialization = null;
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        throw new Error('Unable to close the local FocusLens database.', { cause: error });
      }
    }
  }

  async execute(query: string, bindValues: unknown[] = []): Promise<SqlQueryResult> {
    const connection = await this.getConnection();
    try {
      return await connection.execute(query, bindValues);
    } catch (error) {
      throw new Error('A local database write failed.', { cause: error });
    }
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    const connection = await this.getConnection();
    try {
      return await connection.select<T>(query, bindValues);
    } catch (error) {
      throw new Error('A local database query failed.', { cause: error });
    }
  }

  private async getConnection(): Promise<SqlConnection> {
    await this.initialize();
    if (!this.connection) {
      throw new Error('The local database connection is not available.');
    }
    return this.connection;
  }

  private async openConnection(): Promise<void> {
    const connection = await this.loader(this.path);
    try {
      await connection.execute('PRAGMA foreign_keys = ON');
      const rows = await connection.select<Array<{ foreign_keys: number }>>(
        'PRAGMA foreign_keys',
      );
      if (rows[0]?.foreign_keys !== 1) {
        throw new Error('SQLite foreign-key enforcement could not be enabled.');
      }
      this.connection = connection;
    } catch (error) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Unable to close a failed local database connection.', closeError);
      }
      throw error;
    }
  }
}

export class SessionRepository {
  private readonly database: LocalDatabaseService;

  constructor(database: LocalDatabaseService) {
    this.database = database;
  }

  async create(session: Session): Promise<Session> {
    const value = normalizeSession(session);
    if (value.status !== 'running' && value.status !== 'paused') {
      throw new Error('New focus sessions must start in running or paused state.');
    }
    if (await this.getById(value.id)) {
      throw new Error(`Focus session "${value.id}" already exists.`);
    }
    try {
      await this.database.execute(
        `INSERT INTO sessions (
          id, status, planned_duration_seconds, started_at, paused_at, ended_at,
          elapsed_seconds, paused_duration_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          value.id,
          value.status,
          value.plannedDurationSeconds,
          value.startedAt,
          value.pausedAt,
          value.endedAt,
          value.elapsedSeconds,
          value.pausedDurationSeconds,
        ],
      );
    } catch (error) {
      throw new Error(`Unable to create focus session "${value.id}".`, { cause: error });
    }
    return value;
  }

  async getById(id: string): Promise<Session | null> {
    validateId(id, 'session');
    const rows = await this.database.select<SessionRow[]>(
      `SELECT id, status, planned_duration_seconds, started_at, paused_at, ended_at,
              elapsed_seconds, paused_duration_seconds
       FROM sessions WHERE id = $1`,
      [id],
    );
    return rows[0] ? sessionFromRow(rows[0]) : null;
  }

  async list(query: SessionQuery = {}): Promise<Session[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.status !== undefined) {
      validatePersistedStatus(query.status);
      conditions.push(`status = $${values.length + 1}`);
      values.push(query.status);
    }
    if (query.startedAfter !== undefined) {
      conditions.push(`started_at >= $${values.length + 1}`);
      values.push(normalizeTimestamp(query.startedAfter, 'start filter'));
    }
    if (query.startedBefore !== undefined) {
      conditions.push(`started_at < $${values.length + 1}`);
      values.push(normalizeTimestamp(query.startedBefore, 'end filter'));
    }
    const limit = query.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('Session query limit must be a whole number between 1 and 500.');
    }
    values.push(limit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.database.select<SessionRow[]>(
      `SELECT id, status, planned_duration_seconds, started_at, paused_at, ended_at,
              elapsed_seconds, paused_duration_seconds
       FROM sessions ${where}
       ORDER BY started_at DESC, id ASC
       LIMIT $${values.length}`,
      values,
    );
    return rows.map(sessionFromRow);
  }

  async update(id: string, changes: SessionUpdate): Promise<Session> {
    validateId(id, 'session');
    validateSessionUpdate(changes);
    const current = await this.getById(id);
    if (!current) {
      throw new Error(`Focus session "${id}" does not exist.`);
    }
    if (isTerminalSessionStatus(current.status)) {
      throw new Error(`Terminal focus session "${id}" cannot be updated.`);
    }
    const value = normalizeSession({ ...current, ...changes });
    if (!isAllowedSessionTransition(current.status, value.status)) {
      throw new Error(`Invalid focus-session transition: ${current.status} -> ${value.status}.`);
    }
    const fields = Object.keys(changes) as (keyof SessionUpdate)[];
    const assignments = fields.map(
      (field, index) => `${SESSION_UPDATE_COLUMNS[field]} = $${index + 1}`,
    );
    assignments.push(`updated_at = CURRENT_TIMESTAMP`);
    const values: unknown[] = fields.map((field) => value[field]);
    values.push(id, current.status);
    const result = await this.database.execute(
      `UPDATE sessions SET ${assignments.join(', ')}
       WHERE id = $${values.length - 1} AND status = $${values.length}`,
      values,
    );
    if (result.rowsAffected !== 1) {
      throw new Error(`Focus session "${id}" changed before it could be updated.`);
    }
    return value;
  }

  async complete(id: string, endedAt: string, elapsedSeconds: number): Promise<void> {
    await this.transitionTerminal(id, 'completed', endedAt, elapsedSeconds);
  }

  async cancel(id: string, endedAt: string, elapsedSeconds: number): Promise<void> {
    await this.transitionTerminal(id, 'cancelled', endedAt, elapsedSeconds);
  }

  async interruptUnfinished(endedAt = new Date().toISOString()): Promise<number> {
    const normalizedEnd = normalizeTimestamp(endedAt, 'session end');
    const result = await this.database.execute(
      `UPDATE sessions
       SET status = 'interrupted', paused_at = NULL, ended_at = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE status IN ('running', 'paused')`,
      [normalizedEnd],
    );
    return result.rowsAffected;
  }

  async delete(id: string): Promise<boolean> {
    validateId(id, 'session');
    const result = await this.database.execute('DELETE FROM sessions WHERE id = $1', [id]);
    return result.rowsAffected === 1;
  }

  private async transitionTerminal(
    id: string,
    status: 'completed' | 'cancelled',
    endedAt: string,
    elapsedSeconds: number,
  ): Promise<void> {
    const current = await this.getById(id);
    if (!current) {
      throw new Error(`Focus session "${id}" does not exist.`);
    }
    const normalizedEnd = normalizeTimestamp(endedAt, 'session end');
    let pausedDurationSeconds = current.pausedDurationSeconds;
    if (current.pausedAt) {
      pausedDurationSeconds += Math.max(
        0,
        Date.parse(normalizedEnd) - Date.parse(current.pausedAt),
      ) / 1_000;
    }
    await this.update(id, {
      status,
      pausedAt: null,
      endedAt: normalizedEnd,
      elapsedSeconds,
      pausedDurationSeconds,
    });
  }
}

export class ActivityEventRepository {
  private readonly database: LocalDatabaseService;

  constructor(database: LocalDatabaseService) {
    this.database = database;
  }

  async record(event: ActivityEvent): Promise<void> {
    validateActivityEvent(event);
    const awayEvent = event.type === 'away' ? event as AwayDetectionEvent : null;
    const values = [
      event.id,
      event.sessionId,
      event.type,
      event.timestamp,
      event.duration ?? null,
      awayEvent?.awayStartedAt ?? null,
      awayEvent?.thresholdReachedAt ?? null,
      awayEvent?.endedAt ?? null,
    ];
    const result = await this.database.execute(
      `INSERT INTO activity_events (
        event_id, session_id, event_type, occurred_at, duration_seconds,
        away_started_at, threshold_reached_at, ended_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT(event_id) DO UPDATE SET
        duration_seconds = excluded.duration_seconds,
        ended_at = excluded.ended_at
      WHERE activity_events.session_id = excluded.session_id
        AND activity_events.event_type = excluded.event_type
        AND activity_events.occurred_at = excluded.occurred_at`,
      values,
    );
    if (result.rowsAffected !== 1) {
      throw new Error(`Activity event "${event.id}" conflicts with an existing event.`);
    }
  }

  async listBySession(sessionId: string): Promise<ActivityEvent[]> {
    validateId(sessionId, 'session');
    const rows = await this.database.select<ActivityEventRow[]>(
      `SELECT event_id, session_id, event_type, occurred_at, duration_seconds,
              away_started_at, threshold_reached_at, ended_at
       FROM activity_events WHERE session_id = $1
       ORDER BY occurred_at ASC`,
      [sessionId],
    );
    return rows.map(activityEventFromRow);
  }
}

export class PreferencesRepository {
  private readonly database: LocalDatabaseService;

  constructor(database: LocalDatabaseService) {
    this.database = database;
  }

  async get<T>(key: string): Promise<T | null> {
    validatePreferenceKey(key);
    const rows = await this.database.select<Array<{ preference_value: string }>>(
      'SELECT preference_value FROM user_preferences WHERE preference_key = $1',
      [key],
    );
    return rows[0] ? parseStoredValue<T>(rows[0].preference_value, 'user preference') : null;
  }

  async getOrDefault<T>(key: string, defaultValue: T): Promise<T> {
    validatePreferenceKey(key);
    const rows = await this.database.select<Array<{ preference_value: string }>>(
      'SELECT preference_value FROM user_preferences WHERE preference_key = $1',
      [key],
    );
    return rows[0]
      ? parseStoredValue<T>(rows[0].preference_value, 'user preference')
      : defaultValue;
  }

  async set(key: string, value: unknown): Promise<void> {
    validatePreferenceKey(key);
    const encoded = encodeStoredValue(value, 'user preference');
    await this.database.execute(
      `INSERT INTO user_preferences (preference_key, preference_value)
       VALUES ($1, $2)
       ON CONFLICT(preference_key) DO UPDATE SET
         preference_value = excluded.preference_value,
         updated_at = CURRENT_TIMESTAMP`,
      [key, encoded],
    );
  }
}

export class PrivacySettingsRepository {
  private readonly database: LocalDatabaseService;

  constructor(database: LocalDatabaseService) {
    this.database = database;
  }

  async get<K extends keyof PrivacySettings>(key: K): Promise<PrivacySettings[K] | null> {
    validatePrivacySetting(key, undefined, false);
    const rows = await this.database.select<Array<{ setting_value: string }>>(
      'SELECT setting_value FROM privacy_settings WHERE setting_key = $1',
      [key],
    );
    return rows[0]
      ? parseStoredValue<PrivacySettings[K]>(rows[0].setting_value, 'privacy setting')
      : null;
  }

  async set<K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]): Promise<void> {
    validatePrivacySetting(key, value, true);
    const encoded = encodeStoredValue(value, 'privacy setting');
    await this.database.execute(
      `INSERT INTO privacy_settings (setting_key, setting_value)
       VALUES ($1, $2)
       ON CONFLICT(setting_key) DO UPDATE SET
         setting_value = excluded.setting_value,
         updated_at = CURRENT_TIMESTAMP`,
      [key, encoded],
    );
  }
}

export const dbService = new LocalDatabaseService();
export const sessionRepository = new SessionRepository(dbService);
export const activityEventRepository = new ActivityEventRepository(dbService);
export const preferencesRepository = new PreferencesRepository(dbService);
export const privacySettingsRepository = new PrivacySettingsRepository(dbService);

function normalizeSession(session: Session): Session {
  validateId(session.id, 'session');
  validatePersistedStatus(session.status);
  if (!Number.isInteger(session.plannedDurationSeconds) || session.plannedDurationSeconds <= 0) {
    throw new Error('Planned session duration must be a positive whole number of seconds.');
  }
  const normalized: Session = {
    ...session,
    startedAt: normalizeTimestamp(session.startedAt, 'session start'),
    pausedAt: session.pausedAt === null ? null : normalizeTimestamp(session.pausedAt, 'session pause'),
    endedAt: session.endedAt === null ? null : normalizeTimestamp(session.endedAt, 'session end'),
  };
  if (
    !Number.isFinite(normalized.elapsedSeconds)
    || normalized.elapsedSeconds < 0
    || normalized.elapsedSeconds > normalized.plannedDurationSeconds
    || !Number.isFinite(normalized.pausedDurationSeconds)
    || normalized.pausedDurationSeconds < 0
  ) {
    throw new Error('Session elapsed and paused durations must be finite and non-negative.');
  }
  if ((normalized.status === 'paused') !== (normalized.pausedAt !== null)) {
    throw new Error('Paused sessions must have a pause timestamp; other states must not.');
  }
  if (normalized.endedAt && Date.parse(normalized.endedAt) < Date.parse(normalized.startedAt)) {
    throw new Error('Session end time cannot be earlier than its start time.');
  }
  const terminal = ['completed', 'cancelled', 'interrupted'].includes(normalized.status);
  if (terminal !== (normalized.endedAt !== null)) {
    throw new Error('Terminal sessions require an end timestamp; active sessions must not have one.');
  }
  return normalized;
}

function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    status: row.status,
    plannedDurationSeconds: row.planned_duration_seconds,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    endedAt: row.ended_at,
    elapsedSeconds: row.elapsed_seconds,
    pausedDurationSeconds: row.paused_duration_seconds,
  };
}

function activityEventFromRow(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.event_id,
    sessionId: row.session_id,
    timestamp: row.occurred_at,
    type: row.event_type,
    ...(row.duration_seconds === null ? {} : { duration: row.duration_seconds }),
    ...(row.away_started_at === null ? {} : {
      awayStartedAt: row.away_started_at,
      thresholdReachedAt: row.threshold_reached_at ?? undefined,
      endedAt: row.ended_at,
    }),
  };
}

function validateActivityEvent(event: ActivityEvent): void {
  validateId(event.id, 'event');
  validateId(event.sessionId, 'session');
  if (!['focused', 'distracted', 'away'].includes(event.type)) {
    throw new Error('Activity event type is not supported.');
  }
  if (!Number.isSafeInteger(event.timestamp) || event.timestamp < 0) {
    throw new Error('Activity event timestamp must be a non-negative Unix millisecond timestamp.');
  }
  if (event.duration !== undefined && (!Number.isFinite(event.duration) || event.duration < 0)) {
    throw new Error('Activity-event duration must be finite and non-negative.');
  }
  if (event.type === 'away') {
    const awayStartedAt = event.awayStartedAt;
    const thresholdReachedAt = event.thresholdReachedAt;
    if (
      typeof awayStartedAt !== 'number'
      || typeof thresholdReachedAt !== 'number'
      || !Number.isSafeInteger(awayStartedAt)
      || !Number.isSafeInteger(thresholdReachedAt)
      || awayStartedAt > thresholdReachedAt
      || thresholdReachedAt !== event.timestamp
      || (event.endedAt !== undefined && event.endedAt !== null
        && event.endedAt < thresholdReachedAt)
    ) {
      throw new Error('Away events require valid start, threshold, and optional end timestamps.');
    }
  } else if (
    event.awayStartedAt !== undefined
    || event.thresholdReachedAt !== undefined
    || event.endedAt !== undefined
  ) {
    throw new Error('Only away events may include away-period timestamps.');
  }
}

function isAllowedSessionTransition(
  from: PersistedSessionStatus,
  to: PersistedSessionStatus,
): boolean {
  if (isTerminalSessionStatus(from)) {
    return false;
  }
  if (from === to) return true;
  if (from === 'running' || from === 'paused') {
    return ['running', 'paused', 'completed', 'cancelled', 'interrupted'].includes(to);
  }
  return false;
}

function isTerminalSessionStatus(status: PersistedSessionStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'interrupted';
}

function validateSessionUpdate(changes: SessionUpdate): void {
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    throw new Error('Session updates must be an object of supported fields.');
  }
  const allowedKeys = new Set([
    'status',
    'pausedAt',
    'endedAt',
    'elapsedSeconds',
    'pausedDurationSeconds',
  ]);
  const keys = Object.keys(changes);
  if (keys.length === 0 || keys.some((key) => !allowedKeys.has(key))) {
    throw new Error('Session updates must include supported mutable fields only.');
  }
}

function validatePersistedStatus(status: string): asserts status is PersistedSessionStatus {
  if (!['running', 'paused', 'completed', 'cancelled', 'interrupted'].includes(status)) {
    throw new Error(`Unsupported persisted session status: ${status}.`);
  }
}

function validateId(id: string, label: string): void {
  if (typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 128) {
    throw new Error(`${label} ID must be a non-empty string of at most 128 characters.`);
  }
  if (label === 'session' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Session ID must be a valid UUID generated by the existing session monitor.');
  }
}

function normalizeTimestamp(value: string, label: string): string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    throw new Error(`${label} timestamp must be an ISO-8601 date with an explicit timezone.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} timestamp must be a valid ISO-compatible date.`);
  }
  return new Date(parsed).toISOString();
}

function validatePreferenceKey(key: string): void {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(key)) {
    throw new Error('Preference keys must use 1–128 letters, numbers, dots, underscores, or hyphens.');
  }
  if (SENSITIVE_PREFERENCE_KEY.test(key)) {
    throw new Error('Secrets and credentials must not be stored as plaintext preferences.');
  }
}

function validatePrivacySetting<K extends keyof PrivacySettings>(
  key: K,
  value: PrivacySettings[K] | undefined,
  requireValue: boolean,
): void {
  if (!PRIVACY_SETTING_KEYS.includes(key)) {
    throw new Error(`Unsupported privacy setting: ${String(key)}.`);
  }
  if (!requireValue) {
    return;
  }
  if (key === 'dataRetentionDays') {
    if (
      typeof value !== 'number'
      || !Number.isInteger(value)
      || value < 0
      || value > 3_650
    ) {
      throw new Error('Data retention must be a whole number between 0 and 3650 days.');
    }
  } else if (typeof value !== 'boolean') {
    throw new Error(`Privacy setting "${key}" must be a boolean.`);
  }
}

function encodeStoredValue(value: unknown, label: string): string {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new Error('Value cannot be represented as JSON.');
    }
    return encoded;
  } catch (error) {
    throw new Error(`${label} must be JSON-serializable.`, { cause: error });
  }
}

function parseStoredValue<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Stored ${label} is not valid JSON.`, { cause: error });
  }
}
