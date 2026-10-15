# FocusLens — Backend / Local Database Schema

**Document Version:** 1.0
**Project:** FocusLens
**Application Type:** Privacy-First Desktop Productivity Assistant
**Database:** SQLite — Proposed MVP Choice
**Storage Model:** Local-Only
**Frontend:** React + TypeScript/JavaScript
**Desktop Framework:** Tauri
**Computer Vision:** Python + OpenCV + MediaPipe

---

## 1. Document Purpose

This document defines the proposed local database structure for the FocusLens desktop application.

The database is responsible for storing:

* Focus session records
* Activity and computer-vision events
* User preferences
* Privacy settings
* Session-related metrics required for history and analytics

The database is designed around FocusLens's privacy-first architecture. The application should store **derived activity information rather than raw webcam footage**.

The proposal specifies that webcam frames should be processed locally, activity metrics should be extracted, and frames should then be discarded.

---

# 2. Database Objectives

The local database should:

1. Store completed and relevant focus sessions.
2. Store activity events generated during sessions.
3. Support session history.
4. Support daily and weekly analytics.
5. Store configurable user preferences.
6. Store privacy preferences.
7. Support deletion of session history.
8. Avoid storing raw webcam images or video.
9. Work without a cloud database for the MVP.
10. Allow the application to function primarily offline.

---

# 3. Proposed Database Choice

## 3.1 SQLite

SQLite is proposed as the MVP database because FocusLens is a desktop application and the project requires local storage rather than a cloud backend.

The project proposal identifies SQLite/local application storage as part of the proposed technology stack.

### Advantages for FocusLens

* Local storage
* No separate database server
* Works offline
* Lightweight
* Suitable for desktop applications
* Supports relational data
* Supports transactions
* Suitable for session and time-series style records
* Easy to back up or delete locally

---

# 4. Database Architecture

The proposed data flow is:

```text
Webcam
   ↓
Local Computer Vision Processing
   ↓
Derived Activity Metrics
   ↓
Activity Events
   ↓
Focus Session
   ↓
SQLite Database
   ↓
Session History
   ↓
Analytics Dashboard
```

Raw webcam frames are **not stored in the database**.

```text
Webcam Frame
     ↓
OpenCV / MediaPipe
     ↓
Extract Activity Information
     ↓
Store Derived Metrics
     ↓
Discard Frame
```

This follows the project's privacy-first approach.

---

# 5. Core Database Entities

The MVP will use four primary tables:

1. `sessions`
2. `activity_events`
3. `user_preferences`
4. `privacy_settings`

### Entity Relationship

```text
┌──────────────────┐
│     sessions     │
├──────────────────┤
│ id (PK)          │
│ started_at       │
│ ended_at         │
│ planned_duration │
│ actual_duration  │
│ status           │
│ focus_indicator  │
│ away_duration    │
│ screen_duration  │
│ posture_events   │
└────────┬─────────┘
         │
         │ 1 : Many
         ▼
┌──────────────────────┐
│   activity_events    │
├──────────────────────┤
│ id (PK)              │
│ session_id (FK)      │
│ event_type           │
│ event_value          │
│ confidence           │
│ occurred_at           │
└──────────────────────┘


┌──────────────────────┐
│   user_preferences   │
├──────────────────────┤
│ id (PK)              │
│ focus_duration       │
│ break_duration       │
│ away_threshold       │
│ reminders_enabled    │
└──────────────────────┘


┌──────────────────────┐
│   privacy_settings   │
├──────────────────────┤
│ id (PK)              │
│ camera_enabled       │
│ tracking_enabled     │
│ notifications        │
│ data_storage         │
└──────────────────────┘
```

---

# 6. `sessions` Table

The `sessions` table stores information about each FocusLens focus session.

The project requires session history and metrics such as total focus time, number of sessions, average session length, away time, screen-facing duration, posture events, and focus indicators. Session timestamps in the application snapshot and storage are UTC ISO-8601 strings; durations are integer seconds unless otherwise noted.

