CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('running', 'paused', 'completed', 'cancelled', 'interrupted')
  ),
  planned_duration_seconds INTEGER NOT NULL CHECK (planned_duration_seconds > 0),
  started_at TEXT NOT NULL,
  paused_at TEXT,
  ended_at TEXT,
  elapsed_seconds REAL NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  paused_duration_seconds REAL NOT NULL DEFAULT 0 CHECK (paused_duration_seconds >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (
    (status = 'paused' AND paused_at IS NOT NULL AND ended_at IS NULL)
    OR (status = 'running' AND paused_at IS NULL AND ended_at IS NULL)
    OR (status IN ('completed', 'cancelled', 'interrupted') AND paused_at IS NULL AND ended_at IS NOT NULL)
  )
);

CREATE INDEX idx_sessions_status_started_at
  ON sessions(status, started_at DESC);

CREATE TABLE activity_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('focused', 'distracted', 'away')),
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
  duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  away_started_at INTEGER,
  threshold_reached_at INTEGER,
  ended_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (event_type = 'away'
      AND away_started_at IS NOT NULL
      AND threshold_reached_at = occurred_at
      AND threshold_reached_at >= away_started_at
      AND (ended_at IS NULL OR ended_at >= threshold_reached_at))
    OR
    (event_type != 'away'
      AND away_started_at IS NULL
      AND threshold_reached_at IS NULL
      AND ended_at IS NULL)
  )
);

CREATE INDEX idx_activity_events_session_timestamp
  ON activity_events(session_id, occurred_at DESC);

CREATE INDEX idx_activity_events_timestamp
  ON activity_events(occurred_at DESC);

CREATE TABLE user_preferences (
  preference_key TEXT PRIMARY KEY NOT NULL CHECK (length(preference_key) BETWEEN 1 AND 128),
  preference_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE privacy_settings (
  setting_key TEXT PRIMARY KEY NOT NULL CHECK (length(setting_key) BETWEEN 1 AND 128),
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
