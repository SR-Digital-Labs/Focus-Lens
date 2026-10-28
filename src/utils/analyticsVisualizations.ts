/**
 * FocusLens — Day 28: Daily and Weekly Analytics Visualization Utilities
 * =======================================================================
 * Pure data transformation and date grouping helpers for:
 * 1. Daily timeline aggregation (hourly/interval buckets)
 * 2. Weekly day-by-day aggregation (Monday through Sunday)
 * 3. Date boundary calculations (start/end of day, start/end of week)
 * 4. Metric consistency and Focus Indicator score mapping
 */

import type { Session } from '../types/index.ts';

export interface DailyIntervalBucket {
  /** Label for the time interval (e.g., '06:00', '09:00', '12:00') */
  label: string;
  /** Starting hour (0-23) */
  hourStart: number;
  /** Ending hour (0-23) */
  hourEnd: number;
  /** Confirmed focus duration in seconds */
  focusSeconds: number;
  /** Confirmed away duration in seconds */
  awaySeconds: number;
  /** Number of sessions in this interval */
  sessionCount: number;
  /** Average Focus Indicator score for sessions in this interval, or null */
  focusScore: number | null;
}

export interface DailyAnalyticsData {
  date: Date;
  dateLabel: string;
  totalFocusSeconds: number;
  totalAwaySeconds: number;
  sessionCount: number;
  averageFocusScore: number | null;
  intervals: DailyIntervalBucket[];
  hasData: boolean;
}

export interface WeeklyDayBucket {
  date: Date;
  dayName: string; // 'Mon', 'Tue', etc.
  fullDateLabel: string; // 'Oct 28'
  focusSeconds: number;
  awaySeconds: number;
  sessionCount: number;
  focusScore: number | null;
}

export interface WeeklyAnalyticsData {
  startDate: Date;
  endDate: Date;
  rangeLabel: string;
  totalFocusSeconds: number;
  totalAwaySeconds: number;
  totalSessions: number;
  averageFocusScore: number | null;
  days: WeeklyDayBucket[];
  hasData: boolean;
}

/**
 * Normalizes a date to start of local day (00:00:00.000).
 */
export function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Normalizes a date to end of local day (23:59:59.999).
 */
export function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Returns Monday at 00:00:00.000 for the week containing `date`.
 */
