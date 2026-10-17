/**
 * FocusLens — Focus Indicator Calculation Service
 * ==================================================
 * Day 19: Pure, deterministic, and reusable Focus Indicator calculation.
 *
 * Requirements & Architectural Guarantees:
 * 1. Combines available focus session metrics:
 *    - Session duration and active (running) elapsed time
 *    - Presence ratio (time present vs active session time)
 *    - Screen-facing ratio (time facing screen vs active session time or present time)
 *    - Posture state / posture stability ratio (good posture vs evaluated posture time)
 *    - Away time ratio (away time vs active session time)
 *    - Explicit handling of unknown / unobserved detection periods
 * 2. Privacy First & Local Only:
 *    - Strict on-device math; zero external dependencies or frame processing.
 * 3. Transparent & Documented:
 *    - Since the project specifications (PRD 7.7, TRD 18, BDS 21, AFD 21)
 *      state that the exact formula is not specified in the proposal and should
 *      be finalized during implementation/testing, this module provides:
 *      * A configurable, normalized weighted scoring formula
 *      * Clear reasons for each component's contribution
 *      * Explicit disclaimer that this is an application-generated summary indicator,
 *        NOT an objective measurement of human attention or productivity.
 * 4. Resilient to incomplete, invalid, or boundary data:
 *    - Zero-duration sessions return a designated insufficient_data status.
 *    - Prevents division by zero, NaN, infinities, and out-of-range scores.
 *    - Unknown detection time is not penalized as away or slouched.
 *    - Clamped strictly within the documented scoring range [0, 100].
 */

import type { ActivityEvent } from '../types/index.ts';
import { calculateAwayTimeFromEvents } from './awayTimeCalculator.service.ts';

/**
 * Status indicating whether a meaningful focus indicator could be calculated.
 */
export type FocusIndicatorStatus =
  | 'calculated'
  | 'insufficient_data'
  | 'no_active_time';

/**
 * Weights configuration for the Focus Indicator calculation components.
 * Normalized weights sum to 1.0 (or 100%).
 */
export interface FocusIndicatorWeights {
  /**
   * Weight for the user being physically present vs away during active session time.
   * Default: 0.40 (40%)
   */
  presenceWeight: number;

  /**
   * Weight for the user facing the screen vs looking away during present time.
   * Default: 0.35 (35%)
   */
  screenFacingWeight: number;

  /**
   * Weight for maintaining ergonomic/good posture during observed posture time.
   * Default: 0.25 (25%)
   */
  postureWeight: number;
}

export const DEFAULT_FOCUS_INDICATOR_WEIGHTS: Readonly<FocusIndicatorWeights> = Object.freeze({
  presenceWeight: 0.40,
  screenFacingWeight: 0.35,
  postureWeight: 0.25,
});

/**
 * Raw session metrics used as input to the Focus Indicator calculation.
 */
export interface FocusSessionMetricsInput {
  /** Session identifier */
  sessionId?: string;

  /** Total planned or elapsed session duration in seconds */
  totalDurationSeconds?: number;

  /** Actual active (running) session time in seconds (excluding paused periods) */
  activeDurationSeconds: number;

  /** Total confirmed away duration in seconds */
  awayDurationSeconds?: number;

  /** Total confirmed person present duration in seconds (optional direct metric) */
  presentDurationSeconds?: number;

  /** Total confirmed screen-facing duration in seconds (optional direct metric) */
  screenFacingDurationSeconds?: number;

  /** Total confirmed looking away duration in seconds (optional direct metric) */
  lookingAwayDurationSeconds?: number;

  /** Total confirmed good posture duration in seconds (optional direct metric) */
  goodPostureDurationSeconds?: number;

  /** Total confirmed slouched posture duration in seconds (optional direct metric) */
  slouchedPostureDurationSeconds?: number;

  /** Total unobserved / unknown detection duration in seconds (optional direct metric) */
  unknownDurationSeconds?: number;

  /** Number of posture slouch/distraction events recorded (optional) */
  postureEventCount?: number;
}

/**
 * Sub-metric scores breakdown (each normalized from 0.0 to 1.0, or null if unobserved).
 */
