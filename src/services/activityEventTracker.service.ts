/**
 * FocusLens — Activity-Event Tracking Service
 * ===========================================
 * Day 17: Core activity-event tracking system.
 *
 * Key guarantees:
 * 1. Records meaningful detection-state transitions (person, screen-facing, posture)
 *    during active focus sessions rather than every raw frame.
 * 2. Idempotent: Suppresses duplicate events when the detected state has not changed.
 * 3. Handles initial detection state cleanly without inventing a prior state.
 * 4. Bound directly to session lifecycle (idle, running, paused, completed)
 *    and prevents cross-session contamination or spurious events when paused/idle.
 * 5. Safeguards against rapid detection flapping with configurable transition debounce.
 * 6. Privacy: Zero storage of webcam frames, images, or external cloud telemetry.
 *    Strictly records discrete, typed event records locally.
 */

import {
  type ActivityEvent,
  type ActivityEventCategory,
  type ActivityEventType,
  type DetectionSignalInput,
} from '../types/index.ts';
import { focusTimerService, type FocusTimerService, type SessionLifecycleEvent } from './focusTimer.service.ts';
import {
  calculateAwayTimeFromEvents,
  type AwayTimeSummary,
  type CalculateAwayTimeOptions,
} from './awayTimeCalculator.service.ts';
import {
  calculateFocusIndicatorFromEvents,
  type FocusIndicatorResult,
  type CalculateFocusIndicatorOptions,
} from './focusIndicator.service.ts';

export interface ActivityEventTrackerOptions {
  /**
   * Minimum duration in milliseconds required between consecutive state transitions
   * in the same category to prevent flapping from rapid detection noise.
   * Default: 300ms.
   */
  minTransitionIntervalMs?: number;
}

export interface TrackedStateSnapshot {
  person: string | null;
  screenFacing: string | null;
  posture: string | null;
}

export class ActivityEventTrackerService {
  private _events: ActivityEvent[] = [];
  private _activeSessionId: string | null = null;
  private _isSessionActive: boolean = false;
  private _options: Required<ActivityEventTrackerOptions>;

  private _lastStates: TrackedStateSnapshot = {
    person: null,
    screenFacing: null,
    posture: null,
  };

  private _lastTransitionTimes = {
    person: 0,
    screenFacing: 0,
    posture: 0,
  };

  private _listeners = new Set<(event: ActivityEvent) => void>();
  private _timerUnsubscribe: (() => void) | null = null;

