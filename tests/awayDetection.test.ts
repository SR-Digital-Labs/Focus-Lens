import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { FocusTimerState } from '../src/types/index.ts';
import type { ActivityMonitoringState, Unsubscribe } from '../src/services/contracts.ts';
import {
  AwayDetectionService,
  DEFAULT_AWAY_THRESHOLD_MINUTES,
  type AwayDetectionStorage,
} from '../src/services/awayDetection.service.ts';

class FakeClock {
  private timestamp: number;

  constructor(timestamp: number) {
    this.timestamp = timestamp;
  }

  now(): number {
    return this.timestamp;
  }

  advance(milliseconds: number): void {
    this.timestamp += milliseconds;
  }
}

class FakeTimer {
  private status: FocusTimerState['status'] = 'idle';
  private readonly listeners = new Set<(state: FocusTimerState) => void>();

  getState(): FocusTimerState {
    return {
      status: this.status,
      durationMinutes: 25,
      totalSeconds: 1_500,
      remainingSeconds: 1_500,
      elapsedSeconds: 0,
      progress: 0,
      formattedRemaining: '25:00',
    };
  }

  subscribe(listener: (state: FocusTimerState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  setStatus(status: FocusTimerState['status']): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(this.getState()));
  }
}

class FakeActivitySource {
  private readonly listeners = new Set<(state: ActivityMonitoringState) => void>();