export interface FocusIndicatorBreakdown {
  /**
   * Presence ratio: ratio of active time spent present (not confirmed away).
   * Range [0, 1].
   */
  presenceRatio: number;

  /**
   * Screen-facing ratio: ratio of present time spent facing the screen.
   * Null if no valid screen-facing observation occurred.
   * Range [0, 1].
   */
  screenFacingRatio: number | null;

  /**
   * Posture quality ratio: ratio of observed posture time in good posture.
   * Null if no valid posture observation occurred.
   * Range [0, 1].
   */
  postureRatio: number | null;

  /**
   * Away time penalty ratio: away duration relative to active session time.
   * Range [0, 1].
   */
  awayRatio: number;

  /**
   * Ratio of active session time where detection was unobserved / unknown.
   * Range [0, 1].
   */
  unknownRatio: number;
}

/**
 * The calculated Focus Indicator result object.
 */
export interface FocusIndicatorResult {
  /** Session ID evaluated */
  sessionId: string | null;

  /**
   * Final indicator score in the range [0, 100], rounded to one decimal place.
   * Null if data was insufficient to form a meaningful score.
   */
  score: number | null;

  /**
   * Categorical status describing the calculation outcome.
   */
  status: FocusIndicatorStatus;

  /**
   * Confidence level in the calculation based on observation coverage [0, 1].
   * High when signals were actively observed; lower if large periods were unknown.
   */
  confidence: number;

  /**
   * Granular normalized breakdown of each contributing factor.
   */
  breakdown: FocusIndicatorBreakdown;

  /**
   * The effective weights utilized (dynamically re-normalized if optional signals were unknown).
   */
  effectiveWeights: FocusIndicatorWeights;

  /**
   * Human-readable explanation of the result and any data limitations.
   */
  summaryMessage: string;

  /**
   * Standard disclaimer: application-generated signal summary, not an objective productivity score.
   */
  disclaimer: string;
}

export const FOCUS_INDICATOR_DISCLAIMER =
  'The Focus Indicator is an application-generated summary of observed session signals. ' +
  'It is not an objective measurement of human productivity, attention, or work quality.';

/**
 * Options to customize the Focus Indicator calculation.
 */
export interface CalculateFocusIndicatorOptions {
  /** Custom weights configuration */
  weights?: Partial<FocusIndicatorWeights>;

  /**
   * Minimum active duration in seconds required to produce a valid score.
   * Sessions shorter than this will return 'insufficient_data'.
   * Default: 5 seconds.
   */
  minActiveDurationSeconds?: number;

  /**
   * Whether to treat missing posture or screen-facing as unobserved (redistributing weights)
   * or as neutral (0.5 score).
   * Default: 'redistribute' (transparent, doesn't penalize missing camera features).
   */
  unobservedHandling?: 'redistribute' | 'neutral';
}

/**
 * Pure calculation function: computes a Focus Indicator from pre-aggregated session metrics.
 */
