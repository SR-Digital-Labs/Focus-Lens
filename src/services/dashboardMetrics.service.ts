import type { ActivityEvent, Session } from '../types';
import {
  calculateFocusIndicator,
  calculateFocusIndicatorFromEvents,
  type FocusIndicatorResult,
} from './focusIndicator.service.ts';

export interface DashboardMetrics {
  totalFocusTimeSeconds: number;
  sessionCount: number;
  averageSessionLengthSeconds: number;
  totalAwayTimeSeconds: number;
  screenFacingDurationSeconds: number | null;
  postureEventCount: number | null;
  focusIndicators: FocusIndicatorResult[];
}

export interface DashboardAnalyticsData {
  metrics: DashboardMetrics;
  /** Sessions enriched with the derived values consumed by the trend charts. */
  sessions: Session[];
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
  return buildDashboardMetrics(validSessions, events);
}

function buildDashboardMetrics(
  validSessions: Session[],
  events: ActivityEvent[],
): DashboardMetrics {
  const awayEvents = events.filter(isUsableAwayEvent);
  const totalFocusTimeSeconds = validSessions.reduce((sum, session) => sum + session.elapsedSeconds, 0);
  const totalAwayTimeSeconds = sumUniqueAwayIntervals(awayEvents);

  return {
    totalFocusTimeSeconds,
    sessionCount: validSessions.length,
    averageSessionLengthSeconds: validSessions.length ? totalFocusTimeSeconds / validSessions.length : 0,
    totalAwayTimeSeconds,
    // Detailed values are represented by the per-session indicator breakdown.
    screenFacingDurationSeconds: null,
    postureEventCount: null,
    focusIndicators: validSessions.map((session) => {
      const sessionEvents = events.filter((event) => event.sessionId === session.id);
      const hasReproducibleStream = sessionEvents.some((event) =>
        event.type.startsWith('SESSION_')
        || event.category === 'person'
        || event.category === 'screen_facing'
        || event.category === 'posture',
      );
      if (!hasReproducibleStream) {
        // Compatibility for pre-v2 records, whose only persisted evidence was
        // away intervals. New sessions always persist lifecycle/observation data.
        return calculateFocusIndicator({
          sessionId: session.id,
          activeDurationSeconds: session.elapsedSeconds,
          awayDurationSeconds: sumUniqueAwayIntervals(sessionEvents.filter(isUsableAwayEvent)),
        });
      }
      return calculateFocusIndicatorFromEvents(sessionEvents, session.id, {
          activeDurationSeconds: session.elapsedSeconds,
          now: session.endedAt ? Date.parse(session.endedAt) : undefined,
      });
    }),
  };
}

/** Load source records once so dashboard cards and charts use the same data. */
export async function getDashboardAnalytics(): Promise<DashboardAnalyticsData> {
  const { activityEventRepository, sessionRepository } = await import('./db.service.ts');
  const sessions = await sessionRepository.getAll({ order: 'desc' });
  const events = await activityEventRepository.listAll();
  const validSessions = sessions.filter(isUsableSession);
  const awayEvents = events.filter(isUsableAwayEvent);
  const awayEventsBySession = groupAwayEventsBySession(awayEvents);
  const metrics = buildDashboardMetrics(validSessions, events);
  const indicatorBySession = new Map(metrics.focusIndicators.map((indicator) => [indicator.sessionId, indicator]));

  return {
    metrics,
    sessions: validSessions.map((session) => {
      const indicator = indicatorBySession.get(session.id);
      return {
        ...session,
        awayDurationSeconds: sumUniqueAwayIntervals(awayEventsBySession.get(session.id) ?? []),
        ...(indicator?.status === 'calculated' && typeof indicator.score === 'number' && Number.isFinite(indicator.score)
          ? { focusScore: indicator.score }
          : {}),
      };
    }),
  };
}

/** Compatibility helper for consumers that only need summary metrics. */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return (await getDashboardAnalytics()).metrics;
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

function groupAwayEventsBySession(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const grouped = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const sessionEvents = grouped.get(event.sessionId);
    if (sessionEvents) {
      sessionEvents.push(event);
    } else {
      grouped.set(event.sessionId, [event]);
    }
  }
  return grouped;
}
