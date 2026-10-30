/**
 * FocusLens — Break Interval Presentation Utilities (Day 30)
 * ===========================================================
 * Pure, side-effect-free helper functions that validate and label the
 * supported break-reminder interval options.
 *
 * Kept in a separate .ts file (no JSX) so they can be imported by both the
 * React component and the Node.js test suite without a JSX transform.
 */

// ---------------------------------------------------------------------------
// Supported water-reminder interval options (must match service validation)
// ---------------------------------------------------------------------------

/** Interval options accepted by WellnessReminderService.validateSettings(). */
export const BREAK_INTERVAL_OPTIONS = [30, 45, 60, 90] as const;
export type BreakIntervalMinutes = (typeof BREAK_INTERVAL_OPTIONS)[number];

/**
 * Returns a human-readable label for a break interval option.
 * Exported so it can be reused by tests and other presenters.
 */
export function breakIntervalLabel(minutes: BreakIntervalMinutes): string {
  switch (minutes) {
    case 30: return 'Every 30 minutes';
    case 45: return 'Every 45 minutes';
    case 60: return 'Every hour';
    case 90: return 'Every 90 minutes';
  }
}

/**
 * Returns true when the given number is a supported break interval.
 * Exported for use in tests.
 */
export function isValidBreakInterval(value: number): value is BreakIntervalMinutes {
  return (BREAK_INTERVAL_OPTIONS as readonly number[]).includes(value);
}