  subscribe(listener: (state: ActivityMonitoringState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(initialActivityState());
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  emit(state: ActivityMonitoringState): void {
    this.listeners.forEach((listener) => listener(state));
  }
}

class FakeStorage implements AwayDetectionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function initialActivityState(): ActivityMonitoringState {
  return { sessionId: null, status: 'inactive', signal: null, error: null };
}

function state(
  sessionId: string,
  personPresence: 'present' | 'away' | 'unknown',
  occurredAt: number,
  status: ActivityMonitoringState['status'] = 'active',
): ActivityMonitoringState {
  return {
    sessionId,
    status,
    signal: {
      occurredAt: new Date(occurredAt).toISOString(),
      personPresence,
      screenFacing: 'unknown',
      posture: 'unknown',
    },
    error: null,
  };
}

function createHarness(
  startAt = Date.parse('2026-10-15T00:00:00.000Z'),
  thresholdMinutes = 1,
  maxSignalAgeMs = 5 * 60_000,
) {
  const clock = new FakeClock(startAt);
  const timer = new FakeTimer();
  const activity = new FakeActivitySource();
  const storage = new FakeStorage();
  let eventNumber = 0;
  const service = new AwayDetectionService({
    activity,
    timer,
    storage,
    clock,
    maxSignalAgeMs,
    createEventId: () => `away-${++eventNumber}`,
  });
  service.start();
  service.setThresholdMinutes(thresholdMinutes);
  timer.setStatus('running');
  return { clock, timer, activity, storage, service };
}

describe('AwayDetectionService', () => {
  it('starts on reliable AWAY and records one threshold event with timestamps and duration', () => {
    const { clock, timer, activity, service } = createHarness();
    const awayStartedAt = clock.now();
    activity.emit(state('session-a', 'away', awayStartedAt));
    assert.equal(service.getSnapshot().awayStartedAt, new Date(awayStartedAt).toISOString());

    clock.advance(60_000);
    timer.setStatus('running');
    timer.setStatus('running');

    let snapshot = service.getSnapshot();
    assert.equal(snapshot.events.length, 1);
    assert.equal(snapshot.events[0].sessionId, 'session-a');
    assert.equal(snapshot.events[0].type, 'away');
    assert.equal(snapshot.events[0].awayStartedAt, awayStartedAt);
    assert.equal(snapshot.events[0].thresholdReachedAt, awayStartedAt + 60_000);
    assert.equal(snapshot.events[0].timestamp, awayStartedAt + 60_000);
    assert.equal(snapshot.events[0].duration, 60);

    clock.advance(20_000);
    timer.setStatus('running');
    activity.emit(state('session-a', 'present', clock.now()));
    snapshot = service.getSnapshot();
    assert.equal(snapshot.events.length, 1);
    assert.equal(snapshot.events[0].endedAt, clock.now());
    assert.equal(snapshot.events[0].duration, 80);
    assert.equal(snapshot.awayStartedAt, null);
    service.stop();
  });

  it('uses the five-minute default and persists a configurable threshold', () => {
    const timer = new FakeTimer();
    const activity = new FakeActivitySource();
    const storage = new FakeStorage();
    const service = new AwayDetectionService({ activity, timer, storage });
    assert.equal(service.getSnapshot().thresholdMinutes, DEFAULT_AWAY_THRESHOLD_MINUTES);
    service.setThresholdMinutes(3);
    assert.equal(service.getSnapshot().thresholdMinutes, 3);
    const next = new AwayDetectionService({
      activity: new FakeActivitySource(),
      timer: new FakeTimer(),
      storage,
    });
    assert.equal(next.getSnapshot().thresholdMinutes, 3);
    assert.throws(() => service.setThresholdMinutes(0), /between 1 and 60 minutes/);
    service.stop();
  });

  it('resets on PRESENT and allows one new event for a later away period', () => {
    const { clock, timer, activity, service } = createHarness();
    activity.emit(state('session-a', 'away', clock.now()));
    clock.advance(30_000);
    activity.emit(state('session-a', 'present', clock.now()));
    assert.equal(service.getSnapshot().awayStartedAt, null);
    assert.equal(service.getSnapshot().events.length, 0);

    clock.advance(1_000);
    const secondAwayStartedAt = clock.now();
    activity.emit(state('session-a', 'away', secondAwayStartedAt));
    clock.advance(60_000);
    timer.setStatus('running');
    assert.equal(service.getSnapshot().events.length, 1);
    assert.equal(service.getSnapshot().events[0].awayStartedAt, secondAwayStartedAt);
    service.stop();
  });

  it('does not count UNKNOWN or unavailable CV as away evidence', () => {
    const { clock, timer, activity, service } = createHarness();
    activity.emit(state('session-a', 'unknown', clock.now()));
    clock.advance(120_000);
    timer.setStatus('running');
    assert.equal(service.getSnapshot().awayStartedAt, null);
    assert.equal(service.getSnapshot().events.length, 0);

    activity.emit(state('session-a', 'away', clock.now()));
    clock.advance(10_000);
    activity.emit({ ...state('session-a', 'unknown', clock.now()), status: 'unavailable', signal: null });
    clock.advance(120_000);
    timer.setStatus('running');
    assert.equal(service.getSnapshot().awayStartedAt, null);
    assert.equal(service.getSnapshot().events.length, 0);
    service.stop();
  });

  it('ignores stale, invalid, duplicate, and out-of-order signals', () => {
    const { clock, activity, service } = createHarness(
      Date.parse('2026-10-15T00:00:00.000Z'),
      1,
      30_000,
    );
    activity.emit(state('session-a', 'away', clock.now() - 31_000));
    assert.equal(service.getSnapshot().awayStartedAt, null);

    const initialAwayAt = clock.now();
    activity.emit(state('session-a', 'away', initialAwayAt));
    const originalStart = service.getSnapshot().awayStartedAt;
    activity.emit(state('session-a', 'present', initialAwayAt));
    activity.emit({
      ...state('session-a', 'present', initialAwayAt + 1),
      signal: {
        occurredAt: 'not-a-date',
        personPresence: 'present',
        screenFacing: 'unknown',
        posture: 'unknown',
      },
    });
    clock.advance(1_000);
    activity.emit(state('session-a', 'present', initialAwayAt - 1_000));

    assert.equal(service.getSnapshot().awayStartedAt, originalStart);
    service.stop();
  });

  it('pauses away duration with the focus session and resumes the same period', () => {
    const { clock, timer, activity, service } = createHarness();
    const awayStartedAt = clock.now();
    activity.emit(state('session-a', 'away', awayStartedAt));

    clock.advance(30_000);
    timer.setStatus('paused');
    assert.equal(service.getSnapshot().awayDurationMs, 30_000);
    clock.advance(120_000);
    timer.setStatus('running');
    assert.equal(service.getSnapshot().awayDurationMs, 30_000);

    clock.advance(29_000);
    timer.setStatus('running');
    assert.equal(service.getSnapshot().events.length, 0);
    clock.advance(1_000);
    timer.setStatus('running');
    const event = service.getSnapshot().events[0];
    assert.ok(event);
    assert.equal(
      event.thresholdReachedAt,
      awayStartedAt + 60_000 + 120_000,
    );
    service.stop();
  });

  it('clears session tracking when the session changes or the timer ends', () => {
    const { clock, timer, activity, service } = createHarness();
    activity.emit(state('session-a', 'away', clock.now()));
    activity.emit(state('session-b', 'away', clock.now() + 1_000));
    assert.equal(service.getSnapshot().sessionId, 'session-b');
    assert.equal(service.getSnapshot().events.length, 0);
    assert.equal(service.getSnapshot().awayDurationMs, 0);

    clock.advance(60_000);
    timer.setStatus('completed');
    assert.equal(service.getSnapshot().sessionId, null);
    assert.equal(service.getSnapshot().events.length, 0);
    service.stop();
  });

  it('stops tracking after cancellation/idle and releases subscriptions', () => {
    const timer = new FakeTimer();
    const activity = new FakeActivitySource();
    const service = new AwayDetectionService({
      activity,
      timer,
      storage: new FakeStorage(),
    });
    service.start();
    timer.setStatus('running');
    activity.emit(state('session-a', 'away', Date.now()));
    timer.setStatus('idle');
    assert.equal(service.getSnapshot().sessionId, null);
    service.stop();

    assert.equal(timer.listenerCount, 0);
    assert.equal(activity.listenerCount, 0);
  });
});
