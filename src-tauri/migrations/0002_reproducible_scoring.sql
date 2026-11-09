ALTER TABLE sessions ADD COLUMN focus_score REAL;
ALTER TABLE sessions ADD COLUMN observation_coverage REAL;
ALTER TABLE sessions ADD COLUMN scoring_version TEXT;

CREATE TABLE activity_events_v2 (
  event_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
  duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  away_started_at INTEGER,
  threshold_reached_at INTEGER,
  ended_at INTEGER,
  category TEXT,
  state_value TEXT,
  previous_state_value TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  metadata_json TEXT,
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

INSERT INTO activity_events_v2 (
  event_id, session_id, event_type, occurred_at, duration_seconds,
  away_started_at, threshold_reached_at, ended_at, created_at
)
SELECT event_id, session_id, event_type, occurred_at, duration_seconds,
       away_started_at, threshold_reached_at, ended_at, created_at
FROM activity_events;

DROP TABLE activity_events;
ALTER TABLE activity_events_v2 RENAME TO activity_events;

CREATE INDEX idx_activity_events_session_timestamp
  ON activity_events(session_id, occurred_at DESC);
CREATE INDEX idx_activity_events_timestamp
  ON activity_events(occurred_at DESC);
