import type { ActivityEvent, FocusTimerState } from '../types';
import type { ActivityMonitoringState, Unsubscribe } from './contracts';

export interface AwayDetectionEvent extends ActivityEvent {
  awayStartedAt: number;
  thresholdReachedAt: number;
  endedAt: number | null;
}

export interface AwayDetectionSnapshot {
  sessionId: string | null;
  awayStartedAt: string | null;
  awayDurationMs: number;
  thresholdMinutes: number;
  events: AwayDetectionEvent[];
}

export interface AwayDetectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AwayDetectionClock {
  now(): number;
}

interface AwayDetectionOptions {
  activity: {
    subscribe(listener: (state: ActivityMonitoringState) => void): Unsubscribe;
  };
  timer: {
    getState(): FocusTimerState;
    subscribe(listener: (state: FocusTimerState) => void): Unsubscribe;
  };
  storage: AwayDetectionStorage;
  clock?: AwayDetectionClock;
  createEventId?: () => string;
  maxSignalAgeMs?: number;
}

const SETTINGS_KEY = 'focuslens.away-detection.settings.v1';
const DEFAULT_THRESHOLD_MINUTES = 5;
const MIN_THRESHOLD_MINUTES = 1;
const MAX_THRESHOLD_MINUTES = 60;
const DEFAULT_MAX_SIGNAL_AGE_MS = 30_000;
const MAX_FUTURE_SIGNAL_SKEW_MS = 1_000;
export const DEFAULT_AWAY_THRESHOLD_MINUTES = DEFAULT_THRESHOLD_MINUTES;

export class AwayDetectionService {
  private readonly activity: AwayDetectionOptions['activity'];
  private readonly timer: AwayDetectionOptions['timer'];
  private readonly storage: AwayDetectionStorage;
  private readonly clock: AwayDetectionClock;
  private readonly createEventId: () => string;
  private readonly maxSignalAgeMs: number;
  private readonly listeners = new Set<(snapshot: AwayDetectionSnapshot) => void>();
  private thresholdMinutes: number;
  private sessionId: string | null = null;
  private timerStatus: FocusTimerState['status'] = 'idle';
  private presence: 'away' | 'present' | 'unknown' | null = null;
  private awayStartedAtMs: number | null = null;
  private periodThresholdMs: number | null = null;
  private pausedAtMs: number | null = null;
  private accumulatedPauseMs = 0;
  private latestSignalAtMs: number | null = null;
  private events: AwayDetectionEvent[] = [];
  private unsubscribeActivity: Unsubscribe | null = null;
  private unsubscribeTimer: Unsubscribe | null = null;
  private started = false;

  constructor(options: AwayDetectionOptions) {
    this.activity = options.activity;
    this.timer = options.timer;
    this.storage = options.storage;
    this.clock = options.clock ?? Date;
    this.createEventId = options.createEventId ?? (() => crypto.randomUUID());
    this.maxSignalAgeMs = options.maxSignalAgeMs ?? DEFAULT_MAX_SIGNAL_AGE_MS;
    if (!Number.isFinite(this.maxSignalAgeMs) || this.maxSignalAgeMs <= 0) {
      throw new Error('Maximum away-signal age must be a positive finite duration.');
    }
    this.thresholdMinutes = this.readThreshold();
  }

  getSnapshot(): AwayDetectionSnapshot {
    const now = this.clock.now();
    return {
      sessionId: this.sessionId,
      awayStartedAt: this.awayStartedAtMs === null
        ? null
        : new Date(this.awayStartedAtMs).toISOString(),
      awayDurationMs: this.getAwayDuration(now),
      thresholdMinutes: this.thresholdMinutes,
      events: this.events.map((event) => ({ ...event })),
    };
  }