## 6.1 Fields

| Field                    | Type    | Constraints       | Description                         |
| ------------------------ | ------- | ----------------- | ----------------------------------- |
| `id`                     | INTEGER | PK, AUTOINCREMENT | Unique session identifier           |
| `started_at`             | TEXT    | NOT NULL          | Session start timestamp             |
| `ended_at`               | TEXT    | NULL              | Session end timestamp               |
| `planned_duration`       | INTEGER | NOT NULL          | Planned session duration in minutes |
| `actual_duration`        | INTEGER | NOT NULL, DEFAULT 0 | Confirmed running time in seconds, excluding pauses |
| `paused_at`              | TEXT    | NULL              | Start of the current pause, if paused |
| `paused_duration`        | INTEGER | DEFAULT 0         | Completed pause time in seconds     |
| `status`                 | TEXT    | NOT NULL          | Session completion state            |
| `focus_indicator`        | REAL    | NULL              | App-generated focus indicator       |
| `away_duration`          | INTEGER | DEFAULT 0         | Total away time in seconds          |
| `screen_facing_duration` | INTEGER | DEFAULT 0         | Screen-facing duration in seconds   |
| `posture_event_count`    | INTEGER | DEFAULT 0         | Number of detected posture events   |
| `created_at`             | TEXT    | NOT NULL          | Database record creation timestamp  |

---

## 6.2 Session Status

Persisted session statuses are:

```text
running
paused
completed
cancelled
interrupted
```

`idle` and `starting` are transient manager states and do not create a
`sessions` row. A row is created when setup succeeds and the session enters
`running`. `actual_duration` accumulates only confirmed running intervals;
`paused_duration` accumulates completed pauses. While paused, `paused_at`
records the current pause start. Both timestamps use UTC ISO-8601.

`completed` means the configured timer reached zero. An explicit early End
action records `cancelled`; `interrupted` is reserved for unrecoverable
shutdown/failure. On recovery, close nonterminal rows as interrupted without
counting unobserved process downtime as active focus time.

---

# 7. `activity_events` Table

The `activity_events` table stores derived activity information generated during a focus session.

This table should **not contain raw camera frames**.

Instead, it records events such as:

* Person present
* Person away
* Screen-facing
* Looking away
* Good posture
* Slouched posture
* Unknown detection state

These correspond to the project's proposed computer-vision signals.

## 7.1 Fields

| Field         | Type    | Constraints       | Description               |
| ------------- | ------- | ----------------- | ------------------------- |
| `id`          | INTEGER | PK, AUTOINCREMENT | Unique event ID           |
| `session_id`  | INTEGER | FK, NOT NULL      | Related focus session     |
| `event_type`  | TEXT    | NOT NULL          | Type of activity event    |
| `event_value` | TEXT    | NULL              | Detected state/value      |
| `confidence`  | REAL    | NULL              | CV confidence value       |
| `occurred_at` | TEXT    | NOT NULL          | Event timestamp           |
| `duration`    | INTEGER | NULL              | Event duration in seconds |

---

# 8. Activity Event Types

The application may use the following event types:

### Person Detection

```text
PERSON_PRESENT
PERSON_AWAY
PERSON_UNKNOWN
```

### Screen-Facing Detection

```text
SCREEN_FACING
LOOKING_AWAY
SCREEN_FACING_UNKNOWN
```

### Posture Detection

```text
POSTURE_GOOD
POSTURE_SLOUCHED
POSTURE_UNKNOWN
POSTURE_REMINDER
```

### Session Activity

```text
SESSION_STARTED
SESSION_PAUSED
SESSION_RESUMED
SESSION_ENDED
```

---

# 9. Event Value Examples

Example records:

```text
event_type: PERSON
event_value: PRESENT
confidence: 0.94
```