export function calculateFocusIndicator(
  metrics: FocusSessionMetricsInput,
  options?: CalculateFocusIndicatorOptions
): FocusIndicatorResult {
  const sessionId = metrics.sessionId ?? null;
  const minActiveDuration = options?.minActiveDurationSeconds ?? 5;
  const unobservedHandling = options?.unobservedHandling ?? 'redistribute';

  // 1. Sanitize active duration
  const rawActiveSeconds = metrics.activeDurationSeconds;
  if (
    typeof rawActiveSeconds !== 'number' ||
    !Number.isFinite(rawActiveSeconds) ||
    rawActiveSeconds <= 0
  ) {
    return createEmptyResult(
      sessionId,
      'no_active_time',
      'Session has no active running time (duration is zero or invalid).'
    );
  }

  const activeDurationSeconds = Math.max(0, rawActiveSeconds);

  // Guard against insufficient session duration
  if (activeDurationSeconds < minActiveDuration) {
    return createEmptyResult(
      sessionId,
      'insufficient_data',
      `Active duration (${activeDurationSeconds.toFixed(1)}s) is below minimum threshold (${minActiveDuration}s) for indicator calculation.`
    );
  }

  // 2. Sanitize durations
  const rawAwaySeconds = metrics.awayDurationSeconds ?? 0;
  const awayDurationSeconds = clampNumber(rawAwaySeconds, 0, activeDurationSeconds);

  // Present duration: if explicitly provided, clamp; otherwise derive as (active - away)
  let presentDurationSeconds: number;
  if (typeof metrics.presentDurationSeconds === 'number' && Number.isFinite(metrics.presentDurationSeconds)) {
    presentDurationSeconds = clampNumber(metrics.presentDurationSeconds, 0, activeDurationSeconds);
  } else {
    presentDurationSeconds = Math.max(0, activeDurationSeconds - awayDurationSeconds);
  }

  const unknownDurationSeconds = clampNumber(metrics.unknownDurationSeconds ?? 0, 0, activeDurationSeconds);

  // 3. Compute component ratios [0.0, 1.0]
  // A. Presence Ratio: Time present divided by total active session time
  const presenceRatio = clampRatio(presentDurationSeconds / activeDurationSeconds);

  // B. Away Ratio
  const awayRatio = clampRatio(awayDurationSeconds / activeDurationSeconds);

  // C. Screen Facing Ratio
  // If user spent time present, screen facing ratio is (screen facing time / present time).
  // If not observed or present time is 0, screenFacingRatio is null.
  let screenFacingRatio: number | null = null;
  if (
    typeof metrics.screenFacingDurationSeconds === 'number' &&
    Number.isFinite(metrics.screenFacingDurationSeconds) &&
    metrics.screenFacingDurationSeconds >= 0
  ) {
    const screenFacingSec = Math.max(0, metrics.screenFacingDurationSeconds);
    const denominator = presentDurationSeconds > 0 ? presentDurationSeconds : activeDurationSeconds;
    screenFacingRatio = denominator > 0 ? clampRatio(screenFacingSec / denominator) : null;
  } else if (
    typeof metrics.lookingAwayDurationSeconds === 'number' &&
    Number.isFinite(metrics.lookingAwayDurationSeconds) &&
    metrics.lookingAwayDurationSeconds >= 0
  ) {
    const lookingAwaySec = Math.max(0, metrics.lookingAwayDurationSeconds);
    const denominator = presentDurationSeconds > 0 ? presentDurationSeconds : activeDurationSeconds;
    screenFacingRatio = denominator > 0 ? clampRatio(1.0 - lookingAwaySec / denominator) : null;
  }

  // D. Posture Ratio
  // Good posture ratio is (good posture time / (good posture + slouched posture)).
  // If not observed or total evaluated posture time is 0, postureRatio is null.
  let postureRatio: number | null = null;
  const goodSec = metrics.goodPostureDurationSeconds;
  const slouchedSec = metrics.slouchedPostureDurationSeconds;
  const hasGood = typeof goodSec === 'number' && Number.isFinite(goodSec) && goodSec >= 0;
  const hasSlouched = typeof slouchedSec === 'number' && Number.isFinite(slouchedSec) && slouchedSec >= 0;

  if (hasGood || hasSlouched) {
    const validGood = Math.max(0, goodSec ?? 0);
    const validSlouched = Math.max(0, slouchedSec ?? 0);
    const totalPostureObserved = validGood + validSlouched;
    if (totalPostureObserved > 0) {
      postureRatio = clampRatio(validGood / totalPostureObserved);
    }
  }

  // If postureEventCount is provided without durations, apply a gentle penalty per slouch event
  if (postureRatio === null && typeof metrics.postureEventCount === 'number' && metrics.postureEventCount >= 0) {
    // e.g. each posture slouch event deducts 5% up to 50% max penalty
    const eventPenalty = Math.min(0.5, metrics.postureEventCount * 0.05);
    postureRatio = clampRatio(1.0 - eventPenalty);
  }

  // E. Unknown Ratio
  const unknownRatio = clampRatio(unknownDurationSeconds / activeDurationSeconds);

  // 4. Configure & dynamically adjust component weights
  const baseWeights: FocusIndicatorWeights = {
    presenceWeight: options?.weights?.presenceWeight ?? DEFAULT_FOCUS_INDICATOR_WEIGHTS.presenceWeight,
    screenFacingWeight: options?.weights?.screenFacingWeight ?? DEFAULT_FOCUS_INDICATOR_WEIGHTS.screenFacingWeight,
    postureWeight: options?.weights?.postureWeight ?? DEFAULT_FOCUS_INDICATOR_WEIGHTS.postureWeight,
  };

  // Determine active component scores and weights
  let effectivePresenceWeight = baseWeights.presenceWeight;
  let effectiveScreenFacingWeight = baseWeights.screenFacingWeight;
  let effectivePostureWeight = baseWeights.postureWeight;

  let effectiveScreenFacingScore = screenFacingRatio;
  let effectivePostureScore = postureRatio;

  if (unobservedHandling === 'neutral') {
    if (effectiveScreenFacingScore === null) effectiveScreenFacingScore = 0.5;
    if (effectivePostureScore === null) effectivePostureScore = 0.5;
  } else {
    // 'redistribute': if a metric is unobserved, drop its weight and redistribute to observed components
    if (effectiveScreenFacingScore === null) {
      effectiveScreenFacingWeight = 0;
    }
    if (effectivePostureScore === null) {
      effectivePostureWeight = 0;
    }
  }

  const totalEffectiveWeight =
    effectivePresenceWeight + effectiveScreenFacingWeight + effectivePostureWeight;

  if (totalEffectiveWeight <= 0) {
    return createEmptyResult(
      sessionId,
      'insufficient_data',
      'No observed detection signals available to evaluate.'
    );
  }

  // Normalize effective weights to sum to 1.0
  const normPresenceWeight = effectivePresenceWeight / totalEffectiveWeight;
  const normScreenFacingWeight = effectiveScreenFacingWeight / totalEffectiveWeight;
  const normPostureWeight = effectivePostureWeight / totalEffectiveWeight;

  const effectiveWeights: FocusIndicatorWeights = {
    presenceWeight: roundTo(normPresenceWeight, 3),
    screenFacingWeight: roundTo(normScreenFacingWeight, 3),
    postureWeight: roundTo(normPostureWeight, 3),
  };

  // 5. Calculate composite score [0.0 to 1.0] -> [0 to 100]
  let compositeScore = presenceRatio * normPresenceWeight;

  if (effectiveScreenFacingScore !== null && normScreenFacingWeight > 0) {
    compositeScore += effectiveScreenFacingScore * normScreenFacingWeight;
  }

  if (effectivePostureScore !== null && normPostureWeight > 0) {
    compositeScore += effectivePostureScore * normPostureWeight;
  }

  // Scale to 0–100 and clamp safely
  const score100 = clampNumber(compositeScore * 100, 0, 100);
  const finalScore = roundTo(score100, 1);

  // Confidence is calculated from observation coverage: 1.0 minus the unknown/unobserved ratio
  const confidence = roundTo(clampRatio(1.0 - unknownRatio), 2);

  const breakdown: FocusIndicatorBreakdown = {
    presenceRatio: roundTo(presenceRatio, 3),
    screenFacingRatio: screenFacingRatio !== null ? roundTo(screenFacingRatio, 3) : null,
    postureRatio: postureRatio !== null ? roundTo(postureRatio, 3) : null,
    awayRatio: roundTo(awayRatio, 3),
    unknownRatio: roundTo(unknownRatio, 3),
  };

  const summaryMessage =
    `Focus Indicator: ${finalScore}%. (Presence: ${(presenceRatio * 100).toFixed(0)}%, ` +
    `Screen-Facing: ${screenFacingRatio !== null ? `${(screenFacingRatio * 100).toFixed(0)}%` : 'N/A'}, ` +
    `Posture: ${postureRatio !== null ? `${(postureRatio * 100).toFixed(0)}%` : 'N/A'}, ` +
    `Away: ${(awayRatio * 100).toFixed(0)}%).`;

  return {
    sessionId,
    score: finalScore,
    status: 'calculated',
    confidence,
    breakdown,
    effectiveWeights,
    summaryMessage,
    disclaimer: FOCUS_INDICATOR_DISCLAIMER,
  };
}

