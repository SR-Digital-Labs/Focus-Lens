/**
 * FocusLens — Session History Presentation Utilities
 * ====================================================
 * Pure helper functions for formatting dates, times, durations,
 * status badges, and calculating date ranges for history filtering.
 */

import type { PersistedSessionStatus } from '../types/index.ts';

/**
 * Format an ISO timestamp into a localized human-readable date.
 * Returns '—' for missing, null, or invalid dates.
 */
export function formatSessionDate(isoString: string | null | undefined): string {
  if (!isoString || typeof isoString !== 'string') return '—';
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) return '—';

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(timestamp));
  } catch {
    return '—';
  }
}

/**
 * Format an ISO timestamp into a localized human-readable time (e.g. 02:45 PM).
 * Returns '—' for missing, null, or invalid timestamps.
 */
export function formatSessionTime(isoString: string | null | undefined): string {
  if (!isoString || typeof isoString !== 'string') return '—';
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) return '—';

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '—';
  }
}

/**
 * Format a duration in seconds into a clean, human-readable string:
 * - 0 -> '0s'
 * - 45 -> '45s'
 * - 1500 -> '25m'
 * - 1530 -> '25m 30s'
 * - 3600 -> '1h'
 * - 5400 -> '1h 30m'
 * Returns '—' if value is missing, negative, NaN, or non-finite.
 */
export function formatSessionDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }

  const safe = Math.floor(seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remSeconds = safe % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  return `${remSeconds}s`;
}

/**
 * Format away duration in seconds.
 * Returns '—' if away tracking is unavailable or missing.
 */
export function formatSessionAwayDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  return formatSessionDuration(seconds);
}

/**
 * Format Focus Indicator score (0 to 100) into percentage string (e.g. '85%').
 * Returns '—' if the score is uncalculated or unavailable.
 */
export function formatSessionFocusScore(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return '—';
  }
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  return `${clamped}%`;
}

/**
 * Determine CSS class for session status badges.
 */
export function getStatusBadgeClass(status: PersistedSessionStatus | string): string {
  switch (status) {
    case 'completed':
      return 'status-completed';
    case 'cancelled':
      return 'status-cancelled';
    case 'interrupted':
      return 'status-interrupted';
    case 'running':
      return 'status-running';
    case 'paused':
      return 'status-paused';
    default:
      return 'status-unknown';
  }
}

/**
 * Capitalized human-readable label for a session status.
 */
export function getStatusLabel(status: PersistedSessionStatus | string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'interrupted':
      return 'Interrupted';
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
}

export type DateFilterPreset = 'all' | 'today' | '7d' | '30d';

/**
 * Compute ISO string date filter range for database session querying.
 */
export function calculateDateFilterRange(
  preset: DateFilterPreset,
  now: Date = new Date(),
): { startedAfter?: string; startedBefore?: string } {
  if (preset === 'all') {
    return {};
  }

  const endOfWindow = new Date(now.getTime() + 60_000); // 1 minute in future to cover current second

  if (preset === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return {
      startedAfter: startOfToday.toISOString(),
      startedBefore: endOfWindow.toISOString(),
    };
  }

  if (preset === '7d') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      startedAfter: sevenDaysAgo.toISOString(),
      startedBefore: endOfWindow.toISOString(),
    };
  }

  if (preset === '30d') {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      startedAfter: thirtyDaysAgo.toISOString(),
      startedBefore: endOfWindow.toISOString(),
    };
  }

  return {};
}