export function getStartOfWeek(date: Date): Date {
  const d = getStartOfDay(date);
  // In JS, 0 is Sunday, 1 is Monday ... 6 is Saturday
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Returns Sunday at 23:59:59.999 for the week containing `date`.
 */
export function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Format a single day date label (e.g., 'Wednesday, Oct 28, 2026').
 */
export function formatDayDateLabel(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * Format a week range label (e.g., 'Oct 26 – Nov 1, 2026').
 */
export function formatWeekRangeLabel(start: Date, end: Date): string {
  try {
    const startStr = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(start);

    const endStr = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(end);

    return `${startStr} – ${endStr}`;
  } catch {
    return `${start.toDateString()} – ${end.toDateString()}`;
  }
}

/**
 * Standard 3-hour interval definitions across a 24-hour day.
 */
export const STANDARD_DAY_INTERVALS = [
  { label: '00:00–03:00', hourStart: 0, hourEnd: 3 },
  { label: '03:00–06:00', hourStart: 3, hourEnd: 6 },
  { label: '06:00–09:00', hourStart: 6, hourEnd: 9 },
  { label: '09:00–12:00', hourStart: 9, hourEnd: 12 },
  { label: '12:00–15:00', hourStart: 12, hourEnd: 15 },
  { label: '15:00–18:00', hourStart: 15, hourEnd: 18 },
  { label: '18:00–21:00', hourStart: 18, hourEnd: 21 },
  { label: '21:00–24:00', hourStart: 21, hourEnd: 24 },
] as const;

/**
 * Extract the effective score for a session using optional fields or score map.
 */
function resolveSessionScore(session: Session, scoreMap?: Map<string, number>): number | null {
  if (typeof session.focusScore === 'number' && Number.isFinite(session.focusScore)) {
    return Math.min(100, Math.max(0, session.focusScore));
  }
  if (typeof session.focusIndicatorScore === 'number' && Number.isFinite(session.focusIndicatorScore)) {
    return Math.min(100, Math.max(0, session.focusIndicatorScore));
  }
  if (scoreMap && scoreMap.has(session.id)) {
    const score = scoreMap.get(session.id);
    if (typeof score === 'number' && Number.isFinite(score)) return Math.min(100, Math.max(0, score));
  }
  return null;
}

/**
 * Aggregate sessions for a single specific day into timeline intervals.
 */
export function aggregateDailyData(
  sessions: Session[],
  targetDate: Date,
  scoreMap?: Map<string, number>,
): DailyAnalyticsData {
  const start = getStartOfDay(targetDate);
  const end = getEndOfDay(targetDate);

  const startMs = start.getTime();
  const endMs = end.getTime();

  // Filter sessions that started on this day
  const daySessions = sessions.filter((s) => {
    if (!s || typeof s.startedAt !== 'string' || !Number.isFinite(s.elapsedSeconds) || s.elapsedSeconds < 0) return false;
    const timestamp = Date.parse(s.startedAt);
    return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs;
  });

  let totalFocusSeconds = 0;
  let totalAwaySeconds = 0;
  const dayScores: number[] = [];

  // Initialize intervals
  const intervals: DailyIntervalBucket[] = STANDARD_DAY_INTERVALS.map((def) => ({
    label: def.label,
    hourStart: def.hourStart,
    hourEnd: def.hourEnd,
    focusSeconds: 0,
    awaySeconds: 0,
    sessionCount: 0,
    focusScore: null,
  }));

  const intervalScores: number[][] = intervals.map(() => []);

  for (const session of daySessions) {
    const focusSec = session.elapsedSeconds;
    const awaySec = Number.isFinite(session.awayDurationSeconds) ? Math.max(0, session.awayDurationSeconds as number) : 0;
    const score = resolveSessionScore(session, scoreMap);

    totalFocusSeconds += focusSec;
    totalAwaySeconds += awaySec;

    if (score !== null) {
      dayScores.push(score);
    }

    const sessionHour = new Date(session.startedAt).getHours();
    const intervalIdx = intervals.findIndex(
      (def) => sessionHour >= def.hourStart && sessionHour < def.hourEnd,
    );

    if (intervalIdx !== -1) {
      intervals[intervalIdx].focusSeconds += focusSec;
      intervals[intervalIdx].awaySeconds += awaySec;
      intervals[intervalIdx].sessionCount += 1;
      if (score !== null) {
        intervalScores[intervalIdx].push(score);
      }
    }
  }

  // Calculate interval average scores
  for (let i = 0; i < intervals.length; i++) {
    const scores = intervalScores[i];
    intervals[i].focusScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  }

  const averageFocusScore = dayScores.length > 0
    ? Math.round(dayScores.reduce((a, b) => a + b, 0) / dayScores.length)
    : null;

  return {
    date: start,
    dateLabel: formatDayDateLabel(start),
    totalFocusSeconds,
    totalAwaySeconds,
    sessionCount: daySessions.length,
    averageFocusScore,
    intervals,
    hasData: daySessions.length > 0,
  };
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Aggregate sessions for a selected week (Monday through Sunday).
 */
export function aggregateWeeklyData(
  sessions: Session[],
  weekStart: Date,
  scoreMap?: Map<string, number>,
): WeeklyAnalyticsData {
  const start = getStartOfWeek(weekStart);
  const end = getEndOfWeek(weekStart);

  const startMs = start.getTime();
  const endMs = end.getTime();

  // Initialize the 7 daily buckets for Mon -> Sun
  const days: WeeklyDayBucket[] = DAY_NAMES.map((dayName, idx) => {
    const dayDate = new Date(start);
    dayDate.setDate(dayDate.getDate() + idx);
    return {
      date: dayDate,
      dayName,
      fullDateLabel: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(dayDate),
      focusSeconds: 0,
      awaySeconds: 0,
      sessionCount: 0,
      focusScore: null,
    };
  });

  const dayScores: number[][] = days.map(() => []);
  const allWeekScores: number[] = [];
  let totalFocusSeconds = 0;
  let totalAwaySeconds = 0;
  let totalSessions = 0;

  for (const session of sessions) {
    if (!session || typeof session.startedAt !== 'string' || !Number.isFinite(session.elapsedSeconds) || session.elapsedSeconds < 0) continue;
    const timestamp = Date.parse(session.startedAt);
    if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > endMs) {
      continue;
    }

    const sessionDate = new Date(timestamp);
    const dayOfWeek = sessionDate.getDay();
    // Convert JS Sunday (0) to index 6, Mon (1) to 0 ... Sat (6) to 5
    const bucketIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const focusSec = session.elapsedSeconds;
    const awaySec = Number.isFinite(session.awayDurationSeconds) ? Math.max(0, session.awayDurationSeconds as number) : 0;
    const score = resolveSessionScore(session, scoreMap);

    totalFocusSeconds += focusSec;
    totalAwaySeconds += awaySec;
    totalSessions += 1;

    if (bucketIdx >= 0 && bucketIdx < 7) {
      days[bucketIdx].focusSeconds += focusSec;
      days[bucketIdx].awaySeconds += awaySec;
      days[bucketIdx].sessionCount += 1;
      if (score !== null) {
        dayScores[bucketIdx].push(score);
        allWeekScores.push(score);
      }
    }
  }

  // Calculate day average scores
  for (let i = 0; i < days.length; i++) {
    const scores = dayScores[i];
    days[i].focusScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  }

  const averageFocusScore = allWeekScores.length > 0
    ? Math.round(allWeekScores.reduce((a, b) => a + b, 0) / allWeekScores.length)
    : null;

  return {
    startDate: start,
    endDate: end,
    rangeLabel: formatWeekRangeLabel(start, end),
    totalFocusSeconds,
    totalAwaySeconds,
    totalSessions,
    averageFocusScore,
    days,
    hasData: totalSessions > 0,
  };
}
