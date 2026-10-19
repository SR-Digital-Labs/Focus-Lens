import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActivityMonitoringState, Unsubscribe } from '../src/services/contracts.ts';
import type { AwayDetectionEvent, AwayDetectionSnapshot } from '../src/services/awayDetection.service.ts';
import { SessionPersistenceService } from '../src/services/sessionPersistence.service.ts';
import type { FocusTimerState, Session } from '../src/types/index.ts';

class ActivitySource {
  private readonly listeners = new Set<(state: ActivityMonitoringState) => void>();
  get subscriberCount(): number { return this.listeners.size; }
  state: ActivityMonitoringState = {
    sessionId: null,
    status: 'inactive',
    signal: null,
    error: null,
  };

  subscribe(listener: (state: ActivityMonitoringState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  publish(state: ActivityMonitoringState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

class TimerSource {
  private readonly listeners = new Set<(state: FocusTimerState) => void>();
  get subscriberCount(): number { return this.listeners.size; }
  state: FocusTimerState;

  constructor(state: FocusTimerState) {
    this.state = state;
  }

  getState(): FocusTimerState {
    return this.state;
  }

  subscribe(listener: (state: FocusTimerState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  publish(state: FocusTimerState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}

class AwaySource {
  private readonly listeners = new Set<(snapshot: AwayDetectionSnapshot) => void>();
  get subscriberCount(): number { return this.listeners.size; }
  snapshot: AwayDetectionSnapshot = {
    sessionId: null,
    awayStartedAt: null,
    awayDurationMs: 0,
    thresholdMinutes: 5,
    events: [],
  };

  subscribe(listener: (snapshot: AwayDetectionSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  publish(snapshot: AwayDetectionSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function timerState(
  status: FocusTimerState['status'],
  elapsedSeconds = 0,
): FocusTimerState {
  return {
    status,
    durationMinutes: 25,
    totalSeconds: 1_500,
    remainingSeconds: 1_500 - elapsedSeconds,
    elapsedSeconds,
    progress: (elapsedSeconds / 1_500) * 100,
    formattedRemaining: '25:00',
  };
}

describe('SessionPersistenceService', () => {
  it('persists the matching session lifecycle and away events', async () => {
    let now = Date.parse('2026-10-15T00:00:00.000Z');
    const activity = new ActivitySource();
    const timer = new TimerSource(timerState('running'));
    const away = new AwaySource();
    const sessions = new Map<string, Session>();
    const recordedEvents: AwayDetectionEvent[] = [];
    const service = new SessionPersistenceService({
      activity,
      timer,
      away,
      sessions: {
        async create(session) {
          sessions.set(session.id, { ...session });
        },
        async update(id, changes) {
          const session = sessions.get(id);
          assert.ok(session);
          sessions.set(id, { ...session, ...changes });
        },
      },
      events: {
        async record(event) {
          const existingIndex = recordedEvents.findIndex(({ id }) => id === event.id);
          if (existingIndex < 0) {
            recordedEvents.push({ ...event });
          } else {
            recordedEvents[existingIndex] = { ...event };
          }
        },
      },
      now: () => now,
    });
    const stop = service.start();
    activity.publish({
      sessionId: 'session-a',
      status: 'waiting',
      signal: null,
      error: null,
    });
    await service.flush();
    assert.equal(sessions.get('session-a')?.status, 'running');

    now += 30_000;
    timer.publish(timerState('paused', 30));
    await service.flush();
    assert.equal(sessions.get('session-a')?.status, 'paused');
    timer.publish(timerState('running', 30));
    await service.flush();
    assert.equal(sessions.get('session-a')?.status, 'running');

    const awayEvent: AwayDetectionEvent = {
      id: 'away-1',
      sessionId: 'session-a',
      type: 'away',
      timestamp: now + 300_000,
      awayStartedAt: now,
      thresholdReachedAt: now + 300_000,
      endedAt: null,
      duration: 300,
    };
    away.publish({
      sessionId: 'session-a',
      awayStartedAt: new Date(now).toISOString(),
      awayDurationMs: 300_000,
      thresholdMinutes: 5,
      events: [awayEvent],
    });
    await service.flush();
    assert.equal(recordedEvents[0]?.sessionId, 'session-a');

    now += 60_000;
    away.publish({
      sessionId: 'session-a',
      awayStartedAt: null,
      awayDurationMs: 0,
      thresholdMinutes: 5,
      events: [{ ...awayEvent, endedAt: now, duration: 360 }],
    });
    timer.publish(timerState('completed', 1_500));
    await service.flush();
    assert.equal(sessions.get('session-a')?.status, 'completed');
    assert.equal(sessions.get('session-a')?.endedAt, new Date(now).toISOString());
    assert.equal(recordedEvents[0]?.endedAt, now);
    assert.equal(recordedEvents[0]?.duration, 360);
    away.publish({
      sessionId: 'session-a',
      awayStartedAt: null,
      awayDurationMs: 0,
      thresholdMinutes: 5,
      events: [{ ...awayEvent, id: 'late-away-event' }],
    });
    await service.flush();
    assert.equal(recordedEvents.length, 1);
    stop();
  });

  it('does not create a persisted session until the timer is running or paused', async () => {
    const activity = new ActivitySource();
    const timer = new TimerSource(timerState('idle'));
    const away = new AwaySource();
    const created: Session[] = [];
    const service = new SessionPersistenceService({
      activity,
      timer,
      away,
      sessions: {
        async create(session) {
          created.push(session);
        },
        async update() {},
      },
      events: { async record() {} },
    });
    service.start();
    activity.publish({
      sessionId: 'not-running',
      status: 'waiting',
      signal: null,
      error: null,
    });
    await service.flush();
    assert.equal(created.length, 0);
    service.stop();
  });

  it('handles early termination (cancellation) preserving status, actual elapsed duration, and ends session', async () => {
    let now = Date.parse('2026-10-15T00:00:00.000Z');
    const activity = new ActivitySource();
    const timer = new TimerSource(timerState('running', 0));
    const away = new AwaySource();
    const sessions = new Map<string, Session>();
    const service = new SessionPersistenceService({
      activity,
      timer,
      away,
      sessions: {
        async create(session) {
          sessions.set(session.id, { ...session });
        },
        async update(id, changes) {
          const session = sessions.get(id);
          assert.ok(session);
          sessions.set(id, { ...session, ...changes });
        },
      },
      events: { async record() {} },
      now: () => now,
    });
    service.start();

    activity.publish({
      sessionId: 'session-early-end',
      status: 'waiting',
      signal: null,
      error: null,
    });
    await service.flush();
    assert.equal(sessions.get('session-early-end')?.status, 'running');

    // Simulate 3 minutes elapsed
    now += 180_000;
    timer.publish(timerState('running', 180));
    await service.flush();

    // User clicks End Session early (timer returns to idle)
    now += 5_000;
    timer.publish(timerState('idle', 0));
    await service.flush();

    const endedSession = sessions.get('session-early-end');
    assert.ok(endedSession);
    assert.equal(endedSession.status, 'cancelled');
    assert.equal(endedSession.endedAt, new Date(now).toISOString());
    assert.equal(endedSession.elapsedSeconds, 180);
    assert.equal(endedSession.pausedAt, null);
    service.stop();
  });

  it('reports database write errors via onError callback without crashing', async () => {
    const activity = new ActivitySource();
    const timer = new TimerSource(timerState('running', 0));
    const away = new AwaySource();
    const errors: Error[] = [];
    const service = new SessionPersistenceService({
      activity,
      timer,
      away,
      sessions: {
        async create() {
          throw new Error('SQLite disk I/O error on create');
        },
        async update() {},
      },
      events: { async record() {} },
      onError: (err) => {
        errors.push(err);
      },
    });
    service.start();

    activity.publish({
      sessionId: 'session-error-test',
      status: 'waiting',
      signal: null,
      error: null,
    });
    await service.flush();

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /SQLite disk I\/O error on create/);
    service.stop();
  });

  it('prevents duplicate session creation on repeated callbacks', async () => {
    let createCount = 0;
    const activity = new ActivitySource();
    const timer = new TimerSource(timerState('running', 0));
    const away = new AwaySource();
    const service = new SessionPersistenceService({
      activity,
      timer,
      away,
      sessions: {
        async create() {
          createCount += 1;
        },
        async update() {},
      },
      events: { async record() {} },
    });
    service.start();

    // Multiple rapid activity updates with the same session ID
    activity.publish({ sessionId: 'session-dup', status: 'waiting', signal: null, error: null });
    activity.publish({ sessionId: 'session-dup', status: 'active', signal: null, error: null });
    activity.publish({ sessionId: 'session-dup', status: 'active', signal: null, error: null });
    await service.flush();

    assert.equal(createCount, 1);
    service.stop();
  });

  it('tracks paused duration accurately across pause and resume', async () => {
    let now = Date.parse('2026-10-15T00:00:00.000Z');
    const activity = new ActivitySource();
    const timer = new TimerSource(timerState('running', 0));
    const away = new AwaySource();
    const sessions = new Map<string, Session>();
    const service = new SessionPersistenceService({
      activity,
      timer,
      away,
      sessions: {
        async create(session) {
          sessions.set(session.id, { ...session });
        },
        async update(id, changes) {
          const session = sessions.get(id);
          assert.ok(session);
          sessions.set(id, { ...session, ...changes });
        },
      },
      events: { async record() {} },
      now: () => now,
    });
    service.start();

    activity.publish({
      sessionId: 'session-pause-track',
      status: 'waiting',
      signal: null,
      error: null,
    });
    await service.flush();

    // Run for 60s
    now += 60_000;
    timer.publish(timerState('paused', 60));
    await service.flush();
    assert.equal(sessions.get('session-pause-track')?.status, 'paused');
    assert.equal(sessions.get('session-pause-track')?.pausedAt, new Date(now).toISOString());

    // Paused for 45 seconds
    now += 45_000;
    timer.publish(timerState('running', 60));
    await service.flush();

    const resumed = sessions.get('session-pause-track');
    assert.ok(resumed);
    assert.equal(resumed.status, 'running');
    assert.equal(resumed.pausedAt, null);
    assert.equal(resumed.pausedDurationSeconds, 45);

    // Complete session at 1500s
    now += 1_440_000;
    timer.publish(timerState('completed', 1500));
    await service.flush();

    const completed = sessions.get('session-pause-track');
    assert.ok(completed);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.pausedDurationSeconds, 45);
    assert.equal(completed.elapsedSeconds, 1500);
    service.stop();
  });

  it('cleans up timer, activity, and away subscriptions', () => {
    const activity = new ActivitySource();
    const timer = new TimerSource(timerState('idle'));
    const away = new AwaySource();
    const service = new SessionPersistenceService({
      activity,
      timer,
      away,
      sessions: { async create() {}, async update() {} },
      events: { async record() {} },
    });
    const stop = service.start();
    assert.equal(activity.subscriberCount, 1);
    assert.equal(timer.subscriberCount, 1);
    assert.equal(away.subscriberCount, 1);
    stop();
    assert.equal(activity.subscriberCount, 0);
    assert.equal(timer.subscriberCount, 0);
    assert.equal(away.subscriberCount, 0);
  });
});
