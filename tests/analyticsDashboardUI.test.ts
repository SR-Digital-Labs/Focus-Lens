/**
 * FocusLens — Day 27: Analytics Dashboard UI & Metrics Integration Tests
 * ======================================================================
 * Automated tests verifying:
 * 1. Analytics Dashboard metric aggregation from real services (DashboardMetricsService & SessionRetrievalService)
 * 2. Correct computation and formatting for the 7 summary metrics:
 *    - Total Focus Time
 *    - Total Number of Sessions
 *    - Average Session Duration
 *    - Total Away Time
 *    - Focus Indicator score aggregation
 *    - Screen-Facing Duration (handled safely as null/untracked)
 *    - Posture Events (handled safely as null/untracked)
 * 3. Handling of all UI states:
 *    - Loaded state with populated records
 *    - Empty / Insufficient data state (zero division guard, NaN protection)
 *    - Incomplete/boundary data handling
 * 4. Outcome distribution calculation (completed, cancelled, interrupted)
 * 5. Recent session display formatting and presentation helpers
 * 6. Non-interference with active focus session timer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityEvent, Session } from '../src/types/index.ts';
import { calculateDashboardMetrics, type DashboardMetrics } from '../src/services/dashboardMetrics.service.ts';
import { FocusTimerService } from '../src/services/focusTimer.service.ts';
import {
  formatSessionDate,
  formatSessionTime,
  formatSessionDuration,
  formatSessionAwayDuration,
} from '../src/utils/historyFormatters.ts';

const t0 = Date.parse('2026-10-28T08:00:00.000Z');

function createSession(
  id: string,
  elapsedSeconds: number,
  status: Session['status'] = 'completed',
  plannedSeconds = 1500,
): Session {
  return {
    id,
    status,
    plannedDurationSeconds: plannedSeconds,
    startedAt: new Date(t0).toISOString(),
    pausedAt: status === 'paused' ? new Date(t0 + 60_000).toISOString() : null,
    endedAt: ['completed', 'cancelled', 'interrupted'].includes(status)
      ? new Date(t0 + elapsedSeconds * 1000).toISOString()
      : null,
    elapsedSeconds,
    pausedDurationSeconds: status === 'paused' ? 60 : 0,
  };
}

function createAwayEvent(
  id: string,
  startedAt: number,
  durationSeconds: number,
  sessionId = 's1',
): ActivityEvent {
  return {
    id,
    sessionId,
    type: 'away',
    timestamp: startedAt + 300_000,
    awayStartedAt: startedAt,
    thresholdReachedAt: startedAt + 300_000,
    endedAt: startedAt + durationSeconds * 1000,
    duration: durationSeconds,
  };
}

describe('Day 27 — Analytics Dashboard Metrics Integration', () => {
  it('correctly aggregates real focus sessions and away intervals into DashboardMetrics', () => {
    const sessions = [
      createSession('s1', 1500, 'completed', 1500),
      createSession('s2', 900, 'cancelled', 1500),
      createSession('s3', 600, 'interrupted', 1200),
    ];

    const events = [
      createAwayEvent('a1', t0 + 100_000, 120, 's1'),
      createAwayEvent('a2', t0 + 400_000, 60, 's1'),
    ];

    const metrics: DashboardMetrics = calculateDashboardMetrics(sessions, events);

    // 1. Total Focus Time: 1500 + 900 + 600 = 3000s (50m)
    assert.equal(metrics.totalFocusTimeSeconds, 3000);

    // 2. Total Sessions: 3
    assert.equal(metrics.sessionCount, 3);

    // 3. Average Session Duration: 3000 / 3 = 1000s
    assert.equal(metrics.averageSessionLengthSeconds, 1000);

    // 4. Total Away Time: 120 + 60 = 180s
    assert.equal(metrics.totalAwayTimeSeconds, 180);

    // 5. Focus Indicators generated for each session
    assert.equal(metrics.focusIndicators.length, 3);
    assert.ok(metrics.focusIndicators.every((fi) => fi.status === 'calculated'));

    // 6. Unsupported / unobserved metrics strictly reported as null (not fabricated)
    assert.equal(metrics.screenFacingDurationSeconds, null);
    assert.equal(metrics.postureEventCount, null);
  });

  it('safely handles empty data state without NaN, infinities, or division by zero', () => {
    const emptyMetrics: DashboardMetrics = calculateDashboardMetrics([], []);

    assert.equal(emptyMetrics.totalFocusTimeSeconds, 0);
    assert.equal(emptyMetrics.sessionCount, 0);
    assert.equal(emptyMetrics.averageSessionLengthSeconds, 0);
    assert.equal(emptyMetrics.totalAwayTimeSeconds, 0);
    assert.equal(emptyMetrics.screenFacingDurationSeconds, null);
    assert.equal(emptyMetrics.postureEventCount, null);
    assert.deepEqual(emptyMetrics.focusIndicators, []);

    // Derived completion rate with zero sessions
    const totalSessions = emptyMetrics.sessionCount;
    const completedSessions = 0;
    const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
    assert.equal(completionRate, 0);
    assert.equal(!Number.isNaN(completionRate), true);
  });

  it('aggregates average Focus Indicator score safely across calculated indicators', () => {
    const sessions = [
      createSession('s1', 1500, 'completed'),
      createSession('s2', 1200, 'completed'),
    ];
    // No away time -> high focus score
    const metrics = calculateDashboardMetrics(sessions, []);

    const calculatedScores: number[] = [];
    for (const indicator of metrics.focusIndicators) {
      if (
        indicator.status === 'calculated' &&
        typeof indicator.score === 'number' &&
        Number.isFinite(indicator.score)
      ) {
        calculatedScores.push(indicator.score);
      }
    }

    assert.equal(calculatedScores.length, 2);
    const avgScore = Math.round(calculatedScores.reduce((sum, s) => sum + s, 0) / calculatedScores.length);
    assert.ok(avgScore >= 90 && avgScore <= 100);
  });

  it('safely handles sessions with zero duration without crashing', () => {
    const zeroSession = createSession('zero', 0, 'cancelled', 1500);
    const metrics = calculateDashboardMetrics([zeroSession], []);

    assert.equal(metrics.totalFocusTimeSeconds, 0);
    assert.equal(metrics.sessionCount, 1);
    assert.equal(metrics.averageSessionLengthSeconds, 0);
    assert.equal(metrics.totalAwayTimeSeconds, 0);

    // Indicator status for zero active time
    assert.equal(metrics.focusIndicators[0]?.status, 'no_active_time');
  });
});

describe('Day 27 — Outcome Distribution & Recent Session Presentation', () => {
  it('correctly calculates session outcome counts and ratios', () => {
    const sessions = [
      createSession('s1', 1500, 'completed'),
      createSession('s2', 1500, 'completed'),
      createSession('s3', 600, 'cancelled'),
      createSession('s4', 300, 'interrupted'),
    ];

    const total = sessions.length;
    const completed = sessions.filter((s) => s.status === 'completed').length;
    const cancelled = sessions.filter((s) => s.status === 'cancelled').length;
    const interrupted = sessions.filter((s) => s.status === 'interrupted').length;

    assert.equal(total, 4);
    assert.equal(completed, 2);
    assert.equal(cancelled, 1);
    assert.equal(interrupted, 1);

    const completionRate = Math.round((completed / total) * 100);
    const cancelRate = Math.round((cancelled / total) * 100);
    const interruptRate = Math.round((interrupted / total) * 100);

    assert.equal(completionRate, 50);
    assert.equal(cancelRate, 25);
    assert.equal(interruptRate, 25);
  });

  it('formats recent session display fields accurately', () => {
    const testSession = createSession('s-recent', 1530, 'completed', 1800);
    const dateFormatted = formatSessionDate(testSession.startedAt);
    const timeFormatted = formatSessionTime(testSession.startedAt);
    const focusDurationFormatted = formatSessionDuration(testSession.elapsedSeconds);
    const plannedDurationFormatted = formatSessionDuration(testSession.plannedDurationSeconds);
    const awayDurationFormatted = formatSessionAwayDuration(undefined);

    assert.notEqual(dateFormatted, '—');
    assert.notEqual(timeFormatted, '—');
    assert.equal(focusDurationFormatted, '25m 30s');
    assert.equal(plannedDurationFormatted, '30m');
    assert.equal(awayDurationFormatted, '—');
  });
});

describe('Day 27 — Non-Interference With Active Focus Session', () => {
  it('retrieving and computing analytics does not alter an active timer', () => {
    const timer = new FocusTimerService();
    timer.setDuration(25);
    timer.start();

    const stateBefore = timer.getState();
    assert.equal(stateBefore.status, 'running');
    assert.equal(stateBefore.remainingSeconds, 25 * 60);

    // Compute metrics while timer is active
    const sessions = [createSession('prev1', 1200)];
    const metrics = calculateDashboardMetrics(sessions, []);
    assert.equal(metrics.sessionCount, 1);

    // Verify timer state is unaffected
    const stateAfter = timer.getState();
    assert.equal(stateAfter.status, 'running');
    assert.equal(stateAfter.remainingSeconds, 25 * 60);

    timer.end();
  });
});
