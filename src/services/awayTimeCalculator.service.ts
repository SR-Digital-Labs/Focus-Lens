/**
 * FocusLens — Away-Time Calculation Service
 * ==========================================
 * Day 18: Pure, reliable, and reusable away-time calculation.
 *
 * Responsibilities:
 * 1. Computes total away duration (in ms and seconds) and individual away intervals
 *    for a given focus session using existing activity events or live state tracking.
 * 2. Identifies transitions between PRESENT and AWAY states.
 * 3. Handles multiple away periods without double-counting overlapping time.
 * 4. Strictly adheres to session lifecycle:
 *    - Only accumulates away time while session is running.
 *    - Paused intervals are excluded and never counted as away time.
 *    - Handles session pause and resume correctly, preserving accumulated away time.
 *    - Closes an ongoing away period when a session ends or completes while user is away,
 *      preventing time from accumulating after session termination.
 * 5. Handles UNKNOWN detection states:
 *    - UNKNOWN is NEVER classified or counted as AWAY.
 *    - Transitions into UNKNOWN terminate/suspend the reliable away interval.
 * 6. Handles out-of-order, stale, or invalid timestamps safely.
 * 7. Ignores events from other sessions.
 * 8. Zero external dependencies; local-first, privacy-preserving.
 */

import type { ActivityEvent } from '../types/index.ts';

export interface AwayPeriod {
  /** Session ID this away period belongs to */
  sessionId: string;
  /** Epoch timestamp in ms when the user became away */
  startedAt: number;
  /** Epoch timestamp in ms when the user returned or session ended/paused */
  endedAt: number;
  /** Effective duration in milliseconds (excluding any paused time) */
  durationMs: number;
  /** Effective duration in whole/fractional seconds */
  durationSeconds: number;
  /** Reason why the away period ended */
  endedReason: 'returned_present' | 'session_paused' | 'session_ended' | 'session_completed' | 'state_unknown';
}

export interface AwayTimeSummary {
  /** Active session ID */
  sessionId: string | null;
  /** Total accumulated away time in milliseconds */
  totalAwayTimeMs: number;
  /** Total accumulated away time in seconds (rounded down to whole seconds for display) */
  totalAwayTimeSeconds: number;
  /** Detailed breakdown of all completed away intervals */
  periods: AwayPeriod[];
  /** Whether the user is currently away at calculation time */
  isCurrentlyAway: boolean;
  /** Epoch timestamp in ms if user is currently away, or null */
  currentAwayStartedAt: number | null;
  /** Current away duration in milliseconds if ongoing, or 0 */
  currentPeriodDurationMs: number;
}

export interface CalculateAwayTimeOptions {
  /**
   * Reference timestamp in milliseconds to evaluate ongoing away time against.
   * Defaults to `Date.now()`.
   */
  now?: number;
}

/**
 * Pure function: calculates away time metrics from an array of ActivityEvents.
 *
 * Events are filtered by `sessionId`, validated, sorted chronologically,
 * and processed through the focus session lifecycle state machine.
 */