```text
event_type: SCREEN_FACING
event_value: LOOKING_AWAY
confidence: 0.87
```

```text
event_type: POSTURE
event_value: SLOUCHED
confidence: 0.81
```

The exact event naming convention can be finalized during implementation.

---

# 10. Confidence Values

Computer-vision detection may not always be reliable.

Therefore, CV events may contain a confidence value.

Example:

```text
confidence = 0.92
```

represents a strong detection signal.

The application should not treat every CV result as absolute truth.

Unknown states should be supported.

```text
GOOD
SLOUCHED
UNKNOWN
```

This is important because the proposal identifies computer-vision accuracy and false detection as technical limitations/challenges.

---

# 11. `user_preferences` Table

This table stores normal application preferences.

## 11.1 Fields

| Field                     | Type    | Constraints | Description              |
| ------------------------- | ------- | ----------- | ------------------------ |
| `id`                      | INTEGER | PK          | Preference record ID     |
| `default_focus_duration`  | INTEGER | NOT NULL    | Default focus duration   |
| `default_break_duration`  | INTEGER | NOT NULL    | Default break duration   |
| `away_threshold`          | INTEGER | NOT NULL    | Away detection threshold |
| `break_reminders_enabled` | INTEGER | NOT NULL    | Enable/disable reminders |
| `posture_reminders_enabled` | INTEGER | NOT NULL  | Enable/disable posture reminders |
| `posture_reminder_threshold_seconds` | INTEGER | NOT NULL | Continuous reliable slouch interval before reminder |
| `created_at`              | TEXT    | NOT NULL    | Creation timestamp       |
| `updated_at`              | TEXT    | NOT NULL    | Last update timestamp    |

SQLite can represent boolean values using integers:

```text
0 = false
1 = true
```

---

# 12. Default Focus Durations

The application should support:

```text
25 minutes
45 minutes
60 minutes
Custom duration
```

These options are defined in the application flow and MVP requirements.

---

# 13. `privacy_settings` Table

Privacy settings are separated from normal application preferences because privacy is a major part of the FocusLens product.

The project specifically includes controls for camera access, session tracking, notifications, data storage, and deletion of session history.

## 13.1 Fields

| Field                   | Type    | Constraints | Description                        |
| ----------------------- | ------- | ----------- | ---------------------------------- |
| `id`                    | INTEGER | PK          | Settings ID                        |
| `camera_enabled`        | INTEGER | NOT NULL    | Camera usage permission/preference |
| `tracking_enabled`      | INTEGER | NOT NULL    | Activity tracking preference       |
| `notifications_enabled` | INTEGER | NOT NULL    | Notification preference            |
| `data_storage_enabled`  | INTEGER | NOT NULL    | Local data storage preference      |
| `updated_at`            | TEXT    | NOT NULL    | Last settings update               |

---

# 14. Raw Camera Data Policy

The database must **not** contain:

```text
camera images
webcam frames
video recordings
face images
video files
uploaded webcam footage
```

Instead:

```text
Camera
  ↓
Frame
  ↓
Local CV Processing
  ↓
Derived Signal
  ↓
Activity Event
  ↓
Frame discarded
```

This is a core privacy requirement of the project.

---

# 15. Database Relationships

## 15.1 Session → Activity Events

One session can contain many activity events.

```text
sessions
   │
   ├── activity event
   ├── activity event
   ├── activity event
   └── activity event
```

Relationship:

```text
sessions.id
      ↓
activity_events.session_id
```

### Cardinality

```text
1 Session : Many Activity Events
```

---

# 16. Foreign Key

The `activity_events.session_id` field references:

```text
sessions.id
```

Conceptually:

```sql
FOREIGN KEY (session_id)
REFERENCES sessions(id)
```

If a session is deleted, its related activity events should also be deleted.

This prevents orphaned activity records.

---

# 17. Indexes

Indexes should be added to fields frequently used for searching and analytics.

Recommended indexes:

