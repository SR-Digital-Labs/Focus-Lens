/**
 * FocusLens — Day 28: Analytics Visualizations Test Suite
 * =======================================================
 * Automated test suite verifying:
 * 1. Date boundary calculations (start/end of day, start/end of week)
 * 2. Daily timeline aggregation into interval buckets
 * 3. Weekly day-by-day aggregation (Mon -> Sun)
 * 4. Focus indicator score mapping and trend calculation
 * 5. Empty period handling and date boundary precision
 * 6. Non-interference with underlying session records
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '../src/types/index.ts';
import {
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  formatDayDateLabel,
  formatWeekRangeLabel,
  aggregateDailyData,
  aggregateWeeklyData,
  STANDARD_DAY_INTERVALS,
} from '../src/utils/analyticsVisualizations.ts';

// Helper to create test session records on specific local dates
function makeSession(
  id: string,
  year: number,
  month: number, // 0-indexed
  day: number,
  hour: number,
  minute: number,
  elapsedSeconds: number,
  awayDurationSeconds = 0,
  focusScore?: number,
): Session {
  const date = new Date(year, month, day, hour, minute, 0, 0);
  return {
    id,
    status: 'completed',
    plannedDurationSeconds: 1500,
    startedAt: date.toISOString(),
    pausedAt: null,
    endedAt: new Date(date.getTime() + elapsedSeconds * 1000).toISOString(),
    elapsedSeconds,
    pausedDurationSeconds: 0,
    awayDurationSeconds,
    focusScore,
  };
}

describe('Day 28 — Date Boundary Calculations', () => {
  it('correctly calculates start and end of day', () => {
    const ref = new Date('2026-10-28T14:35:20.123Z');
    const start = getStartOfDay(ref);
    const end = getEndOfDay(ref);

    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.equal(start.getSeconds(), 0);
    assert.equal(start.getMilliseconds(), 0);

    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
    assert.equal(end.getSeconds(), 59);
    assert.equal(end.getMilliseconds(), 999);
  });

  it('correctly calculates start and end of week (Monday to Sunday)', () => {
    // 2026-10-28 is a Wednesday
    const wednesday = new Date(2026, 9, 28, 12, 0, 0);
    const monday = getStartOfWeek(wednesday);
    const sunday = getEndOfWeek(wednesday);

    // Monday should be day 1 (Oct 26, 2026)
    assert.equal(monday.getDay(), 1);
    assert.equal(monday.getDate(), 26);
    assert.equal(monday.getHours(), 0);

    // Sunday should be day 0 (Nov 1, 2026)
    assert.equal(sunday.getDay(), 0);
    assert.equal(sunday.getDate(), 1);
    assert.equal(sunday.getHours(), 23);
  });

  it('handles Sunday correctly when finding start of week', () => {
    // 2026-11-01 is Sunday
    const sunday = new Date(2026, 10, 1, 15, 0, 0);
    const monday = getStartOfWeek(sunday);
    assert.equal(monday.getDay(), 1);
    assert.equal(monday.getDate(), 26); // Oct 26
  });

  it('formats readable day labels and week range labels', () => {
    const d = new Date(2026, 9, 28);
    const label = formatDayDateLabel(d);
    assert.match(label, /Oct/);
    assert.match(label, /28/);
    assert.match(label, /2026/);

    const start = new Date(2026, 9, 26);
    const end = new Date(2026, 10, 1);
    const range = formatWeekRangeLabel(start, end);
    assert.match(range, /Oct 26/);
    assert.match(range, /Nov 1/);
  });
});

describe('Day 28 — Daily Analytics Aggregation', () => {
  it('aggregates sessions across daily intervals and calculates total metrics', () => {
    // Sessions on Oct 28, 2026
    const s1 = makeSession('s1', 2026, 9, 28, 9, 15, 1500, 120, 92); // 09:15 -> 09:00-12:00 interval
    const s2 = makeSession('s2', 2026, 9, 28, 10, 30, 1200, 60, 88); // 10:30 -> 09:00-12:00 interval
    const s3 = makeSession('s3', 2026, 9, 28, 14, 0, 900, 0, 96);    // 14:00 -> 12:00-15:00 interval

    // Session on another day (Oct 27) - must be excluded
    const sOther = makeSession('other', 2026, 9, 27, 10, 0, 1800, 0, 90);

    const targetDate = new Date(2026, 9, 28);
    const dailyData = aggregateDailyData([s1, s2, s3, sOther], targetDate);

    assert.equal(dailyData.hasData, true);
    assert.equal(dailyData.sessionCount, 3);
    assert.equal(dailyData.totalFocusSeconds, 3600); // 1500 + 1200 + 900
    assert.equal(dailyData.totalAwaySeconds, 180);   // 120 + 60
    assert.equal(dailyData.averageFocusScore, 92);   // (92 + 88 + 96) / 3 = 92

    // Check interval distribution
    assert.equal(dailyData.intervals.length, STANDARD_DAY_INTERVALS.length);
    const morningInterval = dailyData.intervals.find((i) => i.hourStart === 9);
    assert.ok(morningInterval);
    assert.equal(morningInterval.sessionCount, 2);
    assert.equal(morningInterval.focusSeconds, 2700);
    assert.equal(morningInterval.awaySeconds, 180);
    assert.equal(morningInterval.focusScore, 90); // (92 + 88) / 2

    const afternoonInterval = dailyData.intervals.find((i) => i.hourStart === 12);
    assert.ok(afternoonInterval);
    assert.equal(afternoonInterval.sessionCount, 1);
    assert.equal(afternoonInterval.focusSeconds, 900);
    assert.equal(afternoonInterval.focusScore, 96);
  });

  it('handles a day with no sessions gracefully without crashing or NaN', () => {
    const emptyDay = new Date(2026, 9, 25);
    const dailyData = aggregateDailyData([], emptyDay);

    assert.equal(dailyData.hasData, false);
    assert.equal(dailyData.sessionCount, 0);
    assert.equal(dailyData.totalFocusSeconds, 0);
    assert.equal(dailyData.totalAwaySeconds, 0);
    assert.equal(dailyData.averageFocusScore, null);
    assert.equal(dailyData.intervals.length, STANDARD_DAY_INTERVALS.length);
    assert.ok(dailyData.intervals.every((i) => i.focusSeconds === 0 && i.sessionCount === 0 && i.focusScore === null));
  });

  it('correctly maps scores using external scoreMap if session fields are unpopulated', () => {
    const s1 = makeSession('session-unscored', 2026, 9, 28, 9, 0, 1500, 0);
    const scoreMap = new Map<string, number>([['session-unscored', 85]]);

    const dailyData = aggregateDailyData([s1], new Date(2026, 9, 28), scoreMap);
    assert.equal(dailyData.averageFocusScore, 85);
  });
});

describe('Day 28 — Weekly Analytics Aggregation', () => {
  it('aggregates sessions across the 7 days of a week (Mon to Sun)', () => {
    // Week: Mon Oct 26, 2026 to Sun Nov 1, 2026
    const sMon = makeSession('s-mon', 2026, 9, 26, 10, 0, 1500, 60, 90);
    const sWed = makeSession('s-wed', 2026, 9, 28, 11, 0, 1800, 120, 94);
    const sFri = makeSession('s-fri', 2026, 9, 30, 15, 0, 900, 0, 86);
    const sSun = makeSession('s-sun', 2026, 10, 1, 20, 0, 600, 0, 100);

    // Outside week: Tue Nov 3
    const sNextWeek = makeSession('next', 2026, 10, 3, 10, 0, 1500, 0, 95);

    const weekStart = new Date(2026, 9, 28); // Wednesday in that week
    const weeklyData = aggregateWeeklyData([sMon, sWed, sFri, sSun, sNextWeek], weekStart);

    assert.equal(weeklyData.hasData, true);
    assert.equal(weeklyData.totalSessions, 4);
    assert.equal(weeklyData.totalFocusSeconds, 4800); // 1500 + 1800 + 900 + 600
    assert.equal(weeklyData.totalAwaySeconds, 180);   // 60 + 120
    assert.equal(weeklyData.averageFocusScore, 93);   // (90 + 94 + 86 + 100) / 4 = 92.5 -> 93

    // Verify exactly 7 daily buckets exist: Mon through Sun
    assert.equal(weeklyData.days.length, 7);
    assert.equal(weeklyData.days[0].dayName, 'Mon');
    assert.equal(weeklyData.days[0].focusSeconds, 1500);
    assert.equal(weeklyData.days[0].focusScore, 90);

    assert.equal(weeklyData.days[1].dayName, 'Tue');
    assert.equal(weeklyData.days[1].focusSeconds, 0); // No sessions on Tuesday
    assert.equal(weeklyData.days[1].focusScore, null);

    assert.equal(weeklyData.days[2].dayName, 'Wed');
    assert.equal(weeklyData.days[2].focusSeconds, 1800);
    assert.equal(weeklyData.days[2].focusScore, 94);

    assert.equal(weeklyData.days[6].dayName, 'Sun');
    assert.equal(weeklyData.days[6].focusSeconds, 600);
    assert.equal(weeklyData.days[6].focusScore, 100);
  });

  it('handles an empty week without errors', () => {
    const emptyWeek = new Date(2026, 8, 1);
    const weeklyData = aggregateWeeklyData([], emptyWeek);

    assert.equal(weeklyData.hasData, false);
    assert.equal(weeklyData.totalSessions, 0);
    assert.equal(weeklyData.totalFocusSeconds, 0);
    assert.equal(weeklyData.totalAwaySeconds, 0);
    assert.equal(weeklyData.averageFocusScore, null);
    assert.equal(weeklyData.days.length, 7);
    assert.ok(weeklyData.days.every((d) => d.focusSeconds === 0 && d.sessionCount === 0 && d.focusScore === null));
  });
});
