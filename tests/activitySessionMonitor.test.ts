import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { FocusTimerState } from '../src/types/index.ts';
import { ActivitySessionMonitor } from '../src/services/activitySessionMonitor.service.ts';
import { ActivityEventTrackerService } from '../src/services/activityEventTracker.service.ts';
import type {
  ActivitySignal,
  CvResponse,
  ServiceEvent,
  Unsubscribe,
} from '../src/services/contracts.ts';

class FakeTimer {
  private status: FocusTimerState['status'] = 'idle';
  private sessionId: string | null = null;
  private readonly listeners = new Set<(state: FocusTimerState) => void>();

  getState(): FocusTimerState {
    return {
      status: this.status,
      sessionId: this.sessionId,
      durationMinutes: 25,
      totalSeconds: 1_500,
      remainingSeconds: 1_500,
      elapsedSeconds: 0,
      progress: 0,
      formattedRemaining: '25:00',
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  subscribe(listener: (state: FocusTimerState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  setStatus(status: FocusTimerState['status'], sessionId = this.sessionId): void {
    this.status = status;
    this.sessionId = sessionId;
    this.listeners.forEach((listener) => listener(this.getState()));
  }
}

class FakeEventSource {
  readonly activityListeners = new Set<(event: ServiceEvent<ActivitySignal>) => void>();
  readonly cvListeners = new Set<(event: ServiceEvent<CvResponse>) => void>();

  activity = {
    subscribe: async (
      handler: (event: ServiceEvent<ActivitySignal>) => void,
    ): Promise<Unsubscribe> => {
      this.activityListeners.add(handler);
      return () => this.activityListeners.delete(handler);
    },
  };

  cv = {
    subscribe: async (
      handler: (event: ServiceEvent<CvResponse>) => void,
    ): Promise<Unsubscribe> => {
      this.cvListeners.add(handler);
      return () => this.cvListeners.delete(handler);
    },
  };

  emitActivity(event: ServiceEvent<ActivitySignal>): void {
    this.activityListeners.forEach((listener) => listener(event));
  }

  emitCv(event: ServiceEvent<CvResponse>): void {
    this.cvListeners.forEach((listener) => listener(event));
  }
}

function activityEvent(
  eventId: string,
  occurredAt: string,
  overrides: Partial<ActivitySignal> = {},
  sessionId?: string,
): ServiceEvent<ActivitySignal> {
  return {
    eventId,
    occurredAt,
    ...(sessionId ? { sessionId } : {}),
    payload: {
      occurredAt,
      personPresence: 'present',
      screenFacing: 'facing',
      posture: 'good',
      confidence: 0.92,
      ...overrides,
    },
  };
}

describe('ActivitySessionMonitor', () => {
  it('associates valid live CV activity with the running timer session', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer, () => 'session-a');
    let current = initialMonitorState();
    const unsubscribeState = monitor.subscribe((state) => {
      current = state;
    });
    const stop = monitor.start();
    await Promise.resolve();

    timer.setStatus('running');
    const occurredAt = new Date(Date.now() + 10).toISOString();
    events.emitActivity(activityEvent('event-1', occurredAt, {}, 'session-a'));

    assert.equal(current.sessionId, 'session-a');
    assert.equal(current.status, 'active');
    assert.equal(current.signal?.personPresence, 'present');
    assert.equal(current.signal?.screenFacing, 'facing');
    assert.equal(current.signal?.posture, 'good');
    assert.equal(current.signal?.confidence, 0.92);
    assert.equal(current.signal?.occurredAt, occurredAt);

    stop();
    unsubscribeState();
  });

  it('keeps the last detection visible across running timer ticks', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer, () => 'session-a');
    let current = initialMonitorState();
    monitor.subscribe((state) => {
      current = state;
    });
    const stop = monitor.start();
    await Promise.resolve();

    timer.setStatus('running', 'session-a');
    const occurredAt = new Date(Date.now() + 10).toISOString();
    events.emitActivity(activityEvent('first-detection', occurredAt, {}, 'session-a'));
    assert.equal(current.status, 'active');

    timer.setStatus('running', 'session-a');
    assert.equal(current.status, 'active');
    assert.equal(current.signal?.personPresence, 'present');
    assert.equal(current.signal?.occurredAt, occurredAt);

    stop();
  });

  it('uses the focus timer session ID for monitor and persisted-session correlation', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer, () => 'fallback-session');
    let current = initialMonitorState();
    monitor.subscribe((state) => {
      current = state;
    });
    const stop = monitor.start();
    await Promise.resolve();

    timer.setStatus('running', 'timer-session');

    assert.equal(current.sessionId, 'timer-session');
    stop();
  });

  it('forwards only validated, active-session signals to the activity event tracker', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer, () => 'session-tracked');
    const tracker = new ActivityEventTrackerService({ minTransitionIntervalMs: 0 });
    tracker.startSession('session-tracked');
    const unsubscribeSignals = monitor.subscribeSignals((signal) => {
      tracker.processSignal({
        personPresence: signal.personPresence,
        screenFacing: signal.screenFacing,
        posture: signal.posture,
        confidence: signal.confidence,
        occurredAt: signal.occurredAt,
      });
    });
    const stop = monitor.start();
    await Promise.resolve();
    timer.setStatus('running', 'session-tracked');

    const validAt = new Date(Date.now() + 10).toISOString();
    events.emitActivity(activityEvent(
      'valid-for-tracker',
      validAt,
      {
        personPresence: 'present',
        screenFacing: 'facing',
        posture: 'good',
      },
      'session-tracked',
    ));

    assert.deepEqual(tracker.getCurrentTrackedStates(), {
      person: 'PRESENT',
      screenFacing: 'SCREEN_FACING',
      posture: 'GOOD_POSTURE',
    });
    assert.equal(tracker.getEvents().filter((event) => event.category !== 'session').length, 3);
    assert.ok(tracker.getEvents('session-tracked').some((event) => event.category === 'person'));

    timer.setStatus('paused');
    events.emitActivity(activityEvent(
      'paused-for-tracker',
      new Date(Date.now() + 20).toISOString(),
      { personPresence: 'away' },
      'session-tracked',
    ));
    assert.equal(tracker.getEvents().filter((event) => event.category === 'person').length, 1);

    unsubscribeSignals();
    stop();
    tracker.clearEvents();
  });

  it('accepts UNKNOWN as unknown and ignores stale, duplicate, and mismatched events', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer, () => 'session-a');
    let current = initialMonitorState();
    monitor.subscribe((state) => {
      current = state;
    });
    const stop = monitor.start();
    await Promise.resolve();
    timer.setStatus('running');

    const currentTime = Date.now() + 10;
    events.emitActivity(activityEvent(
      'stale',
      new Date(currentTime - 60_000).toISOString(),
      {},
      'session-a',
    ));
    events.emitActivity(activityEvent(
      'wrong-session',
      new Date(currentTime).toISOString(),
      {},
      'session-b',
    ));
    events.emitActivity(activityEvent(
      'accepted',
      new Date(currentTime).toISOString(),
      { personPresence: 'unknown' },
      'session-a',
    ));
    events.emitActivity(activityEvent(
      'accepted',
      new Date(currentTime + 1_000).toISOString(),
      { personPresence: 'away' },
      'session-a',
    ));

    assert.equal(current.signal?.personPresence, 'unknown');
    assert.notEqual(current.signal?.personPresence, 'away');

    stop();
  });

  it('normalizes the existing Python CV signal field and state names', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer, () => 'session-a');
    let current = initialMonitorState();
    monitor.subscribe((state) => {
      current = state;
    });
    const stop = monitor.start();
    await Promise.resolve();
    timer.setStatus('running');

    const timestamp = Date.now() / 1_000 + 1;
    const occurredAt = new Date(timestamp * 1_000).toISOString();
    events.emitActivity({
      eventId: 'python-signal',
      occurredAt,
      sessionId: 'session-a',
      payload: {
        timestamp,
        person_presence: 'PRESENT',
        screen_facing: 'SCREEN_FACING',
        posture: 'SLOUCHED_POSTURE',
        confidence: 0.77,
        posture_reminder: true,
      } as unknown as ActivitySignal,
    });

    assert.equal(current.signal?.personPresence, 'present');
    assert.equal(current.signal?.screenFacing, 'facing');
    assert.equal(current.signal?.posture, 'slouched');
    assert.equal(current.signal?.confidence, 0.77);
    assert.equal(current.signal?.postureReminder, true);
    assert.equal(current.signal?.occurredAt, occurredAt);

    stop();
  });

  it('ignores activity while paused and after completion, and starts a fresh session ID', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    let sessionNumber = 0;
    const monitor = new ActivitySessionMonitor(events, timer, () => `session-${++sessionNumber}`);
    let current = initialMonitorState();
    monitor.subscribe((state) => {
      current = state;
    });
    const stop = monitor.start();
    await Promise.resolve();

    timer.setStatus('running');
    const firstSessionId = current.sessionId;
    events.emitActivity(activityEvent(
      'before-pause',
      new Date(Date.now() + 10).toISOString(),
      {},
      firstSessionId ?? undefined,
    ));
    timer.setStatus('paused');
    events.emitActivity(activityEvent(
      'during-pause',
      new Date(Date.now() + 20).toISOString(),
      {},
      firstSessionId ?? undefined,
    ));
    assert.equal(current.status, 'paused');
    assert.equal(current.signal, null);

    timer.setStatus('completed');
    events.emitActivity(activityEvent(
      'after-completion',
      new Date(Date.now() + 30).toISOString(),
      {},
      firstSessionId ?? undefined,
    ));
    assert.equal(current.status, 'inactive');
    assert.equal(current.signal, null);

    timer.setStatus('running');
    assert.equal(current.sessionId, 'session-2');
    events.emitActivity(activityEvent(
      'old-session',
      new Date(Date.now() + 40).toISOString(),
      {},
      firstSessionId ?? undefined,
    ));
    events.emitActivity(activityEvent(
      'new-session',
      new Date(Date.now() + 50).toISOString(),
      {},
      current.sessionId ?? undefined,
    ));
    assert.equal(current.signal?.personPresence, 'present');

    stop();
  });

  it('marks unavailable CV as unknown rather than interpreting it as away', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer, () => 'session-a');
    let current = initialMonitorState();
    monitor.subscribe((state) => {
      current = state;
    });
    const stop = monitor.start();
    await Promise.resolve();
    timer.setStatus('running');

    events.emitCv({
      eventId: 'cv-unavailable',
      occurredAt: new Date().toISOString(),
      sessionId: 'session-a',
      payload: {
        requestId: 'request-1',
        status: 'unavailable',
        error: { code: 'DEVICE_UNAVAILABLE', message: 'Camera unavailable.' },
      },
    });

    assert.equal(current.status, 'unavailable');
    assert.equal(current.signal?.personPresence, 'unknown');
    assert.equal(current.signal?.screenFacing, 'unknown');
    assert.equal(current.error, 'Camera unavailable.');

    stop();
  });

  it('cleans up timer and native event listeners when monitoring stops', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer);
    const stop = monitor.start();
    await Promise.resolve();

    stop();

    assert.equal(timer.listenerCount, 0);
    assert.equal(events.activityListeners.size, 0);
    assert.equal(events.cvListeners.size, 0);
  });

  it('accepts generation-aware events across repeated pause/resume cycles', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer);
    let current = initialMonitorState();
    monitor.subscribe((state) => { current = state; });
    const stop = monitor.start();
    await Promise.resolve();
    const sessionId = '123e4567-e89b-42d3-a456-426614174001';
    timer.setStatus('running', sessionId);

    for (let generation = 1; generation <= 4; generation += 1) {
      if (generation > 1) {
        timer.setStatus('paused', sessionId);
        timer.setStatus('running', sessionId);
      }
      const occurredAt = new Date(Date.now() + generation * 10).toISOString();
      events.emitActivity(activityEvent(
        `cv-${generation}-1`,
        occurredAt,
        { personPresence: generation % 2 === 0 ? 'away' : 'present' },
        sessionId,
      ));
      assert.equal(current.signal?.occurredAt, occurredAt);
    }
    stop();
  });

  it('ignores delayed activity and failure events from an older CV generation', async () => {
    const timer = new FakeTimer();
    const events = new FakeEventSource();
    const monitor = new ActivitySessionMonitor(events, timer);
    let current = initialMonitorState();
    monitor.subscribe((state) => { current = state; });
    const stop = monitor.start();
    await Promise.resolve();
    const sessionId = '123e4567-e89b-42d3-a456-426614174001';
    timer.setStatus('running', sessionId);
    const newerAt = new Date(Date.now() + 100).toISOString();
    events.emitActivity(activityEvent('cv-8-1', newerAt, { personPresence: 'present' }, sessionId));

    events.emitActivity(activityEvent(
      'cv-7-99',
      new Date(Date.now() + 200).toISOString(),
      { personPresence: 'away' },
      sessionId,
    ));
    events.emitCv({
      eventId: 'cv-7-eof',
      occurredAt: new Date(Date.now() + 300).toISOString(),
      sessionId,
      payload: {
        requestId: 'old-generation-eof',
        status: 'failed',
        error: { code: 'DEVICE_UNAVAILABLE', message: 'delayed old failure' },
      },
    });
    assert.equal(current.status, 'active');
    assert.equal(current.signal?.personPresence, 'present');
    assert.equal(current.error, null);
    stop();
  });
});

function initialMonitorState() {
  return {
    sessionId: null as string | null,
    status: 'inactive' as const,
    signal: null as ActivitySignal | null,
    error: null as string | null,
  };
}