  constructor(options?: ActivityEventTrackerOptions) {
    this._options = {
      minTransitionIntervalMs: options?.minTransitionIntervalMs ?? 300,
    };
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle Management
  // ---------------------------------------------------------------------------

  public startSession(sessionId: string, timestamp?: number): ActivityEvent {
    const safeTimestamp = this.resolveTimestamp(timestamp);
    this._activeSessionId = sessionId;
    this._isSessionActive = true;

    // Reset detection baseline for the new session
    this.resetDetectionState();

    const event = this.createAndRecordEvent({
      sessionId,
      type: 'SESSION_STARTED',
      category: 'session',
      stateValue: 'STARTED',
      timestamp: safeTimestamp,
    });

    return event;
  }

  public pauseSession(timestamp?: number): ActivityEvent | null {
    if (!this._activeSessionId || !this._isSessionActive) {
      return null;
    }

    const safeTimestamp = this.resolveTimestamp(timestamp);
    this._isSessionActive = false;

    const event = this.createAndRecordEvent({
      sessionId: this._activeSessionId,
      type: 'SESSION_PAUSED',
      category: 'session',
      stateValue: 'PAUSED',
      timestamp: safeTimestamp,
    });

    return event;
  }

  public resumeSession(timestamp?: number): ActivityEvent | null {
    if (!this._activeSessionId || this._isSessionActive) {
      return null;
    }

    const safeTimestamp = this.resolveTimestamp(timestamp);
    this._isSessionActive = true;

    const event = this.createAndRecordEvent({
      sessionId: this._activeSessionId,
      type: 'SESSION_RESUMED',
      category: 'session',
      stateValue: 'RESUMED',
      timestamp: safeTimestamp,
    });

    return event;
  }

  public endSession(timestamp?: number): ActivityEvent | null {
    if (!this._activeSessionId) {
      return null;
    }

    const safeTimestamp = this.resolveTimestamp(timestamp);
    const sessionId = this._activeSessionId;

    this._isSessionActive = false;
    this._activeSessionId = null;
    this.resetDetectionState();

    const event = this.createAndRecordEvent({
      sessionId,
      type: 'SESSION_ENDED',
      category: 'session',
      stateValue: 'ENDED',
      timestamp: safeTimestamp,
    });

    return event;
  }

  public completeSession(timestamp?: number): ActivityEvent | null {
    if (!this._activeSessionId) {
      return null;
    }

    const safeTimestamp = this.resolveTimestamp(timestamp);
    const sessionId = this._activeSessionId;

    this._isSessionActive = false;
    this._activeSessionId = null;
    this.resetDetectionState();

    const event = this.createAndRecordEvent({
      sessionId,
      type: 'SESSION_COMPLETED',
      category: 'session',
      stateValue: 'COMPLETED',
      timestamp: safeTimestamp,
    });

    return event;
  }

  // ---------------------------------------------------------------------------
  // Automatic Timer Binding
  // ---------------------------------------------------------------------------

  public bindTimer(timerService: FocusTimerService = focusTimerService): () => void {
    // Unbind any previous listener first to ensure no duplicates
    this.unbindTimer();

    // Check if the timer already has an active running session
    const currentTimerState = timerService.getState();
    if (currentTimerState.status === 'running' && currentTimerState.sessionId) {
      this._activeSessionId = currentTimerState.sessionId;
      this._isSessionActive = true;
    } else if (currentTimerState.status === 'paused' && currentTimerState.sessionId) {
      this._activeSessionId = currentTimerState.sessionId;
      this._isSessionActive = false;
    }

    const unsubscribe = timerService.subscribeLifecycle((lifecycleEvent: SessionLifecycleEvent) => {
      this.handleLifecycleEvent(lifecycleEvent);
    });

    this._timerUnsubscribe = unsubscribe;
    return () => this.unbindTimer();
  }

  public unbindTimer(): void {
    if (this._timerUnsubscribe) {
      this._timerUnsubscribe();
      this._timerUnsubscribe = null;
    }
  }

  private handleLifecycleEvent(lifecycleEvent: SessionLifecycleEvent): void {
    const { type, sessionId, timestamp } = lifecycleEvent;

    switch (type) {
      case 'SESSION_STARTED':
        this.startSession(sessionId, timestamp);
        break;
      case 'SESSION_PAUSED':
        this.pauseSession(timestamp);
        break;
      case 'SESSION_RESUMED':
        this.resumeSession(timestamp);
        break;
      case 'SESSION_ENDED':
        this.endSession(timestamp);
        break;
      case 'SESSION_COMPLETED':
        this.completeSession(timestamp);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Detection Signal Ingestion & State Transitions
  // ---------------------------------------------------------------------------

  /**
   * Process a detection signal containing any combination of person,
   * screen-facing, and posture states.
   *
   * Only records events when an active session is currently running.
   * Returns an array of newly recorded events (empty if no meaningful transition).
   */
  public processSignal(signal: DetectionSignalInput): ActivityEvent[] {
    // Guard: strictly ignore detection events if no session is active or if paused
    if (!this._isSessionActive || !this._activeSessionId) {
      return [];
    }

    // Safety: ensure no raw frame or media objects exist
    this.assertNoRawMedia(signal);

    const timestamp = this.resolveTimestamp(signal.timestamp || signal.occurredAt);
    const confidence = this.sanitizeConfidence(signal.confidence);
    const newEvents: ActivityEvent[] = [];

    // 1. Person Presence Transition
    if (signal.personPresence !== undefined && signal.personPresence !== null) {
      const normalized = this.normalizePersonState(signal.personPresence);
      const event = this.evaluateTransition({
        category: 'person',
        newState: normalized,
        confidence,
        timestamp,
        toEventType: (state) => {
          if (state === 'PRESENT') return 'PERSON_PRESENT';
          if (state === 'AWAY') return 'PERSON_AWAY';
          return 'PERSON_UNKNOWN';
        },
      });
      if (event) newEvents.push(event);
    }

    // 2. Screen-Facing Transition
    if (signal.screenFacing !== undefined && signal.screenFacing !== null) {
      const normalized = this.normalizeScreenFacingState(signal.screenFacing);
      const event = this.evaluateTransition({
        category: 'screen_facing',
        newState: normalized,
        confidence,
        timestamp,
        toEventType: (state) => {
          if (state === 'SCREEN_FACING') return 'SCREEN_FACING';
          if (state === 'LOOKING_AWAY') return 'LOOKING_AWAY';
          return 'SCREEN_FACING_UNKNOWN';
        },
      });
      if (event) newEvents.push(event);
    }

    // 3. Posture Transition
    if (signal.posture !== undefined && signal.posture !== null) {
      const normalized = this.normalizePostureState(signal.posture);
      const event = this.evaluateTransition({
        category: 'posture',
        newState: normalized,
        confidence,
        timestamp,
        toEventType: (state) => {
          if (state === 'GOOD_POSTURE') return 'POSTURE_GOOD';
          if (state === 'SLOUCHED_POSTURE') return 'POSTURE_SLOUCHED';
          return 'POSTURE_UNKNOWN';
        },
      });
      if (event) newEvents.push(event);
    }

    return newEvents;
  }

  public recordPersonState(
    state: string,
    confidence?: number | null,
    timestamp?: number | string | null
  ): ActivityEvent | null {
    const events = this.processSignal({
      personPresence: state as DetectionSignalInput['personPresence'],
      confidence,
      timestamp,
    });
    return events[0] ?? null;
  }

  public recordScreenFacingState(
    state: string,
    confidence?: number | null,
    timestamp?: number | string | null
  ): ActivityEvent | null {
    const events = this.processSignal({
      screenFacing: state as DetectionSignalInput['screenFacing'],
      confidence,
      timestamp,
    });
    return events[0] ?? null;
  }

  public recordPostureState(
    state: string,
    confidence?: number | null,
    timestamp?: number | string | null
  ): ActivityEvent | null {
    const events = this.processSignal({
      posture: state as DetectionSignalInput['posture'],
      confidence,
      timestamp,
    });
    return events[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Transition Evaluator & Deduplication Logic
  // ---------------------------------------------------------------------------

  private evaluateTransition(params: {
    category: 'person' | 'screen_facing' | 'posture';
    newState: string;
    confidence?: number;
    timestamp: number;
    toEventType: (state: string) => ActivityEventType;
  }): ActivityEvent | null {
    const { category, newState, confidence, timestamp, toEventType } = params;
    const stateKey = category === 'screen_facing' ? 'screenFacing' : category;
    const currentState = this._lastStates[stateKey];

    // 1. Deduplication: State has not changed at all
    if (currentState === newState) {
      return null;
    }

    // 2. Anti-flapping check: If transitioning rapidly between known states within cooldown window
    if (currentState !== null && this._options.minTransitionIntervalMs > 0) {
      const timeSinceLastTransition = timestamp - this._lastTransitionTimes[stateKey];
      if (timeSinceLastTransition < this._options.minTransitionIntervalMs) {
        // Suppress rapid flicker
        return null;
      }
    }

    // Record transition
    const previousStateValue = currentState ?? undefined;
    this._lastStates[stateKey] = newState;
    this._lastTransitionTimes[stateKey] = timestamp;

    const event = this.createAndRecordEvent({
      sessionId: this._activeSessionId!,
      type: toEventType(newState),
      category,
      stateValue: newState,
      previousStateValue,
      confidence,
      timestamp,
    });

    return event;
  }

  // ---------------------------------------------------------------------------
  // Event Factory & Storage
  // ---------------------------------------------------------------------------

  private createAndRecordEvent(params: {
    sessionId: string;
    type: ActivityEventType;
    category: ActivityEventCategory;
    stateValue: string;
    previousStateValue?: string;
    confidence?: number;
    duration?: number;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }): ActivityEvent {
    const {
      sessionId,
      type,
      category,
      stateValue,
      previousStateValue,
      confidence,
      duration,
      timestamp,
      metadata,
    } = params;

    const id = `evt_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    const occurredAt = new Date(timestamp).toISOString();

    const event: ActivityEvent = {
      id,
      sessionId,
      timestamp,
      occurredAt,
      type,
      category,
      stateValue,
      ...(previousStateValue !== undefined ? { previousStateValue } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(metadata ? { metadata } : {}),
    };

    this._events.push(event);
    this.notifyListeners(event);
    return event;
  }

  // ---------------------------------------------------------------------------
  // Subscriptions & Queries
  // ---------------------------------------------------------------------------

  public subscribe(listener: (event: ActivityEvent) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private notifyListeners(event: ActivityEvent): void {
    this._listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in ActivityEventTracker subscriber:', err);
      }
    });
  }

  public getEvents(sessionId?: string): ActivityEvent[] {
    if (sessionId) {
      return this._events.filter((e) => e.sessionId === sessionId);
    }
    return [...this._events];
  }

  public getEventsByCategory(category: ActivityEventCategory, sessionId?: string): ActivityEvent[] {
    const list = sessionId ? this._events.filter((e) => e.sessionId === sessionId) : this._events;
    return list.filter((e) => e.category === category);
  }

  public getLastEvent(sessionId?: string): ActivityEvent | null {
    const list = sessionId ? this._events.filter((e) => e.sessionId === sessionId) : this._events;
    return list.length > 0 ? list[list.length - 1] : null;
  }

  public getEventCount(sessionId?: string): number {
    if (sessionId) {
      return this._events.filter((e) => e.sessionId === sessionId).length;
    }
    return this._events.length;
  }

  public getActiveSessionId(): string | null {
    return this._activeSessionId;
  }

  /**
   * Day 18: Calculates away-time summary for a specific session (or active session by default).
   */
  public calculateAwayTime(sessionId?: string, options?: CalculateAwayTimeOptions): AwayTimeSummary {
    const targetSessionId = sessionId ?? this._activeSessionId ?? '';
    const events = this.getEvents(targetSessionId);
    return calculateAwayTimeFromEvents(events, targetSessionId, options);
  }

  /**
   * Day 19: Calculates the Focus Indicator summary for a specific session (or active session by default).
   */
  public calculateFocusIndicator(
    sessionId?: string,
    options?: CalculateFocusIndicatorOptions & { activeDurationSeconds?: number; plannedDurationSeconds?: number; now?: number }
  ): FocusIndicatorResult {
    const targetSessionId = sessionId ?? this._activeSessionId ?? '';
    const events = this.getEvents(targetSessionId);
    return calculateFocusIndicatorFromEvents(events, targetSessionId, options);
  }

  public isTracking(): boolean {
    return this._isSessionActive && this._activeSessionId !== null;
  }

  public getCurrentTrackedStates(): TrackedStateSnapshot {
    return { ...this._lastStates };
  }

  public clearEvents(): void {
    this._events = [];
  }

  public resetDetectionState(): void {
    this._lastStates = {
      person: null,
      screenFacing: null,
      posture: null,
    };
    this._lastTransitionTimes = {
      person: 0,
      screenFacing: 0,
      posture: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Normalization & Validation Helpers
  // ---------------------------------------------------------------------------

  private normalizePersonState(rawState: unknown): 'PRESENT' | 'AWAY' | 'UNKNOWN' {
    if (typeof rawState !== 'string') return 'UNKNOWN';
    const s = rawState.toUpperCase().trim();
    if (s === 'PRESENT' || s === 'TRUE' || s === 'DETECTED') return 'PRESENT';
    if (s === 'AWAY' || s === 'FALSE' || s === 'NOT_DETECTED') return 'AWAY';
    return 'UNKNOWN';
  }

  private normalizeScreenFacingState(rawState: unknown): 'SCREEN_FACING' | 'LOOKING_AWAY' | 'UNKNOWN' {
    if (typeof rawState !== 'string') return 'UNKNOWN';
    const s = rawState.toUpperCase().trim();
    if (s === 'SCREEN_FACING' || s === 'FACING' || s === 'LOOKING_SCREEN') return 'SCREEN_FACING';
    if (s === 'LOOKING_AWAY' || s === 'AWAY') return 'LOOKING_AWAY';
    return 'UNKNOWN';
  }

  private normalizePostureState(rawState: unknown): 'GOOD_POSTURE' | 'SLOUCHED_POSTURE' | 'UNKNOWN' {
    if (typeof rawState !== 'string') return 'UNKNOWN';
    const s = rawState.toUpperCase().trim();
    if (s === 'GOOD_POSTURE' || s === 'GOOD' || s === 'UPRIGHT') return 'GOOD_POSTURE';
    if (s === 'SLOUCHED_POSTURE' || s === 'SLOUCHED' || s === 'POOR') return 'SLOUCHED_POSTURE';
    return 'UNKNOWN';
  }

  private resolveTimestamp(input?: number | string | null): number {
    if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
      // If timestamp is in seconds (e.g. from Python time.time()), convert to milliseconds
      return input < 10_000_000_000 ? Math.floor(input * 1000) : Math.floor(input);
    }
    if (typeof input === 'string') {
      const parsed = Date.parse(input);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return Date.now();
  }

  private sanitizeConfidence(conf?: unknown): number | undefined {
    if (typeof conf !== 'number' || !Number.isFinite(conf)) {
      return undefined;
    }
    return Math.min(1.0, Math.max(0.0, conf));
  }

  private assertNoRawMedia(signal: unknown): void {
    if (signal && typeof signal === 'object') {
      const s = signal as Record<string, unknown>;
      if ('data' in s || 'frame' in s || 'imageData' in s || 'video' in s) {
        throw new Error('Privacy Violation: Raw webcam frames or media cannot be accepted into event tracking.');
      }
    }
  }
}

// Global singleton instance ready for session lifecycle and CV integration
export const activityEventTracker = new ActivityEventTrackerService();

// Automatically bind the singleton tracker to the global focus timer service
activityEventTracker.bindTimer(focusTimerService);