export function calculateAwayTimeFromEvents(
  events: ActivityEvent[],
  sessionId: string,
  options?: CalculateAwayTimeOptions
): AwayTimeSummary {
  if (!sessionId || !Array.isArray(events) || events.length === 0) {
    return {
      sessionId: sessionId || null,
      totalAwayTimeMs: 0,
      totalAwayTimeSeconds: 0,
      periods: [],
      isCurrentlyAway: false,
      currentAwayStartedAt: null,
      currentPeriodDurationMs: 0,
    };
  }

  // 1. Filter events matching this session and valid timestamps
  const sessionEvents = events
    .filter((e) => e && e.sessionId === sessionId && typeof e.timestamp === 'number' && Number.isFinite(e.timestamp) && e.timestamp > 0)
    .map((e) => ({
      ...e,
      // Normalize timestamp to ms if necessary (seconds vs ms)
      timestamp: e.timestamp < 10_000_000_000 ? Math.floor(e.timestamp * 1000) : Math.floor(e.timestamp),
    }));

  if (sessionEvents.length === 0) {
    return {
      sessionId,
      totalAwayTimeMs: 0,
      totalAwayTimeSeconds: 0,
      periods: [],
      isCurrentlyAway: false,
      currentAwayStartedAt: null,
      currentPeriodDurationMs: 0,
    };
  }

  // 2. Sort events chronologically to guarantee correct sequence even if out-of-order
  sessionEvents.sort((a, b) => a.timestamp - b.timestamp);

  const periods: AwayPeriod[] = [];
  let isSessionRunning = false;
  let isSessionTerminated = false;
  let isPersonAway = false;
  let currentAwayStartMs: number | null = null;

  for (const event of sessionEvents) {
    const { type, category, stateValue, timestamp } = event;

    // Handle session lifecycle events
    if (category === 'session' || type.startsWith('SESSION_')) {
      if (type === 'SESSION_STARTED') {
        isSessionRunning = true;
        isSessionTerminated = false;
      } else if (type === 'SESSION_PAUSED') {
        // Pausing stops session timekeeping: if user was away, pause stops the away period
        if (isSessionRunning && isPersonAway && currentAwayStartMs !== null) {
          const endedAt = Math.max(currentAwayStartMs, timestamp);
          const durationMs = endedAt - currentAwayStartMs;
          if (durationMs > 0) {
            periods.push({
              sessionId,
              startedAt: currentAwayStartMs,
              endedAt,
              durationMs,
              durationSeconds: Math.floor(durationMs / 1000),
              endedReason: 'session_paused',
            });
          }
          currentAwayStartMs = null;
        }
        isSessionRunning = false;
      } else if (type === 'SESSION_RESUMED') {
        isSessionRunning = true;
        // When session resumes, if user is still in away state, begin a new away period from resume time
        if (isPersonAway) {
          currentAwayStartMs = timestamp;
        }
      } else if (type === 'SESSION_ENDED' || type === 'SESSION_COMPLETED') {
        // Ending closes any active away period at the session end timestamp
        if (isSessionRunning && isPersonAway && currentAwayStartMs !== null) {
          const endedAt = Math.max(currentAwayStartMs, timestamp);
          const durationMs = endedAt - currentAwayStartMs;
          if (durationMs > 0) {
            periods.push({
              sessionId,
              startedAt: currentAwayStartMs,
              endedAt,
              durationMs,
              durationSeconds: Math.floor(durationMs / 1000),
              endedReason: type === 'SESSION_COMPLETED' ? 'session_completed' : 'session_ended',
            });
          }
          currentAwayStartMs = null;
        }
        isSessionRunning = false;
        isSessionTerminated = true;
      }
      continue;
    }

    // If session is terminated, ignore any subsequent detection events
    if (isSessionTerminated) {
      continue;
    }

    // Handle person detection events
    if (category === 'person' || type === 'PERSON_PRESENT' || type === 'PERSON_AWAY' || type === 'PERSON_UNKNOWN') {
      const normalizedState = normalizePersonDetectionState(type, stateValue);

      if (normalizedState === 'AWAY') {
        if (!isPersonAway) {
          isPersonAway = true;
          // Only start timing if session is actively running
          if (isSessionRunning) {
            currentAwayStartMs = timestamp;
          }
        }
      } else if (normalizedState === 'PRESENT') {
        if (isPersonAway) {
          if (isSessionRunning && currentAwayStartMs !== null) {
            const endedAt = Math.max(currentAwayStartMs, timestamp);
            const durationMs = endedAt - currentAwayStartMs;
            if (durationMs > 0) {
              periods.push({
                sessionId,
                startedAt: currentAwayStartMs,
                endedAt,
                durationMs,
                durationSeconds: Math.floor(durationMs / 1000),
                endedReason: 'returned_present',
              });
            }
          }
          isPersonAway = false;
          currentAwayStartMs = null;
        }
      } else if (normalizedState === 'UNKNOWN') {
        // UNKNOWN is not counted as AWAY. If user was previously away, unknown terminates the reliable away interval.
        if (isPersonAway) {
          if (isSessionRunning && currentAwayStartMs !== null) {
            const endedAt = Math.max(currentAwayStartMs, timestamp);
            const durationMs = endedAt - currentAwayStartMs;
            if (durationMs > 0) {
              periods.push({
                sessionId,
                startedAt: currentAwayStartMs,
                endedAt,
                durationMs,
                durationSeconds: Math.floor(durationMs / 1000),
                endedReason: 'state_unknown',
              });
            }
          }
          isPersonAway = false;
          currentAwayStartMs = null;
        }
      }
    }
  }

  // Calculate completed total duration
  let totalAwayTimeMs = periods.reduce((sum, p) => sum + p.durationMs, 0);

  // Check if there is an active ongoing away interval while session is running
  let currentPeriodDurationMs = 0;
  const isCurrentlyAway = isSessionRunning && !isSessionTerminated && isPersonAway && currentAwayStartMs !== null;

  if (isCurrentlyAway && currentAwayStartMs !== null) {
    const referenceNow = options?.now ?? Date.now();
    const safeNow = Math.max(currentAwayStartMs, referenceNow);
    currentPeriodDurationMs = safeNow - currentAwayStartMs;
    totalAwayTimeMs += currentPeriodDurationMs;
  }

  return {
    sessionId,
    totalAwayTimeMs,
    totalAwayTimeSeconds: Math.floor(totalAwayTimeMs / 1000),
    periods,
    isCurrentlyAway,
    currentAwayStartedAt: isCurrentlyAway ? currentAwayStartMs : null,
    currentPeriodDurationMs,
  };
}

/**
 * Helper to normalize raw event type and stateValue to standard detection state.
 */
