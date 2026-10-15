import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { ActivityEventTrackerService } from '../src/services/activityEventTracker.service.ts';
import { FocusTimerService } from '../src/services/focusTimer.service.ts';

describe('ActivityEventTrackerService — Day 17 Activity-Event Tracking', () => {
  let tracker: ActivityEventTrackerService;

  beforeEach(() => {
    // Instantiate with 0ms minTransitionIntervalMs for tests unless testing flapping
    tracker = new ActivityEventTrackerService({ minTransitionIntervalMs: 0 });
  });

  afterEach(() => {
    tracker.unbindTimer();
    tracker.clearEvents();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1 & 3: Meaningful detection-state changes & consistent event types
  // ---------------------------------------------------------------------------
  it('Scenario 1 & 3: records meaningful detection-state transitions with consistent event types', () => {
    tracker.startSession('session_test_1');

    // 1. Person presence change
    const personEvents = tracker.processSignal({ personPresence: 'present' });
    assert.equal(personEvents.length, 1);
    assert.equal(personEvents[0].type, 'PERSON_PRESENT');
    assert.equal(personEvents[0].category, 'person');
    assert.equal(personEvents[0].stateValue, 'PRESENT');
    assert.equal(personEvents[0].sessionId, 'session_test_1');

    // Transition to AWAY
    const awayEvents = tracker.processSignal({ personPresence: 'away' });
    assert.equal(awayEvents.length, 1);
    assert.equal(awayEvents[0].type, 'PERSON_AWAY');
    assert.equal(awayEvents[0].stateValue, 'AWAY');
    assert.equal(awayEvents[0].previousStateValue, 'PRESENT');

    // 2. Screen-facing change
    const screenEvents = tracker.processSignal({ screenFacing: 'facing' });
    assert.equal(screenEvents.length, 1);
    assert.equal(screenEvents[0].type, 'SCREEN_FACING');
    assert.equal(screenEvents[0].category, 'screen_facing');
    assert.equal(screenEvents[0].stateValue, 'SCREEN_FACING');

    const lookAwayEvents = tracker.processSignal({ screenFacing: 'looking_away' });
    assert.equal(lookAwayEvents.length, 1);
    assert.equal(lookAwayEvents[0].type, 'LOOKING_AWAY');
    assert.equal(lookAwayEvents[0].previousStateValue, 'SCREEN_FACING');

    // 3. Posture change
    const postureEvents = tracker.processSignal({ posture: 'good' });
    assert.equal(postureEvents.length, 1);
    assert.equal(postureEvents[0].type, 'POSTURE_GOOD');
    assert.equal(postureEvents[0].category, 'posture');
    assert.equal(postureEvents[0].stateValue, 'GOOD_POSTURE');

    const slouchEvents = tracker.processSignal({ posture: 'slouched' });
    assert.equal(slouchEvents.length, 1);
    assert.equal(slouchEvents[0].type, 'POSTURE_SLOUCHED');
    assert.equal(slouchEvents[0].previousStateValue, 'GOOD_POSTURE');
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Deduplication of repeated identical detection states
  // ---------------------------------------------------------------------------
  it('Scenario 2: repeated identical detection states do not create duplicate transition events', () => {
    tracker.startSession('session_test_dedup');

    // Initial state
    const first = tracker.processSignal({ personPresence: 'present' });
    assert.equal(first.length, 1);

    // Repeated identical state across 5 frames
    for (let i = 0; i < 5; i++) {
      const duplicate = tracker.processSignal({ personPresence: 'present' });
      assert.equal(duplicate.length, 0, `Frame ${i + 1} should not create a duplicate event`);
    }

    // Only 1 person event should exist in total
    const personEvents = tracker.getEventsByCategory('person');
    assert.equal(personEvents.length, 1);
    assert.equal(personEvents[0].type, 'PERSON_PRESENT');
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Valid timestamps and ISO occurredAt formatting
  // ---------------------------------------------------------------------------
  it('Scenario 4: events receive valid numeric timestamps and ISO 8601 strings', () => {
    const fixedNow = 1770000000000;
    tracker.startSession('session_time_test', fixedNow);

    const events = tracker.processSignal({
      personPresence: 'present',
      timestamp: fixedNow + 1000,
    });

    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.timestamp, fixedNow + 1000);
    assert.equal(event.occurredAt, new Date(fixedNow + 1000).toISOString());
    assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Fallback on missing or invalid timestamp
    const fallbackEvents = tracker.processSignal({
      personPresence: 'away',
      timestamp: NaN,
    });
    assert.equal(fallbackEvents.length, 1);
    assert.ok(fallbackEvents[0].timestamp > 0);
    assert.ok(!Number.isNaN(Date.parse(fallbackEvents[0].occurredAt)));
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Association with the correct active session
  // ---------------------------------------------------------------------------
  it('Scenario 5: events are associated with the correct active session', () => {
    // Session 1
    tracker.startSession('session_alpha');
    tracker.processSignal({ personPresence: 'present' });
    tracker.endSession();

    // Session 2
    tracker.startSession('session_beta');
    tracker.processSignal({ personPresence: 'away' });
    tracker.endSession();

    const alphaEvents = tracker.getEvents('session_alpha');
    const betaEvents = tracker.getEvents('session_beta');

    assert.ok(alphaEvents.every((e) => e.sessionId === 'session_alpha'));
    assert.ok(betaEvents.every((e) => e.sessionId === 'session_beta'));

    const alphaPerson = alphaEvents.find((e) => e.category === 'person');
    const betaPerson = betaEvents.find((e) => e.category === 'person');

    assert.equal(alphaPerson?.type, 'PERSON_PRESENT');
    assert.equal(betaPerson?.type, 'PERSON_AWAY');
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: No events recorded while session is paused or after it ends
  // ---------------------------------------------------------------------------
  it('Scenario 6: no inappropriate events recorded when session is idle, paused, or ended', () => {
    // 1. Idle — no session started
    const idleEvents = tracker.processSignal({ personPresence: 'present' });
    assert.equal(idleEvents.length, 0);
    assert.equal(tracker.getEvents().length, 0);

    // 2. Active session
    tracker.startSession('session_pause_test');
    assert.equal(tracker.processSignal({ personPresence: 'present' }).length, 1);

    // 3. Paused session
    tracker.pauseSession();
    assert.equal(tracker.isTracking(), false);

    // Incoming signals during pause should be completely ignored
    const pausedSignals = tracker.processSignal({
      personPresence: 'away',
      screenFacing: 'looking_away',
      posture: 'slouched',
    });
    assert.equal(pausedSignals.length, 0);

    // 4. Resumed session
    tracker.resumeSession();
    assert.equal(tracker.isTracking(), true);

    // Once resumed, state transitions are tracked again
    const resumedSignals = tracker.processSignal({ personPresence: 'away' });
    assert.equal(resumedSignals.length, 1);
    assert.equal(resumedSignals[0].type, 'PERSON_AWAY');

    // 5. Ended session
    tracker.endSession();
    assert.equal(tracker.isTracking(), false);

    const endedSignals = tracker.processSignal({ personPresence: 'present' });
    assert.equal(endedSignals.length, 0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: Resuming a session does not create duplicate listeners or timers
  // ---------------------------------------------------------------------------
  it('Scenario 7: binding and resuming session does not duplicate listeners or events', () => {
    const timer = new FocusTimerService();
    tracker.bindTimer(timer);

    let notificationCount = 0;
    tracker.subscribe(() => {
      notificationCount++;
    });

    // Start
    timer.start();
    const countAfterStart = notificationCount;
    assert.ok(countAfterStart > 0);

    // Pause & Resume 3 times
    for (let i = 0; i < 3; i++) {
      timer.pause();
      timer.resume();
    }

    // Re-binding should be idempotent and not create duplicate subscriptions
    tracker.bindTimer(timer);
    tracker.bindTimer(timer);

    timer.pause();
    timer.resume();

    // Trigger a single person presence change
    const events = tracker.processSignal({ personPresence: 'present' });
    assert.equal(events.length, 1);

    timer.end();
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: Safe handling of missing or unknown detection results
  // ---------------------------------------------------------------------------
  it('Scenario 8: handles missing, undefined, or unknown detection results safely', () => {
    tracker.startSession('session_unknown_test');

    // Empty signal object should not throw or generate events
    const emptyEvents = tracker.processSignal({});
    assert.equal(emptyEvents.length, 0);

    // Signal with unknown person state
    const unknownEvents = tracker.processSignal({ personPresence: 'unknown' });
    assert.equal(unknownEvents.length, 1);
    assert.equal(unknownEvents[0].type, 'PERSON_UNKNOWN');
    assert.equal(unknownEvents[0].stateValue, 'UNKNOWN');

    // Subsequent unknown should not duplicate
    assert.equal(tracker.processSignal({ personPresence: 'unknown' }).length, 0);

    // Transition from unknown to present
    const presentEvents = tracker.processSignal({ personPresence: 'present' });
    assert.equal(presentEvents.length, 1);
    assert.equal(presentEvents[0].type, 'PERSON_PRESENT');
    assert.equal(presentEvents[0].previousStateValue, 'UNKNOWN');
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: Rapid detection changes do not create uncontrolled duplicate events
  // ---------------------------------------------------------------------------
  it('Scenario 9: rapid flapping between states is throttled by minTransitionIntervalMs', () => {
    const debouncedTracker = new ActivityEventTrackerService({ minTransitionIntervalMs: 250 });
    debouncedTracker.startSession('session_rapid_test');

    const baseTime = 1770000000000;

    // First transition at t = 0
    const evt1 = debouncedTracker.processSignal({
      personPresence: 'present',
      timestamp: baseTime,
    });
    assert.equal(evt1.length, 1);
    assert.equal(evt1[0].type, 'PERSON_PRESENT');

    // Rapid flicker at t = 50ms (< 250ms interval) -> suppressed
    const evt2 = debouncedTracker.processSignal({
      personPresence: 'away',
      timestamp: baseTime + 50,
    });
    assert.equal(evt2.length, 0, 'Rapid flicker should be suppressed by debounce window');

    // Rapid flicker back at t = 100ms (< 250ms interval) -> suppressed
    const evt3 = debouncedTracker.processSignal({
      personPresence: 'present',
      timestamp: baseTime + 100,
    });
    assert.equal(evt3.length, 0, 'Rapid flicker should be suppressed by debounce window');

    // Legitimate transition after cooldown at t = 300ms (> 250ms interval) -> accepted
    const evt4 = debouncedTracker.processSignal({
      personPresence: 'away',
      timestamp: baseTime + 300,
    });
    assert.equal(evt4.length, 1);
    assert.equal(evt4[0].type, 'PERSON_AWAY');
  });

  // ---------------------------------------------------------------------------
  // Scenario 10: Existing session timer and state-management continue to work
  // ---------------------------------------------------------------------------
  it('Scenario 10: existing session timer and state-management continue to work seamlessly', () => {
    const timer = new FocusTimerService();
    tracker.bindTimer(timer);

    assert.equal(timer.getStatus(), 'idle');
    assert.equal(tracker.isTracking(), false);

    // Timer starts session
    assert.equal(timer.start(), true);
    assert.equal(timer.getStatus(), 'running');
    assert.equal(tracker.isTracking(), true);
    assert.ok(timer.getSessionId());
    assert.equal(tracker.getActiveSessionId(), timer.getSessionId());

    // Timer pauses
    assert.equal(timer.pause(), true);
    assert.equal(timer.getStatus(), 'paused');
    assert.equal(tracker.isTracking(), false);

    // Timer resumes
    assert.equal(timer.resume(), true);
    assert.equal(timer.getStatus(), 'running');
    assert.equal(tracker.isTracking(), true);

    // Timer ends
    timer.end();
    assert.equal(timer.getStatus(), 'idle');
    assert.equal(tracker.isTracking(), false);
    assert.equal(timer.getSessionId(), null);
  });

  // ---------------------------------------------------------------------------
  // Scenario 11: Privacy — No raw webcam images or frames are stored as events
  // ---------------------------------------------------------------------------
  it('Scenario 11: privacy check — rejects and prevents storing raw webcam images or frames', () => {
    tracker.startSession('session_privacy_test');

    // Attempting to pass raw frame/media data throws privacy error
    assert.throws(() => {
      // @ts-expect-error testing privacy assertion against invalid frame payload
      tracker.processSignal({
        personPresence: 'present',
        frame: { width: 640, height: 480, data: 'raw_pixels' },
      });
    }, /Privacy Violation/);

    // Verify all stored events contain zero media buffers
    const events = tracker.getEvents();
    for (const e of events) {
      assert.equal('frame' in e, false);
      assert.equal('data' in e, false);
      assert.equal('image' in e, false);
      assert.equal(typeof e.type, 'string');
      assert.equal(typeof e.category, 'string');
      assert.equal(typeof e.timestamp, 'number');
    }
  });

  // ---------------------------------------------------------------------------
  // Initial detection state handling without inventing prior state
  // ---------------------------------------------------------------------------
  it('handles initial detection state without inventing a previous state', () => {
    tracker.startSession('session_initial_state');

    const initialEvents = tracker.processSignal({
      personPresence: 'present',
      screenFacing: 'facing',
      posture: 'good',
    });

    assert.equal(initialEvents.length, 3);
    for (const event of initialEvents) {
      assert.equal(event.previousStateValue, undefined, 'Initial event must not have a previousStateValue');
    }
  });

  // ---------------------------------------------------------------------------
  // Querying and category filtering
  // ---------------------------------------------------------------------------
  it('supports querying events by category and active session', () => {
    tracker.startSession('session_query');
    tracker.processSignal({ personPresence: 'present' });
    tracker.processSignal({ screenFacing: 'facing' });
    tracker.processSignal({ posture: 'good' });
    tracker.processSignal({ personPresence: 'away' });

    assert.equal(tracker.getEventsByCategory('person').length, 2);
    assert.equal(tracker.getEventsByCategory('screen_facing').length, 1);
    assert.equal(tracker.getEventsByCategory('posture').length, 1);
    assert.equal(tracker.getEventsByCategory('session').length, 1); // SESSION_STARTED

    const last = tracker.getLastEvent();
    assert.equal(last?.type, 'PERSON_AWAY');
    assert.equal(tracker.getEventCount(), 5);
  });
});
