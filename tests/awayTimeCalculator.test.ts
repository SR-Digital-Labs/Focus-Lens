import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateAwayTimeFromEvents,
  AwayTimeCalculator,
  type AwayTimeSummary,
} from '../src/services/awayTimeCalculator.service.ts';
import { ActivityEventTrackerService } from '../src/services/activityEventTracker.service.ts';
import type { ActivityEvent } from '../src/types/index.ts';

describe('AwayTimeCalculation — Day 18 Verification Scenarios', () => {
  let tracker: ActivityEventTrackerService;

  beforeEach(() => {
    tracker = new ActivityEventTrackerService({ minTransitionIntervalMs: 0 });
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: A session with no away events reports zero away time
  // ---------------------------------------------------------------------------
  it('Scenario 1: A session with no away events reports zero away time', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-no-away', baseTime);
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 1000 });
    tracker.processSignal({ screenFacing: 'facing', timestamp: baseTime + 2000 });
    tracker.processSignal({ posture: 'good', timestamp: baseTime + 3000 });
    tracker.completeSession(baseTime + 10000);

    const summary: AwayTimeSummary = tracker.calculateAwayTime('session-no-away');
    assert.equal(summary.sessionId, 'session-no-away');
    assert.equal(summary.totalAwayTimeMs, 0);
    assert.equal(summary.totalAwayTimeSeconds, 0);
    assert.equal(summary.periods.length, 0);
    assert.equal(summary.isCurrentlyAway, false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: One completed away period produces the correct duration
  // ---------------------------------------------------------------------------
  it('Scenario 2: One completed away period produces the correct duration', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-one-away', baseTime);

    // User is initially present
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 1000 });

    // User becomes away at +5,000ms
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 5000 });

    // User returns at +15,000ms (10 seconds away)
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 15000 });

    tracker.endSession(baseTime + 20000);

    const summary = tracker.calculateAwayTime('session-one-away');
    assert.equal(summary.periods.length, 1);
    assert.equal(summary.periods[0].startedAt, baseTime + 5000);
    assert.equal(summary.periods[0].endedAt, baseTime + 15000);
    assert.equal(summary.periods[0].durationMs, 10000);
    assert.equal(summary.periods[0].durationSeconds, 10);
    assert.equal(summary.periods[0].endedReason, 'returned_present');
    assert.equal(summary.totalAwayTimeMs, 10000);
    assert.equal(summary.totalAwayTimeSeconds, 10);
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Multiple away periods are accumulated correctly
  // Example from prompt:
  // User away at 10:05, returns at 10:07 (2 mins = 120s)
  // User away at 10:12, returns at 10:15 (3 mins = 180s)
  // Total expected: 5 minutes (300s)
  // ---------------------------------------------------------------------------
  it('Scenario 3: Multiple away periods are accumulated correctly (example scenario)', () => {
    const t10_00 = Date.parse('2026-10-18T10:00:00.000Z');
    const t10_05 = Date.parse('2026-10-18T10:05:00.000Z');
    const t10_07 = Date.parse('2026-10-18T10:07:00.000Z');
    const t10_12 = Date.parse('2026-10-18T10:12:00.000Z');
    const t10_15 = Date.parse('2026-10-18T10:15:00.000Z');
    const t10_25 = Date.parse('2026-10-18T10:25:00.000Z');

    tracker.startSession('session-prompt-example', t10_00);
    tracker.processSignal({ personPresence: 'present', timestamp: t10_00 + 1000 });

    // Away 1: 10:05 to 10:07
    tracker.processSignal({ personPresence: 'away', timestamp: t10_05 });
    tracker.processSignal({ personPresence: 'present', timestamp: t10_07 });

    // Away 2: 10:12 to 10:15
    tracker.processSignal({ personPresence: 'away', timestamp: t10_12 });
    tracker.processSignal({ personPresence: 'present', timestamp: t10_15 });

    tracker.completeSession(t10_25);

    const summary = tracker.calculateAwayTime('session-prompt-example');
    assert.equal(summary.periods.length, 2);
    assert.equal(summary.periods[0].durationMs, 120_000); // 2 minutes
    assert.equal(summary.periods[0].durationSeconds, 120);
    assert.equal(summary.periods[1].durationMs, 180_000); // 3 minutes
    assert.equal(summary.periods[1].durationSeconds, 180);

    assert.equal(summary.totalAwayTimeMs, 300_000); // 5 minutes
    assert.equal(summary.totalAwayTimeSeconds, 300);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Repeated identical state events do not double-count time
  // ---------------------------------------------------------------------------
  it('Scenario 4: Repeated identical state events do not double-count time', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-dedup', baseTime);

    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 1000 });
    // Repeated away signals across subsequent frames
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 2000 });
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 3000 });
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 4000 });

    // Return to present
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 7000 });
    // Repeated present signals
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 8000 });

    tracker.endSession(baseTime + 10000);

    const summary = tracker.calculateAwayTime('session-dedup');
    assert.equal(summary.periods.length, 1);
    assert.equal(summary.periods[0].durationMs, 6000); // from +1000 to +7000
    assert.equal(summary.totalAwayTimeMs, 6000);
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: A paused session does not accumulate away time
  // ---------------------------------------------------------------------------
  it('Scenario 5: A paused session does not accumulate away time', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-paused', baseTime);
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 1000 });

    // Pause the session
    tracker.pauseSession(baseTime + 2000);

    // Signals sent while paused are ignored by tracker
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 5000 });
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 8000 });

    tracker.endSession(baseTime + 10000);

    const summary = tracker.calculateAwayTime('session-paused');
    assert.equal(summary.totalAwayTimeMs, 0);
    assert.equal(summary.periods.length, 0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Away time is accumulated correctly across pause and resume
  // ---------------------------------------------------------------------------
  it('Scenario 6: Away time is accumulated correctly across pause and resume', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-pause-resume', baseTime);

    // Away starts at +2,000ms
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 2000 });

    // Session paused at +6,000ms while user was away (away period 1: 4,000ms)
    tracker.pauseSession(baseTime + 6000);

    // 10 seconds of paused idle time occurs
    // Session resumes at +16,000ms with user still away
    tracker.resumeSession(baseTime + 16000);

    // User returns at +20,000ms (away period 2: 4,000ms)
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 20000 });

    tracker.completeSession(baseTime + 25000);

    const summary = tracker.calculateAwayTime('session-pause-resume');
    assert.equal(summary.periods.length, 2);
    assert.equal(summary.periods[0].startedAt, baseTime + 2000);
    assert.equal(summary.periods[0].endedAt, baseTime + 6000);
    assert.equal(summary.periods[0].durationMs, 4000);
    assert.equal(summary.periods[0].endedReason, 'session_paused');

    assert.equal(summary.periods[1].startedAt, baseTime + 16000);
    assert.equal(summary.periods[1].endedAt, baseTime + 20000);
    assert.equal(summary.periods[1].durationMs, 4000);
    assert.equal(summary.periods[1].endedReason, 'returned_present');

    // Total away time: 4s + 4s = 8s (the 10s pause time is NOT counted)
    assert.equal(summary.totalAwayTimeMs, 8000);
    assert.equal(summary.totalAwayTimeSeconds, 8);
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: A session ending while the user is away handles the final interval correctly
  // ---------------------------------------------------------------------------
  it('Scenario 7: A session ending while the user is away handles the final interval correctly', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-end-while-away', baseTime);

    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 5000 });

    // Session completes/ends at +12,000ms without user returning
    tracker.completeSession(baseTime + 12000);

    const summary = tracker.calculateAwayTime('session-end-while-away');
    assert.equal(summary.periods.length, 1);
    assert.equal(summary.periods[0].startedAt, baseTime + 5000);
    assert.equal(summary.periods[0].endedAt, baseTime + 12000);
    assert.equal(summary.periods[0].durationMs, 7000);
    assert.equal(summary.periods[0].durationSeconds, 7);
    assert.equal(summary.periods[0].endedReason, 'session_completed');
    assert.equal(summary.totalAwayTimeMs, 7000);
    assert.equal(summary.isCurrentlyAway, false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: Unknown detection states are not automatically counted as away
  // ---------------------------------------------------------------------------
  it('Scenario 8: Unknown detection states are not automatically counted as away', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-unknown-state', baseTime);

    // Initial unknown state
    tracker.processSignal({ personPresence: 'unknown', timestamp: baseTime + 1000 });
    // User is present
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 2000 });
    // Transition to unknown
    tracker.processSignal({ personPresence: 'unknown', timestamp: baseTime + 5000 });
    // Back to present
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 10000 });

    tracker.endSession(baseTime + 12000);

    const summary = tracker.calculateAwayTime('session-unknown-state');
    // UNKNOWN must not be treated as away
    assert.equal(summary.totalAwayTimeMs, 0);
    assert.equal(summary.periods.length, 0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: Invalid or out-of-order timestamps are handled safely
  // ---------------------------------------------------------------------------
  it('Scenario 9: Invalid or out-of-order timestamps are handled safely', () => {
    const baseTime = 1770000000000;
    const rawEvents: ActivityEvent[] = [
      {
        id: 'evt-3',
        sessionId: 'session-out-of-order',
        timestamp: baseTime + 10000,
        type: 'PERSON_PRESENT',
        category: 'person',
        stateValue: 'PRESENT',
      },
      {
        id: 'evt-1',
        sessionId: 'session-out-of-order',
        timestamp: baseTime,
        type: 'SESSION_STARTED',
        category: 'session',
        stateValue: 'STARTED',
      },
      {
        id: 'evt-2',
        sessionId: 'session-out-of-order',
        timestamp: baseTime + 2000,
        type: 'PERSON_AWAY',
        category: 'person',
        stateValue: 'AWAY',
      },
      {
        id: 'evt-invalid',
        sessionId: 'session-out-of-order',
        timestamp: NaN,
        type: 'PERSON_AWAY',
        category: 'person',
      },
    ];

    const summary = calculateAwayTimeFromEvents(rawEvents, 'session-out-of-order');
    // Out-of-order events sorted: Started (0) -> Away (2000) -> Present (10000) => 8000ms
    assert.equal(summary.periods.length, 1);
    assert.equal(summary.periods[0].startedAt, baseTime + 2000);
    assert.equal(summary.periods[0].endedAt, baseTime + 10000);
    assert.equal(summary.periods[0].durationMs, 8000);
    assert.equal(summary.totalAwayTimeMs, 8000);
  });

  // ---------------------------------------------------------------------------
  // Scenario 10: Events from another session do not affect the current session total
  // ---------------------------------------------------------------------------
  it('Scenario 10: Events from another session do not affect current session total', () => {
    const baseTime = 1770000000000;

    // Session A
    tracker.startSession('session-A', baseTime);
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 1000 });
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 6000 }); // 5s away
    tracker.endSession(baseTime + 7000);

    // Session B
    tracker.startSession('session-B', baseTime + 8000);
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 9000 });
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 11000 }); // 2s away
    tracker.endSession(baseTime + 12000);

    const summaryA = tracker.calculateAwayTime('session-A');
    const summaryB = tracker.calculateAwayTime('session-B');

    assert.equal(summaryA.totalAwayTimeMs, 5000);
    assert.equal(summaryB.totalAwayTimeMs, 2000);
  });

  // ---------------------------------------------------------------------------
  // Scenario 11: A completed session does not accumulate additional away time
  // ---------------------------------------------------------------------------
  it('Scenario 11: A completed session does not accumulate additional away time', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-completed-check', baseTime);
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 2000 });
    tracker.completeSession(baseTime + 8000); // 6s away

    // Signals delivered after session completion
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 10000 });

    const summary = tracker.calculateAwayTime('session-completed-check', {
      now: baseTime + 20000,
    });
    // Must remain fixed at 6000ms; does not accumulate post-completion
    assert.equal(summary.totalAwayTimeMs, 6000);
    assert.equal(summary.isCurrentlyAway, false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 12: Stateful AwayTimeCalculator class handles live step-by-step updates
  // ---------------------------------------------------------------------------
  it('Scenario 12: Stateful AwayTimeCalculator handles live transitions', () => {
    const calculator = new AwayTimeCalculator('session-live');
    const t0 = 100000;

    calculator.onSessionStarted('session-live', t0);
    calculator.onPersonStateChange('AWAY', t0 + 2000);
    calculator.onPersonStateChange('PRESENT', t0 + 5000); // 3,000ms

    calculator.onPersonStateChange('AWAY', t0 + 8000);
    calculator.onSessionPaused(t0 + 10000); // 2,000ms (paused stops away period)
    calculator.onSessionResumed(t0 + 15000); // resume continues away state
    calculator.onPersonStateChange('PRESENT', t0 + 17000); // 2,000ms

    calculator.onSessionEnded(t0 + 20000);

    const summary = calculator.getSummary(t0 + 25000);
    assert.equal(summary.periods.length, 3);
    assert.equal(summary.totalAwayTimeMs, 7000); // 3000 + 2000 + 2000
    assert.equal(summary.totalAwayTimeSeconds, 7);
  });
});