  subscribe(listener: (snapshot: AwayDetectionSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  start(): Unsubscribe {
    if (this.started) {
      return () => this.stop();
    }
    this.started = true;
    this.timerStatus = this.timer.getState().status;
    this.unsubscribeTimer = this.timer.subscribe((state) => this.onTimerState(state));
    this.unsubscribeActivity = this.activity.subscribe((state) => this.onActivityState(state));
    return () => this.stop();
  }

  stop(): void {
    if (this.sessionId !== null) {
      this.finalizeAndClearSession();
    }
    this.unsubscribeActivity?.();
    this.unsubscribeTimer?.();
    this.unsubscribeActivity = null;
    this.unsubscribeTimer = null;
    this.started = false;
  }

  setThresholdMinutes(minutes: number): void {
    validateAwayThreshold(minutes);
    const previousThreshold = this.thresholdMinutes;
    this.thresholdMinutes = minutes;
    try {
      saveAwayThresholdMinutes(this.storage, minutes);
    } catch (error) {
      this.thresholdMinutes = previousThreshold;
      throw error;
    }
    this.emit();
  }

  private readThreshold(): number {
    return readAwayThresholdMinutes(this.storage);
  }

  private onTimerState(state: FocusTimerState): void {
    const now = this.clock.now();
    if (this.timerStatus === 'running') {
      this.advance(now);
    }
    this.timerStatus = state.status;
    if (state.status === 'paused') {
      if (this.awayStartedAtMs !== null && this.pausedAtMs === null) {
        this.pausedAtMs = now;
      }
    } else if (state.status === 'running') {
      if (this.pausedAtMs !== null) {
        this.accumulatedPauseMs += Math.max(0, now - this.pausedAtMs);
        this.pausedAtMs = null;
      }
      this.advance(now);
    } else {
      this.finalizeAndClearSession();
      return;
    }
    this.emit();
  }

  private onActivityState(state: ActivityMonitoringState): void {
    if (!state.sessionId) {
      if (this.sessionId !== null) {
        this.finalizeAndClearSession();
      }
      return;
    }
    if (state.sessionId !== this.sessionId) {
      this.clearSession();
      this.sessionId = state.sessionId;
    }
    if (this.timerStatus !== 'running' || state.status === 'paused') {
      this.emit();
      return;
    }

    const signal = state.status === 'active' ? state.signal : null;
    if (!signal) {
      if (state.status === 'unavailable' || state.status === 'error') {
        this.closeAsUnreliable(this.clock.now());
      }
      this.emit();
      return;
    }

    const signalAt = Date.parse(signal.occurredAt);
    const now = this.clock.now();
    if (
      !Number.isFinite(signalAt)
      || !['away', 'present', 'unknown'].includes(signal.personPresence)
      || signalAt > now + MAX_FUTURE_SIGNAL_SKEW_MS
      || now - signalAt > this.maxSignalAgeMs
      || (this.latestSignalAtMs !== null && signalAt <= this.latestSignalAtMs)
    ) {
      return;
    }

    this.latestSignalAtMs = signalAt;
    if (signal.personPresence === 'away') {
      if (this.awayStartedAtMs === null) {
        this.awayStartedAtMs = signalAt;
        this.periodThresholdMs = this.thresholdMinutes * 60_000;
        this.accumulatedPauseMs = 0;
        this.pausedAtMs = null;
      }
      this.presence = 'away';
      this.advance(now);
    } else {
      this.presence = signal.personPresence;
      this.endAwayPeriod(signalAt);
    }
    this.emit();
  }

  private advance(now: number): void {
    if (
      this.timerStatus !== 'running'
      || this.presence !== 'away'
      || this.awayStartedAtMs === null
      || this.periodThresholdMs === null
      || this.sessionId === null
    ) {
      return;
    }
    if (
      this.latestSignalAtMs === null
      || now - this.latestSignalAtMs > this.maxSignalAgeMs
    ) {
      this.closeAsUnreliable(now);
      return;
    }

    const awayDurationMs = this.getAwayDuration(now);
    const activeEvent = this.events.find((event) => event.endedAt === null);
    if (activeEvent) {
      activeEvent.duration = awayDurationMs / 1_000;
      return;
    }
    if (awayDurationMs < this.periodThresholdMs) {
      return;
    }
    const thresholdReachedAt = this.awayStartedAtMs
      + this.periodThresholdMs
      + this.accumulatedPauseMs
      + (this.pausedAtMs === null ? 0 : Math.max(0, now - this.pausedAtMs));
    const thresholdTimestamp = Math.min(now, thresholdReachedAt);
    this.events.push({
      id: this.createEventId(),
      sessionId: this.sessionId,
      timestamp: thresholdTimestamp,
      type: 'away',
      duration: awayDurationMs / 1_000,
      awayStartedAt: this.awayStartedAtMs,
      thresholdReachedAt: thresholdTimestamp,
      endedAt: null,
    });
  }

  private endAwayPeriod(endedAt: number): void {
    const activeEvent = this.events.find((event) => event.endedAt === null);
    if (activeEvent) {
      const finalDuration = this.getAwayDuration(endedAt);
      activeEvent.duration = finalDuration / 1_000;
      activeEvent.endedAt = Math.max(endedAt, activeEvent.thresholdReachedAt);
    }
    this.awayStartedAtMs = null;
    this.periodThresholdMs = null;
    this.pausedAtMs = null;
    this.accumulatedPauseMs = 0;
    this.presence = null;
  }

  private closeAsUnreliable(now: number): void {
    const lastReliableAt = this.latestSignalAtMs;
    this.endAwayPeriod(
      lastReliableAt === null
        ? now
        : Math.min(now, lastReliableAt + this.maxSignalAgeMs),
    );
  }

  private finalizeAndClearSession(): void {
    if (this.awayStartedAtMs !== null) {
      const now = this.clock.now();
      if (
        this.latestSignalAtMs !== null
        && now - this.latestSignalAtMs > this.maxSignalAgeMs
      ) {
        this.closeAsUnreliable(now);
      } else {
        this.endAwayPeriod(now);
      }
      this.emit();
    }
    this.clearSession();
    this.emit();
  }

  private getAwayDuration(now: number): number {
    if (this.awayStartedAtMs === null) {
      return 0;
    }
    const pausedMs = this.accumulatedPauseMs
      + (this.pausedAtMs === null ? 0 : Math.max(0, now - this.pausedAtMs));
    return Math.max(0, now - this.awayStartedAtMs - pausedMs);
  }

  private clearSession(): void {
    this.sessionId = null;
    this.presence = null;
    this.awayStartedAtMs = null;
    this.periodThresholdMs = null;
    this.pausedAtMs = null;
    this.accumulatedPauseMs = 0;
    this.latestSignalAtMs = null;
    this.events = [];
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function readAwayThresholdMinutes(storage: AwayDetectionStorage): number {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) {
      return DEFAULT_THRESHOLD_MINUTES;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !('thresholdMinutes' in parsed)
      || typeof parsed.thresholdMinutes !== 'number'
    ) {
      throw new Error('Stored away-detection settings have an invalid shape.');
    }
    validateAwayThreshold(parsed.thresholdMinutes);
    return parsed.thresholdMinutes;
  } catch (error) {
    console.error('Unable to load away-detection settings; using the default threshold.', error);
    return DEFAULT_THRESHOLD_MINUTES;
  }
}

export function saveAwayThresholdMinutes(
  storage: AwayDetectionStorage,
  minutes: number,
): void {
  validateAwayThreshold(minutes);
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ thresholdMinutes: minutes }));
  } catch (error) {
    throw new Error('Unable to save the away-detection threshold.', { cause: error });
  }
}

export function validateAwayThreshold(minutes: number): void {
  if (
    !Number.isInteger(minutes)
    || minutes < MIN_THRESHOLD_MINUTES
    || minutes > MAX_THRESHOLD_MINUTES
  ) {
    throw new Error(
      `Away threshold must be a whole number between ${MIN_THRESHOLD_MINUTES} and ${MAX_THRESHOLD_MINUTES} minutes.`,
    );
  }
}

export function getAwayDetectionStorage(): AwayDetectionStorage {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Local storage is unavailable for away-detection preferences.');
  }
  return window.localStorage;
}
