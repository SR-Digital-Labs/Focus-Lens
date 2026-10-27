import type { ActivityEvent, Session } from '../types';
import { calculateFocusIndicator, type FocusIndicatorResult } from './focusIndicator.service.ts';

export interface DashboardMetrics {
  totalFocusTimeSeconds: number;
  sessionCount: number;
  averageSessionLengthSeconds: number;
  totalAwayTimeSeconds: number;
  screenFacingDurationSeconds: number | null;
  postureEventCount: number | null;
  focusIndicators: FocusIndicatorResult[];
}

/**
 * Metrics are based on confirmed elapsed seconds in persisted session records.
 * All persisted statuses count as sessions; unfinished records contribute only
 * their already-confirmed elapsed time. Missing screen/posture data is null.
 */
export function calculateDashboardMetrics(
  sessions: Session[],
  events: ActivityEvent[],
): DashboardMetrics {
  const validSessions = sessions.filter(isUsableSession);
  const totalFocusTimeSeconds = validSessions.reduce((sum, session) => sum + session.elapsedSeconds, 0);
  const awayEvents = events.filter(isUsableAwayEvent);
  const totalAwayTimeSeconds = sumUniqueAwayIntervals(awayEvents);

  return {
    totalFocusTimeSeconds,
    sessionCount: validSessions.length,
    averageSessionLengthSeconds: validSessions.length ? totalFocusTimeSeconds / validSessions.length : 0,
    totalAwayTimeSeconds,
    // Current SQLite storage accepts only away event records, not these signals.
    screenFacingDurationSeconds: null,
    postureEventCount: null,
    focusIndicators: validSessions.map((session) => calculateFocusIndicator({
      sessionId: session.id,
      activeDurationSeconds: session.elapsedSeconds,
      awayDurationSeconds: awayDurationForSession(awayEvents, session.id),
    })),
  };
}

/** Load the persisted source records and calculate dashboard metrics. */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const { activityEventRepository, sessionRepository } = await import('./db.service.ts');
  const sessions = await sessionRepository.getAll({ order: 'desc' });
  const eventGroups = await Promise.all(sessions.map((session) => activityEventRepository.listBySession(session.id)));
  return calculateDashboardMetrics(sessions, eventGroups.flat());
}

function isUsableSession(session: Session): boolean {
  return Boolean(session)
    && typeof session.id === 'string'
    && ['running', 'paused', 'completed', 'cancelled', 'interrupted'].includes(session.status)
    && Number.isFinite(session.elapsedSeconds)
    && session.elapsedSeconds >= 0
    && Number.isFinite(session.plannedDurationSeconds)
    && session.plannedDurationSeconds > 0
    && Number.isFinite(Date.parse(session.startedAt));
}

function isUsableAwayEvent(event: ActivityEvent): boolean {
  return Boolean(event)
    && event.type === 'away'
    && Number.isFinite(event.timestamp)
    && Number.isFinite(event.awayStartedAt)
    && Number.isFinite(event.duration)
    && (event.duration ?? -1) >= 0
    && typeof event.sessionId === 'string';
}

function sumUniqueAwayIntervals(events: ActivityEvent[]): number {
  const intervals = events
    .filter(isUsableAwayEvent)
    .map((event) => {
      const start = event.awayStartedAt as number;
      const duration = event.duration as number;
      // duration is maintained by AwayDetectionService using running time only,
      // so use it as the interval width to exclude paused periods.
      return { start, end: start + duration * 1_000 };
    })
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((a, b) => a.start - b.start);

  let totalMs = 0;
  let activeStart: number | null = null;
  let activeEnd = 0;
  for (const interval of intervals) {
    if (activeStart === null) {
      activeStart = interval.start;
      activeEnd = interval.end;
    } else if (interval.start <= activeEnd) {
      activeEnd = Math.max(activeEnd, interval.end);
    } else {
      totalMs += activeEnd - activeStart;
      activeStart = interval.start;
      activeEnd = interval.end;
    }
  }
  if (activeStart !== null) totalMs += activeEnd - activeStart;
  return totalMs / 1_000;
}

function awayDurationForSession(events: ActivityEvent[], sessionId: string): number {
  return sumUniqueAwayIntervals(events.filter((event) => event.sessionId === sessionId));
}