```text
sessions.started_at
sessions.status
activity_events.session_id
activity_events.occurred_at
activity_events.event_type
```

Example:

```sql
CREATE INDEX idx_sessions_started_at
ON sessions(started_at);
```

```sql
CREATE INDEX idx_activity_session
ON activity_events(session_id);
```

---

# 18. Analytics Data Strategy

The MVP does not need to permanently store a separate analytics database.

Analytics can be calculated from:

```text
sessions
+
activity_events
```

For example:

### Total Focus Time

```text
SUM(actual_duration)
```

### Number of Sessions

```text
COUNT(sessions)
```

### Average Session Length

```text
AVG(actual_duration)
```

### Total Away Time

```text
SUM(away_duration)
```

### Screen-Facing Duration

```text
SUM(screen_facing_duration)
```

### Posture Events

```text
SUM(posture_event_count)
```

The proposal requires daily/weekly trends and these session metrics, but it does not prescribe a separate analytics table.

Therefore, deriving analytics from stored session/event data is the proposed MVP approach.

---

# 19. Daily Analytics

The application should be able to calculate daily metrics such as:

```text
Date
Total Focus Time
Number of Sessions
Average Session Length
Away Time
Screen-Facing Time
Posture Events
Average Focus Indicator
```

Example:

```text
2026-09-24

Focus Time:        2h 35m
Sessions:          4
Average Session:   38m
Away Time:         17m
Screen Facing:     2h 08m
Posture Events:    5
```

---

# 20. Weekly Analytics

Weekly analytics can aggregate the daily/session data.

Example:

```text
Week
Total Focus Time
Total Sessions
Average Session Length
Total Away Time
Average Focus Indicator
```

The UI can then display charts such as:

```text
Monday       ███████
Tuesday      █████
Wednesday    ████████
Thursday     ██████
Friday       ███████
```

The exact chart library is a frontend implementation decision.

---

# 21. Focus Indicator Storage

The proposal defines a Focus Indicator based on signals such as:

* Person present
* Screen-facing
* Consistent activity
* Away/break periods

It is explicitly an **app-generated metric rather than an objective measurement of productivity**.

The database may therefore store:

```text
focus_indicator
```

inside the `sessions` table.

Example:

```text
focus_indicator = 78.5
```

The exact calculation formula should be finalized during implementation and should not be treated as a scientifically validated productivity measurement.

---

# 22. Session Lifecycle

Runtime lifecycle:

```text
idle -> starting -> running <-> paused
                         |         |
                         +-> completed
                         +-> cancelled
                         +-> interrupted
```

Only persisted states have session rows:

```text
running | paused | completed | cancelled | interrupted
```

`completed` means the planned timer reached zero; an explicit early End is
`cancelled`. Repeated or invalid transitions do not alter the row or emit a
second event. A crash-recovered nonterminal row becomes `interrupted`, with
elapsed time limited to confirmed running intervals.

---

# 23. Session Creation

When setup succeeds and the manager transitions to `running`:

1. Create a new session record and immutable session ID.
2. Store the UTC start timestamp; setup and permission time are excluded.
3. Store planned duration.
4. Set status to `running`.
5. Initialize metrics to zero.
6. Begin activity monitoring.

Example:

```text
id: 15
planned_duration: 25
status: running
actual_duration: 0
paused_duration: 0
away_duration: 0
screen_facing_duration: 0
posture_event_count: 0
```

---

# 24. Session Update

During a session:

```text
CV Engine
   ↓
Activity Signal
   ↓
Activity Event
   ↓
Session Metrics Updated
```

For example:

```text
Person Away
   ↓
PERSON_AWAY event
   ↓
away_duration updated
```

---

# 25. Session Completion

When the session ends:

1. Record `ended_at`.
2. Calculate `actual_duration`.
3. Calculate final session metrics.
4. Calculate the Focus Indicator.
5. Set status to `completed`.
6. Save the final session record.
7. Display the session summary.