function normalizePersonDetectionState(type: string, stateValue?: string): 'PRESENT' | 'AWAY' | 'UNKNOWN' {
  if (type === 'PERSON_AWAY' || stateValue === 'AWAY') return 'AWAY';
  if (type === 'PERSON_PRESENT' || stateValue === 'PRESENT') return 'PRESENT';
  return 'UNKNOWN';
}

/**
 * Reusable class for stateful, live away-time tracking.
 * Can be instantiated directly or queried on demand.
 */
export class AwayTimeCalculator {
  private _sessionId: string | null = null;
  private _isSessionRunning: boolean = false;
  private _isPersonAway: boolean = false;
  private _currentAwayStartMs: number | null = null;
  private _periods: AwayPeriod[] = [];
  private _accumulatedCompletedAwayMs: number = 0;

  constructor(sessionId?: string) {
    if (sessionId) {
      this.reset(sessionId);
    }
  }

  public reset(sessionId?: string | null): void {
    this._sessionId = sessionId ?? null;
    this._isSessionRunning = false;
    this._isPersonAway = false;
    this._currentAwayStartMs = null;
    this._periods = [];
    this._accumulatedCompletedAwayMs = 0;
  }

  public onSessionStarted(sessionId: string, _timestamp: number = Date.now()): void {
    this.reset(sessionId);
    this._isSessionRunning = true;
  }

  public onSessionPaused(timestamp: number = Date.now()): void {
    if (!this._isSessionRunning) return;

    if (this._isPersonAway && this._currentAwayStartMs !== null) {
      this.closePeriod(timestamp, 'session_paused');
    }
    this._isSessionRunning = false;
  }

  public onSessionResumed(timestamp: number = Date.now()): void {
    if (this._isSessionRunning) return;

    this._isSessionRunning = true;
    if (this._isPersonAway) {
      this._currentAwayStartMs = timestamp;
    }
  }

  public onSessionEnded(timestamp: number = Date.now(), isCompleted: boolean = false): void {
    if (this._isSessionRunning && this._isPersonAway && this._currentAwayStartMs !== null) {
      this.closePeriod(timestamp, isCompleted ? 'session_completed' : 'session_ended');
    }
    this._isSessionRunning = false;
    this._currentAwayStartMs = null;
  }

  public onPersonStateChange(
    state: 'PRESENT' | 'AWAY' | 'UNKNOWN',
    timestamp: number = Date.now()
  ): void {
    if (state === 'AWAY') {
      if (!this._isPersonAway) {
        this._isPersonAway = true;
        if (this._isSessionRunning) {
          this._currentAwayStartMs = timestamp;
        }
      }
    } else if (state === 'PRESENT') {
      if (this._isPersonAway) {
        if (this._isSessionRunning && this._currentAwayStartMs !== null) {
          this.closePeriod(timestamp, 'returned_present');
        }
        this._isPersonAway = false;
        this._currentAwayStartMs = null;
      }
    } else {
      // UNKNOWN
      if (this._isPersonAway) {
        if (this._isSessionRunning && this._currentAwayStartMs !== null) {
          this.closePeriod(timestamp, 'state_unknown');
        }
        this._isPersonAway = false;
        this._currentAwayStartMs = null;
      }
    }
  }

  private closePeriod(endedAt: number, reason: AwayPeriod['endedReason']): void {
    if (this._currentAwayStartMs === null || !this._sessionId) return;

    const safeEndedAt = Math.max(this._currentAwayStartMs, endedAt);
    const durationMs = safeEndedAt - this._currentAwayStartMs;

    if (durationMs > 0) {
      const period: AwayPeriod = {
        sessionId: this._sessionId,
        startedAt: this._currentAwayStartMs,
        endedAt: safeEndedAt,
        durationMs,
        durationSeconds: Math.floor(durationMs / 1000),
        endedReason: reason,
      };
      this._periods.push(period);
      this._accumulatedCompletedAwayMs += durationMs;
    }
    this._currentAwayStartMs = null;
  }

  public getSummary(now: number = Date.now()): AwayTimeSummary {
    let currentPeriodDurationMs = 0;
    let totalAwayTimeMs = this._accumulatedCompletedAwayMs;

    const isCurrentlyAway =
      this._isSessionRunning && this._isPersonAway && this._currentAwayStartMs !== null;

    if (isCurrentlyAway && this._currentAwayStartMs !== null) {
      const safeNow = Math.max(this._currentAwayStartMs, now);
      currentPeriodDurationMs = safeNow - this._currentAwayStartMs;
      totalAwayTimeMs += currentPeriodDurationMs;
    }

    return {
      sessionId: this._sessionId,
      totalAwayTimeMs,
      totalAwayTimeSeconds: Math.floor(totalAwayTimeMs / 1000),
      periods: [...this._periods],
      isCurrentlyAway,
      currentAwayStartedAt: isCurrentlyAway ? this._currentAwayStartMs : null,
      currentPeriodDurationMs,
    };
  }
}