/**
 * Convenience helper: calculates the Focus Indicator directly from an array of ActivityEvents
 * and session time parameters.
 *
 * Reuses the existing Day 18 AwayTimeCalculator to ensure 100% metric consistency
 * and zero divergent logic.
 */
export function calculateFocusIndicatorFromEvents(
  events: ActivityEvent[],
  sessionId: string,
  options?: {
    activeDurationSeconds?: number;
    plannedDurationSeconds?: number;
    weights?: Partial<FocusIndicatorWeights>;
    minActiveDurationSeconds?: number;
    now?: number;
  }
): FocusIndicatorResult {
  if (!sessionId || !Array.isArray(events) || events.length === 0) {
    return createEmptyResult(
      sessionId || null,
      'insufficient_data',
      'No activity events recorded for this session.'
    );
  }

  // 1. Calculate away time using Day 18 AwayTimeCalculator
  const awaySummary = calculateAwayTimeFromEvents(events, sessionId, { now: options?.now });
  const awayDurationSeconds = awaySummary.totalAwayTimeSeconds;

  // 2. Filter events matching this session and valid timestamps
  const sessionEvents = events
    .filter((e) => e && e.sessionId === sessionId && typeof e.timestamp === 'number' && Number.isFinite(e.timestamp) && e.timestamp > 0)
    .map((e) => ({
      ...e,
      timestamp: e.timestamp < 10_000_000_000 ? Math.floor(e.timestamp * 1000) : Math.floor(e.timestamp),
    }));

  if (sessionEvents.length === 0) {
    return createEmptyResult(
      sessionId,
      'insufficient_data',
      'No valid timestamps found in session activity events.'
    );
  }

  // Sort events chronologically
  sessionEvents.sort((a, b) => a.timestamp - b.timestamp);

  // Determine session start and end times to calculate active session duration if not provided
  let startMs: number | null = null;
  let endMs: number | null = null;
  let pausedIntervalsMs = 0;
  let pauseStartMs: number | null = null;

  for (const event of sessionEvents) {
    if (event.category === 'session' || event.type.startsWith('SESSION_')) {
      if (event.type === 'SESSION_STARTED' && startMs === null) {
        startMs = event.timestamp;
      } else if (event.type === 'SESSION_PAUSED') {
        if (pauseStartMs === null) {
          pauseStartMs = event.timestamp;
        }
      } else if (event.type === 'SESSION_RESUMED') {
        if (pauseStartMs !== null) {
          pausedIntervalsMs += Math.max(0, event.timestamp - pauseStartMs);
          pauseStartMs = null;
        }
      } else if (event.type === 'SESSION_ENDED' || event.type === 'SESSION_COMPLETED') {
        if (pauseStartMs !== null) {
          pausedIntervalsMs += Math.max(0, event.timestamp - pauseStartMs);
          pauseStartMs = null;
        }
        endMs = event.timestamp;
      }
    }
  }

  // If no explicit session start event was found, fall back to earliest event
  if (startMs === null) {
    startMs = sessionEvents[0].timestamp;
  }
  if (endMs === null) {
    endMs = options?.now ?? sessionEvents[sessionEvents.length - 1].timestamp;
  }

  const rawActiveSeconds =
    options?.activeDurationSeconds ??
    Math.max(0, Math.floor((endMs - startMs - pausedIntervalsMs) / 1000));

  // 3. Compute time intervals for screen-facing, posture, and unknown detection
  let screenFacingMs = 0;
  let lookingAwayMs = 0;
  let goodPostureMs = 0;
  let slouchedPostureMs = 0;
  let unknownDetectionMs = 0;
  let postureEventCount = 0;

  // Track state intervals during active running periods
  let isRunning = false;
  let lastStateChangeTimeMs = startMs;
  let currentScreenFacing: 'SCREEN_FACING' | 'LOOKING_AWAY' | 'UNKNOWN' = 'UNKNOWN';
  let currentPosture: 'GOOD_POSTURE' | 'SLOUCHED_POSTURE' | 'UNKNOWN' = 'UNKNOWN';

  for (const event of sessionEvents) {
    const t = event.timestamp;

    // Accumulate elapsed durations up to this event time if running
    if (isRunning && t > lastStateChangeTimeMs) {
      const deltaMs = t - lastStateChangeTimeMs;

      if (currentScreenFacing === 'SCREEN_FACING') screenFacingMs += deltaMs;
      else if (currentScreenFacing === 'LOOKING_AWAY') lookingAwayMs += deltaMs;

      if (currentPosture === 'GOOD_POSTURE') goodPostureMs += deltaMs;
      else if (currentPosture === 'SLOUCHED_POSTURE') slouchedPostureMs += deltaMs;

      if (currentScreenFacing === 'UNKNOWN' && currentPosture === 'UNKNOWN') {
        unknownDetectionMs += deltaMs;
      }
    }

    lastStateChangeTimeMs = t;

    // Handle lifecycle
    if (event.category === 'session' || event.type.startsWith('SESSION_')) {
      if (event.type === 'SESSION_STARTED' || event.type === 'SESSION_RESUMED') {
        isRunning = true;
      } else if (event.type === 'SESSION_PAUSED' || event.type === 'SESSION_ENDED' || event.type === 'SESSION_COMPLETED') {
        isRunning = false;
      }
      continue;
    }

    // If not running, don't update active detection tracking
    if (!isRunning) continue;

    // Handle screen facing transitions
    if (event.category === 'screen_facing' || event.type === 'SCREEN_FACING' || event.type === 'LOOKING_AWAY' || event.type === 'SCREEN_FACING_UNKNOWN') {
      if (event.type === 'SCREEN_FACING' || event.stateValue === 'SCREEN_FACING') {
        currentScreenFacing = 'SCREEN_FACING';
      } else if (event.type === 'LOOKING_AWAY' || event.stateValue === 'LOOKING_AWAY') {
        currentScreenFacing = 'LOOKING_AWAY';
      } else {
        currentScreenFacing = 'UNKNOWN';
      }
    }

    // Handle posture transitions
    if (event.category === 'posture' || event.type === 'POSTURE_GOOD' || event.type === 'POSTURE_SLOUCHED' || event.type === 'POSTURE_UNKNOWN') {
      if (event.type === 'POSTURE_GOOD' || event.stateValue === 'GOOD_POSTURE') {
        currentPosture = 'GOOD_POSTURE';
      } else if (event.type === 'POSTURE_SLOUCHED' || event.stateValue === 'SLOUCHED_POSTURE') {
        currentPosture = 'SLOUCHED_POSTURE';
        postureEventCount++;
      } else {
        currentPosture = 'UNKNOWN';
      }
    }
  }

  return calculateFocusIndicator(
    {
      sessionId,
      activeDurationSeconds: rawActiveSeconds,
      awayDurationSeconds,
      screenFacingDurationSeconds: Math.floor(screenFacingMs / 1000),
      lookingAwayDurationSeconds: Math.floor(lookingAwayMs / 1000),
      goodPostureDurationSeconds: Math.floor(goodPostureMs / 1000),
      slouchedPostureDurationSeconds: Math.floor(slouchedPostureMs / 1000),
      unknownDurationSeconds: Math.floor(unknownDetectionMs / 1000),
      postureEventCount,
    },
    options
  );
}

// ---------------------------------------------------------------------------
// Helpers & Sanitizers
// ---------------------------------------------------------------------------

function createEmptyResult(
  sessionId: string | null,
  status: FocusIndicatorStatus,
  summaryMessage: string
): FocusIndicatorResult {
  return {
    sessionId,
    score: null,
    status,
    confidence: 0,
    breakdown: {
      presenceRatio: 0,
      screenFacingRatio: null,
      postureRatio: null,
      awayRatio: 0,
      unknownRatio: 0,
    },
    effectiveWeights: { ...DEFAULT_FOCUS_INDICATOR_WEIGHTS },
    summaryMessage,
    disclaimer: FOCUS_INDICATOR_DISCLAIMER,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampRatio(value: number): number {
  return clampNumber(value, 0.0, 1.0);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