---

# 26. Session Deletion

Users should be able to delete session history from Privacy/Settings.

Deleting a session should also delete its associated activity events.

Conceptually:

```text
Delete Session
      ↓
Delete Activity Events
      ↓
Delete Session
```

This supports the project's requirement for user-controlled deletion of session history.

---

# 27. Full Data Lifecycle

```text
User starts session
        ↓
Create session record
        ↓
Camera enabled
        ↓
Local CV processing
        ↓
Derived activity signal
        ↓
Create activity event
        ↓
Update session metrics
        ↓
Session ends
        ↓
Calculate final metrics
        ↓
Save session
        ↓
Display summary
        ↓
History / Analytics
```

---

# 28. Data Retention

FocusLens should only retain information needed for:

* Session history
* Analytics
* User-selected preferences
* Privacy settings

Raw webcam footage should not be retained.

The application should provide a user-controlled option to delete session history.

---

# 29. Privacy Requirements

The database implementation must follow these rules:

### Rule 1 — Local Storage

MVP session data should remain on the user's device.

### Rule 2 — No Raw Webcam Storage

No camera frames or video should be stored.

### Rule 3 — Derived Data Only

Store only information required by the application's functionality.

### Rule 4 — User Control

Users can disable camera/tracking functionality where supported by the application flow.

### Rule 5 — Deletion

Users can delete stored session history.

### Rule 6 — Transparency

The application should clearly communicate when the camera is active and how data is processed.

These principles align with the proposal's privacy architecture.

---

# 30. Suggested SQL Schema

The following represents the proposed MVP database structure.

```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    planned_duration INTEGER NOT NULL,
    actual_duration INTEGER NOT NULL DEFAULT 0,
    paused_at TEXT,
    paused_duration INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (
        status IN ('running', 'paused', 'completed', 'cancelled', 'interrupted')
    ),
    focus_indicator REAL,
    away_duration INTEGER DEFAULT 0,
    screen_facing_duration INTEGER DEFAULT 0,
    posture_event_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
```

```sql
CREATE TABLE activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_value TEXT,
    confidence REAL,
    occurred_at TEXT NOT NULL,
    duration INTEGER,
    FOREIGN KEY (session_id)
        REFERENCES sessions(id)
        ON DELETE CASCADE
);
```

