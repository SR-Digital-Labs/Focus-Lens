import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateFocusIndicator,
  calculateFocusIndicatorFromEvents,
  DEFAULT_FOCUS_INDICATOR_WEIGHTS,
  type FocusIndicatorResult,
  type FocusSessionMetricsInput,
} from '../src/services/focusIndicator.service.ts';
import { ActivityEventTrackerService } from '../src/services/activityEventTracker.service.ts';

describe('FocusIndicatorCalculation — Day 19 Verification Scenarios', () => {
  let tracker: ActivityEventTrackerService;

  beforeEach(() => {
    tracker = new ActivityEventTrackerService({ minTransitionIntervalMs: 0 });
  });

  // ---------------------------------------------------------------------------
  // Check 1: Valid session metrics produce a valid Focus Indicator
  // ---------------------------------------------------------------------------
  it('Check 1: Valid session metrics produce a valid Focus Indicator', () => {
    // Example from TRD Section 18:
    // Session Duration: 60 min (3600s)
    // Person Present: 54 min (3240s)
    // Screen Facing: 48 min (2880s)
    // Away Time: 6 min (360s)
    const metrics: FocusSessionMetricsInput = {
      sessionId: 'session-valid-1',
      activeDurationSeconds: 3600,
      presentDurationSeconds: 3240,
      awayDurationSeconds: 360,
      screenFacingDurationSeconds: 2880,
      goodPostureDurationSeconds: 2700,
      slouchedPostureDurationSeconds: 300,
    };

    const result = calculateFocusIndicator(metrics);

    assert.equal(result.sessionId, 'session-valid-1');
    assert.equal(result.status, 'calculated');
    assert.ok(typeof result.score === 'number');
    assert.ok(result.score! >= 0 && result.score! <= 100);
    assert.ok(result.confidence > 0.9);
    assert.ok(result.disclaimer.includes('application-generated'));
  });

  // ---------------------------------------------------------------------------
  // Check 2: Different metric values affect the result according to the defined formula
  // ---------------------------------------------------------------------------
  it('Check 2: Different metric values affect the result according to the defined formula', () => {
    const highFocus: FocusSessionMetricsInput = {
      sessionId: 'session-high',
      activeDurationSeconds: 1000,
      awayDurationSeconds: 0,
      screenFacingDurationSeconds: 950,
      goodPostureDurationSeconds: 950,
      slouchedPostureDurationSeconds: 50,
    };

    const lowerFocus: FocusSessionMetricsInput = {
      sessionId: 'session-low',
      activeDurationSeconds: 1000,
      awayDurationSeconds: 400, // 40% away
      screenFacingDurationSeconds: 300,
      goodPostureDurationSeconds: 200,
      slouchedPostureDurationSeconds: 400,
    };

    const highResult = calculateFocusIndicator(highFocus);
    const lowResult = calculateFocusIndicator(lowerFocus);

    assert.ok(highResult.score! > lowResult.score!, `Expected highResult (${highResult.score}) > lowResult (${lowResult.score})`);
    assert.ok(highResult.score! > 90);
    assert.ok(lowResult.score! < 60);
  });

  // ---------------------------------------------------------------------------
  // Check 3: The result remains within the documented scoring range [0, 100]
  // ---------------------------------------------------------------------------
  it('Check 3: The result remains within the documented scoring range [0, 100]', () => {
    // Perfect focus session
    const perfect: FocusSessionMetricsInput = {
      activeDurationSeconds: 1800,
      awayDurationSeconds: 0,
      presentDurationSeconds: 1800,
      screenFacingDurationSeconds: 1800,
      goodPostureDurationSeconds: 1800,
      slouchedPostureDurationSeconds: 0,
    };
    const perfectResult = calculateFocusIndicator(perfect);
    assert.equal(perfectResult.score, 100);

    // Worst-case session (away entire time)
    const worst: FocusSessionMetricsInput = {
      activeDurationSeconds: 1800,
      awayDurationSeconds: 1800,
      presentDurationSeconds: 0,
      screenFacingDurationSeconds: 0,
      goodPostureDurationSeconds: 0,
      slouchedPostureDurationSeconds: 1800,
    };
    const worstResult = calculateFocusIndicator(worst);
    assert.equal(worstResult.score, 0);
  });

  // ---------------------------------------------------------------------------
  // Check 4: Zero-duration sessions do not cause division-by-zero errors
  // ---------------------------------------------------------------------------
  it('Check 4: Zero-duration sessions do not cause division-by-zero errors', () => {
    const zeroDuration: FocusSessionMetricsInput = {
      sessionId: 'session-zero',
      activeDurationSeconds: 0,
      awayDurationSeconds: 0,
    };

    const result = calculateFocusIndicator(zeroDuration);
    assert.equal(result.status, 'no_active_time');
    assert.equal(result.score, null);
    assert.ok(result.summaryMessage.includes('zero or invalid'));
  });

  // ---------------------------------------------------------------------------
  // Check 5: Missing or unknown metrics are handled transparently
  // ---------------------------------------------------------------------------
  it('Check 5: Missing or unknown metrics are handled transparently', () => {
    // Session where camera is off or posture/screen facing is unobserved
    const presenceOnly: FocusSessionMetricsInput = {
      sessionId: 'session-presence-only',
      activeDurationSeconds: 1000,
      awayDurationSeconds: 100, // 90% presence
      // screenFacing and posture omitted
    };

    const result = calculateFocusIndicator(presenceOnly, { unobservedHandling: 'redistribute' });

    assert.equal(result.status, 'calculated');
    assert.equal(result.breakdown.screenFacingRatio, null);
    assert.equal(result.breakdown.postureRatio, null);
    assert.equal(result.breakdown.presenceRatio, 0.9);
    // Weight should be redistributed 100% to presence without penalizing missing camera
    assert.equal(result.effectiveWeights.presenceWeight, 1);
    assert.equal(result.effectiveWeights.screenFacingWeight, 0);
    assert.equal(result.effectiveWeights.postureWeight, 0);
    assert.equal(result.score, 90);
  });

  // ---------------------------------------------------------------------------
  // Check 6: Invalid or negative durations do not produce misleading results
  // ---------------------------------------------------------------------------
  it('Check 6: Invalid or negative durations do not produce misleading results', () => {
    const invalidNegative: FocusSessionMetricsInput = {
      sessionId: 'session-negative',
      activeDurationSeconds: -100,
      awayDurationSeconds: -50,
    };

    const result = calculateFocusIndicator(invalidNegative);
    assert.equal(result.status, 'no_active_time');
    assert.equal(result.score, null);

    // Away duration exceeding active duration is clamped
    const clampedAway: FocusSessionMetricsInput = {
      sessionId: 'session-excess-away',
      activeDurationSeconds: 300,
      awayDurationSeconds: 99999, // impossible excess
    };

    const clampedResult = calculateFocusIndicator(clampedAway);
    assert.equal(clampedResult.status, 'calculated');
    assert.equal(clampedResult.breakdown.awayRatio, 1.0);
    assert.equal(clampedResult.breakdown.presenceRatio, 0.0);
    assert.equal(clampedResult.score, 0);
  });

  // ---------------------------------------------------------------------------
  // Check 7: Ratios and percentages are normalized correctly
  // ---------------------------------------------------------------------------
  it('Check 7: Ratios and percentages are normalized correctly', () => {
    const metrics: FocusSessionMetricsInput = {
      sessionId: 'session-norm',
      activeDurationSeconds: 1000,
      awayDurationSeconds: 200, // 80% presence
      presentDurationSeconds: 800,
      screenFacingDurationSeconds: 600, // 600 / 800 = 75%
      goodPostureDurationSeconds: 700,
      slouchedPostureDurationSeconds: 100, // 700 / 800 = 87.5%
    };

    const result = calculateFocusIndicator(metrics);

    assert.equal(result.breakdown.presenceRatio, 0.8);
    assert.equal(result.breakdown.screenFacingRatio, 0.75);
    assert.equal(result.breakdown.postureRatio, 0.875);
    assert.equal(result.breakdown.awayRatio, 0.2);

    // Expected score with default weights (0.40, 0.35, 0.25):
    // 0.80 * 0.40 + 0.75 * 0.35 + 0.875 * 0.25 = 0.32 + 0.2625 + 0.21875 = 0.80125 -> 80.1%
    assert.equal(result.score, 80.1);
  });

  // ---------------------------------------------------------------------------
  // Check 8: Repeated calculations using identical inputs produce identical results
  // ---------------------------------------------------------------------------
  it('Check 8: Repeated calculations using identical inputs produce identical results', () => {
    const metrics: FocusSessionMetricsInput = {
      sessionId: 'session-deterministic',
      activeDurationSeconds: 1500,
      awayDurationSeconds: 150,
      screenFacingDurationSeconds: 1200,
      goodPostureDurationSeconds: 1100,
      slouchedPostureDurationSeconds: 250,
    };

    const run1 = calculateFocusIndicator(metrics);
    const run2 = calculateFocusIndicator(metrics);
    const run3 = calculateFocusIndicator(metrics);

    assert.deepEqual(run1, run2);
    assert.deepEqual(run2, run3);
  });

  // ---------------------------------------------------------------------------
  // Check 9: Metrics from another session cannot affect the current session result
  // ---------------------------------------------------------------------------
  it('Check 9: Metrics from another session cannot affect the current session result', () => {
    const baseTime = 1770000000000;
    // Session A
    tracker.startSession('session-A', baseTime);
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 1000 });
    tracker.processSignal({ screenFacing: 'facing', timestamp: baseTime + 2000 });
    tracker.completeSession(baseTime + 10000);

    // Session B
    tracker.startSession('session-B', baseTime + 20000);
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 21000 });
    tracker.completeSession(baseTime + 30000);

    const resultA = tracker.calculateFocusIndicator('session-A');
    const resultB = tracker.calculateFocusIndicator('session-B');

    assert.equal(resultA.sessionId, 'session-A');
    assert.equal(resultB.sessionId, 'session-B');
    assert.ok(resultA.score! > resultB.score!, 'Session A (present) should score higher than Session B (away)');
  });

  // ---------------------------------------------------------------------------
  // Check 10: Paused, resumed, and completed session lifecycle behavior
  // ---------------------------------------------------------------------------
  it('Check 10: Paused, resumed, and completed session lifecycle behavior', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-pause-resume', baseTime);
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 1000 });
    tracker.processSignal({ screenFacing: 'facing', timestamp: baseTime + 2000 });

    // Pause at +5,000ms
    tracker.pauseSession(baseTime + 5000);

    // Signals during pause must be ignored by tracker
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 7000 });

    // Resume at +15,000ms (10 seconds paused)
    tracker.resumeSession(baseTime + 15000);
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 16000 });

    // Complete session at +25,000ms
    tracker.completeSession(baseTime + 25000);

    const result = tracker.calculateFocusIndicator('session-pause-resume');

    // Total session duration was 25s, but 10s was paused, so active time is ~15s
    assert.equal(result.status, 'calculated');
    assert.ok(result.score! >= 90, 'Focus indicator should remain high because away signal during pause was ignored');
  });

  // ---------------------------------------------------------------------------
  // Check 11: Existing activity-event tracking and away-time calculation continue to work
  // ---------------------------------------------------------------------------
  it('Check 11: Existing activity-event tracking and away-time calculation continue to work', () => {
    const baseTime = 1770000000000;
    tracker.startSession('session-coexist', baseTime);
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 1000 });
    tracker.processSignal({ personPresence: 'away', timestamp: baseTime + 5000 });
    tracker.processSignal({ personPresence: 'present', timestamp: baseTime + 15000 }); // 10s away
    tracker.completeSession(baseTime + 20000);

    // Existing away time calculation check
    const awaySummary = tracker.calculateAwayTime('session-coexist');
    assert.equal(awaySummary.totalAwayTimeSeconds, 10);
    assert.equal(awaySummary.periods.length, 1);

    // New focus indicator calculation check
    const focusResult = tracker.calculateFocusIndicator('session-coexist');
    assert.equal(focusResult.status, 'calculated');
    assert.equal(focusResult.breakdown.awayRatio, 0.5); // 10s away / 20s active
  });

  // ---------------------------------------------------------------------------
  // Check 12: Configurable weights work as expected
  // ---------------------------------------------------------------------------
  it('Check 12: Configurable weights work as expected', () => {
    const metrics: FocusSessionMetricsInput = {
      activeDurationSeconds: 100,
      awayDurationSeconds: 0, // presence ratio 1.0
      screenFacingDurationSeconds: 50, // screen facing ratio 0.5
      goodPostureDurationSeconds: 100, // posture ratio 1.0
      slouchedPostureDurationSeconds: 0,
    };

    // Custom weighting prioritizing screen facing heavily
    const customResult = calculateFocusIndicator(metrics, {
      weights: {
        presenceWeight: 0.1,
        screenFacingWeight: 0.8,
        postureWeight: 0.1,
      },
    });

    // Score: 1.0 * 0.1 + 0.5 * 0.8 + 1.0 * 0.1 = 0.1 + 0.4 + 0.1 = 0.60 -> 60%
    assert.equal(customResult.score, 60);
  });
});