```sql
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY,
    default_focus_duration INTEGER NOT NULL,
    default_break_duration INTEGER NOT NULL,
    away_threshold INTEGER NOT NULL,
    break_reminders_enabled INTEGER NOT NULL,
    posture_reminders_enabled INTEGER NOT NULL DEFAULT 1,
    posture_reminder_threshold_seconds INTEGER NOT NULL DEFAULT 60,
    water_reminders_enabled INTEGER NOT NULL DEFAULT 1,
    water_reminder_interval_minutes INTEGER NOT NULL DEFAULT 60,
    sleep_reminders_enabled INTEGER NOT NULL DEFAULT 1,
    sleep_reminder_time TEXT NOT NULL DEFAULT '22:00',
    wellness_reminder_snooze_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

```sql
CREATE TABLE privacy_settings (
    id INTEGER PRIMARY KEY,
    camera_enabled INTEGER NOT NULL,
    tracking_enabled INTEGER NOT NULL,
    notifications_enabled INTEGER NOT NULL,
    data_storage_enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
```

The MVP reminder settings and pending reminder state currently use local
device storage. The columns above are the proposed SQLite representation for
the later local-database phase; raw camera frames are never part of this
reminder state.

---

# 31. Database Initialization

On first application launch:

```text
Launch FocusLens
      ↓
Check database
      ↓
Database exists?
   ↙          ↘
 Yes           No
 ↓              ↓
Open DB      Create DB
                ↓
          Create Tables
                ↓
          Create Defaults
```

Default preferences should be inserted during initial setup.

---

# 32. CRUD Operations

## Sessions

### Create

```text
Create new focus session
```

### Read

```text
Get session history
Get session details
Get today's sessions
Get weekly sessions
```

### Update

```text
Update session status
Update session metrics
Complete session
```

### Delete

```text
Delete session
```

---

## Activity Events

### Create

```text
Create activity event
```

### Read

```text
Get events for a session
Get events by event type
```

### Delete

Activity events should normally be deleted together with their parent session.

---

## Preferences

### Read

```text
Get preferences
```

### Update

```text
Update preferences
```

---

## Privacy Settings

### Read

```text
Get privacy settings
```

### Update

```text
Update privacy settings
```

---

# 33. Database Access Layer

The React application should not directly contain SQL queries throughout UI components.

A database/service layer should be used.

Proposed structure:

```text
React UI
   ↓
Session Service
   ↓
Database Service
   ↓
SQLite
```

For example:

```text
components/
services/
database/
```

The exact folder organization can be adjusted during implementation.

---

# 34. Proposed Database Modules

```text
database/
│
├── connection
│
├── migrations
│
├── sessionRepository
│
├── activityEventRepository
│
├── preferencesRepository
│
└── privacyRepository
```

Responsibilities:

### `sessionRepository`

Handles:

* Create session
* Update session
* Get session
* List sessions
* Delete session

### `activityEventRepository`

Handles:

* Create event
* Get session events
* Filter events

### `preferencesRepository`

Handles:

* Read preferences
* Update preferences

### `privacyRepository`

Handles:

* Read privacy settings
* Update privacy settings

---

# 35. Database Migration Strategy

Database changes should be handled using migrations instead of manually changing an existing database.

Example:

```text
Migration 001
    ↓
Create initial tables

Migration 002
    ↓
Add new field

Migration 003
    ↓
Update schema
```

This will make future versions easier to manage.

---

# 36. Error Handling

Database errors should not crash the entire application.

Examples:

```text
Database unavailable
Database initialization failed
Session save failed
Activity event save failed
History loading failed
Database migration failed
```

The UI should provide a clear user-friendly message.

Example:

```text
"We couldn't save this session locally.
Your current session can continue, but
your session history may be unavailable."
```

The exact recovery behavior should be finalized during implementation.

---

# 37. Performance Considerations

The database should not be written excessively for every webcam frame.

Instead:

```text
Webcam Frames
     ↓
CV Processing
     ↓
Activity State
     ↓
Significant State Change / Aggregated Metric
     ↓
Database
```

This avoids unnecessary database writes.

For example, the application should not create hundreds of database records per second simply because the webcam is processing frames.

---

# 38. Security Considerations

The database should:

* Remain local for the MVP.
* Avoid raw camera data.
* Avoid unnecessary personal information.
* Use controlled database access.
* Validate values before storage.
* Use parameterized SQL queries.
* Prevent accidental deletion without user confirmation.
* Keep privacy settings separate and explicit.

---

# 39. MVP Database Scope

### Required

```text
✓ sessions
✓ activity_events
✓ user_preferences
✓ privacy_settings
✓ Session history
✓ Session metrics
✓ Activity metrics
✓ Local analytics
✓ Delete session history
✓ Local-only storage
```

### Not Required for MVP

```text
✗ User accounts
✗ Cloud database
✗ Cloud synchronization
✗ Social data
✗ Raw webcam storage
✗ Video uploads
✗ AI-generated user profiles
✗ Multi-user database
```

The proposal explicitly places accounts, cloud sync, mobile support, social features, and cloud video processing outside the MVP.

---

# 40. Future Database Expansion

Future versions may introduce additional tables if new features are implemented.

Potential examples:

```text
goals
achievements
custom_reports
application_usage
break_history
notification_history
```

These should **not** be implemented in the MVP unless the feature scope changes.

---

# 41. Proposed Final Database Structure

```text
FocusLens SQLite Database
│
├── sessions
│      │
│      └── activity_events
│
├── user_preferences
│
└── privacy_settings
```

The design intentionally remains small for the MVP.

---

# 42. Final Database Workflow

```text
                 ┌──────────────┐
                 │   Webcam     │
                 └──────┬───────┘
                        ↓
              ┌───────────────────┐
              │ Local CV Engine   │
              │ OpenCV/MediaPipe  │
              └─────────┬─────────┘
                        ↓
              ┌───────────────────┐
              │ Activity Signals  │
              └─────────┬─────────┘
                        ↓
              ┌───────────────────┐
              │ Activity Events   │
              └─────────┬─────────┘
                        ↓
              ┌───────────────────┐
              │ Focus Session     │
              └─────────┬─────────┘
                        ↓
              ┌───────────────────┐
              │ SQLite Database   │
              └─────────┬─────────┘
                        ↓
          ┌─────────────┴─────────────┐
          ↓                           ↓
   Session History              Analytics
```

---

# 43. Final Definition

The FocusLens MVP database is a **small, local SQLite-based storage system** designed to support focus sessions, activity events, preferences, privacy controls, session history, and analytics.

The database will store **derived activity metrics rather than raw webcam footage**, supporting the project's privacy-first architecture.

The proposed core structure is:

```text
sessions
activity_events
user_preferences
privacy_settings
```

This provides the required foundation for the MVP without introducing unnecessary backend complexity.

The database should remain:

**Local → Minimal → Privacy-first → Queryable → Deletable → Analytics-ready**

---

# 44. Implemented SQLite Baseline (Day 20)

The initial desktop implementation uses `@tauri-apps/plugin-sql` with SQLite.
The `sqlite:focuslens.db` database is preloaded by Tauri and stored in the
application's local data area. `src-tauri/migrations/0001_initial.sql` defines
the initial schema; the ordered migration is registered in
`src-tauri/src/lib.rs` and tracked by the SQL plugin's migration mechanism.
Do not edit a migration that has shipped. Add a new numbered SQL migration and
register the next version in Rust for future schema changes.

The migration creates `sessions`, `activity_events`, `user_preferences`, and
`privacy_settings`, with lifecycle/event checks, foreign-key enforcement, and
indexes for session status/start time and activity session/time queries.
Activity timestamps and away-period timestamps use Unix milliseconds; session
timestamps use ISO-8601 strings. Only derived signals and away-event summaries
are eligible for persistence. Webcam frames and recordings are never stored.

`src/services/db.service.ts` owns connection initialization and typed
repositories; `src/services/session.service.ts` exposes the session repository
through the application's typed session-service API. Session IDs use the
existing monitor's UUID format. Session timestamps are validated ISO-8601
values with an explicit timezone and normalized to UTC. Session start time and
planned duration are immutable, while updates target only supplied mutable
fields and are restricted to the requested ID and current lifecycle state.
Recent-session queries are bounded and ordered by start time with an ID
tie-breaker. New rows start as `running` or `paused`; terminal transitions are
performed through completion, cancellation, or interrupted-session recovery.

The Day 20 schema explicitly declares `ON DELETE CASCADE` from activity events
to sessions. Consequently, the supported hard-delete operation removes the
requested session and its associated derived events, but does not affect other
sessions.

The app-level activity-monitoring provider initializes storage,
marks leftover running or paused sessions as `interrupted` on startup, and
observes the existing timer, CV monitor, and away detector. It persists session
lifecycle changes and derived away events without creating a second timer or
CV service. If local storage cannot initialize, monitoring can continue in
memory and the application displays a local-storage warning.

Preferences use validated key/value JSON storage, while privacy settings accept
only the keys declared by the current `PrivacySettings` type. Persisting a
privacy setting does not itself enable or implement the corresponding privacy
control. The away-threshold control still reads its existing local preference
store; syncing individual controls to SQLite is a separate integration step.
