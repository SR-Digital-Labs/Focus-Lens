/**
 * FocusLens — Focus-Session Timer Service
 * =======================================
 * Day 16: Reliable, deadline-based focus timer service.
 *
 * Key guarantees:
 * 1. Timekeeping uses exact wall-clock deadlines (`Date.now() + remainingMs`),
 *    preventing clock drift caused by background tab/window throttling.
 * 2. Guarded against multiple timer instances; singleton service pattern.
 * 3. Never counts below zero into negative time.
 * 4. Pausing and resuming accurately preserve remaining time.
 * 5. Modular: decoupled from UI, ready for integration with Day 17-19 session engine.
 * 6. Local-only: zero cloud or external network dependencies.
 */

import {
  DEFAULT_FOCUS_DURATION_MINUTES,
  MAX_FOCUS_DURATION_MINUTES,
  MIN_FOCUS_DURATION_MINUTES,
  type FocusTimerState,
  type FocusTimerStatus,
  type Session,
  type SessionLifecycleEventType,
} from '../types/index.ts';

export interface SessionLifecycleEvent {
  type: SessionLifecycleEventType;
  sessionId: string;
  timestamp: number;
}

export function formatTimerDisplay(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function validateCustomDuration(minutes: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(minutes) || Number.isNaN(minutes)) {
    return { valid: false, error: 'Duration must be a valid number.' };
  }
  if (!Number.isInteger(minutes)) {
    return { valid: false, error: 'Duration must be a whole number of minutes.' };
  }
  if (minutes < MIN_FOCUS_DURATION_MINUTES) {
    return { valid: false, error: `Minimum focus session is ${MIN_FOCUS_DURATION_MINUTES} minute.` };
  }
  if (minutes > MAX_FOCUS_DURATION_MINUTES) {
    return {
      valid: false,
      error: `Maximum focus session is ${MAX_FOCUS_DURATION_MINUTES} minutes (3 hours).`,
    };
  }
  return { valid: true };
}

export class FocusTimerService {
  private _status: FocusTimerStatus = 'idle';
  private _durationMinutes: number = DEFAULT_FOCUS_DURATION_MINUTES;
  private _totalSeconds: number = DEFAULT_FOCUS_DURATION_MINUTES * 60;
  private _remainingSeconds: number = DEFAULT_FOCUS_DURATION_MINUTES * 60;
  private _targetDeadline: number | null = null;
  private _intervalId: ReturnType<typeof globalThis.setInterval> | null = null;
  private _listeners = new Set<(state: FocusTimerState) => void>();
  private _lifecycleListeners = new Set<(event: SessionLifecycleEvent) => void>();
  private _sessionId: string | null = null;
  private _sessionStartTime: number | null = null;

  constructor() {
    this._remainingSeconds = this._totalSeconds;
  }

  // ---------------------------------------------------------------------------
  // State Accessors
  // ---------------------------------------------------------------------------

  public getStatus(): FocusTimerStatus {
    return this._status;
  }

  public getSessionId(): string | null {
    return this._sessionId;
  }

  public getActiveSession(): Session | null {
    if (!this._sessionId || !this._sessionStartTime) {
      return null;
    }
    return {
      id: this._sessionId,
      startTime: this._sessionStartTime,
      duration: this._durationMinutes,
      isActive: this._status === 'running',
    };
  }

  public getState(): FocusTimerState {
    const elapsedSeconds = Math.max(0, this._totalSeconds - this._remainingSeconds);
    const progress =
      this._totalSeconds > 0
        ? Math.min(100, Math.max(0, (elapsedSeconds / this._totalSeconds) * 100))
        : 0;

    return {
      status: this._status,
      sessionId: this._sessionId,
      durationMinutes: this._durationMinutes,
      totalSeconds: this._totalSeconds,
      remainingSeconds: this._remainingSeconds,
      elapsedSeconds,
      progress,
      formattedRemaining: formatTimerDisplay(this._remainingSeconds),
    };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  public setDuration(minutes: number): boolean {
    const validation = validateCustomDuration(minutes);
    if (!validation.valid) {
      return false;
    }

    // Do not allow reconfiguring duration while a session is actively running or paused
    if (this._status === 'running' || this._status === 'paused') {
      return false;
    }

    this._durationMinutes = minutes;
    this._totalSeconds = minutes * 60;
    this._remainingSeconds = this._totalSeconds;
    this._targetDeadline = null;
    this._status = 'idle';
    this.notify();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  public start(customSessionId?: string): boolean {
    // Starting from paused must use resume() so elapsed time is not discarded.
    if (this._status !== 'idle' && this._status !== 'completed') {
      return false;
    }
    if (this._totalSeconds <= 0) {
      return false;
    }

    // Starting fresh or from completed
    this._remainingSeconds = this._totalSeconds;
    this._targetDeadline = Date.now() + this._remainingSeconds * 1000;
    this._status = 'running';
    this._sessionId = customSessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this._sessionStartTime = Date.now();

    this.startTicker();
    this.notify();
    this.notifyLifecycle('SESSION_STARTED');
    return true;
  }

  public pause(): boolean {
    if (this._status !== 'running') {
      return false;
    }

    // Accurately calculate remaining seconds at pause moment
    if (this._targetDeadline !== null) {
      const remainingMs = this._targetDeadline - Date.now();
      this._remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    }

    this._status = 'paused';
    this._targetDeadline = null;
    this.stopTicker();
    this.notify();
    this.notifyLifecycle('SESSION_PAUSED');
    return true;
  }

  public resume(): boolean {
    if (this._status !== 'paused') {
      return false;
    }

    if (this._remainingSeconds <= 0) {
      this._status = 'completed';
      this.notify();
      this.notifyLifecycle('SESSION_COMPLETED');
      return false;
    }

    // Establish new deadline from exact saved remaining seconds
    this._targetDeadline = Date.now() + this._remainingSeconds * 1000;
    this._status = 'running';

    this.startTicker();
    this.notify();
    this.notifyLifecycle('SESSION_RESUMED');
    return true;
  }

  public end(): void {
    if (this._status === 'idle') {
      return;
    }

    this.stopTicker();
    this._status = 'idle';
    this._targetDeadline = null;
    this._remainingSeconds = this._totalSeconds;
    this.notify();
    this.notifyLifecycle('SESSION_ENDED');
    this._sessionId = null;
    this._sessionStartTime = null;
  }

  public reset(): void {
    this.end();
  }

  // ---------------------------------------------------------------------------
  // Subscriptions & Lifecycle
  // ---------------------------------------------------------------------------

  public subscribe(listener: (state: FocusTimerState) => void): () => void {
    this._listeners.add(listener);
    // Immediately emit current state on subscription
    listener(this.getState());

    return () => {
      this._listeners.delete(listener);
    };
  }

  public subscribeLifecycle(listener: (event: SessionLifecycleEvent) => void): () => void {
    this._lifecycleListeners.add(listener);
    return () => {
      this._lifecycleListeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    this._listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('Error in FocusTimerService subscriber:', err);
      }
    });
  }

  private notifyLifecycle(type: SessionLifecycleEventType): void {
    if (!this._sessionId) return;
    const event: SessionLifecycleEvent = {
      type,
      sessionId: this._sessionId,
      timestamp: Date.now(),
    };
    this._lifecycleListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in FocusTimerService lifecycle subscriber:', err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Internal Ticker
  // ---------------------------------------------------------------------------

  private startTicker(): void {
    this.stopTicker();

    // 250ms tick interval gives responsive UI updates without unnecessary CPU load
    this._intervalId = globalThis.setInterval(() => {
      this.tick();
    }, 250);
  }

  private stopTicker(): void {
    if (this._intervalId !== null) {
      globalThis.clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  private tick(): void {
    if (this._status !== 'running' || this._targetDeadline === null) {
      return;
    }

    const remainingMs = this._targetDeadline - Date.now();
    const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

    // Handle timer reaching zero
    if (remaining <= 0) {
      this._remainingSeconds = 0;
      this._status = 'completed';
      this._targetDeadline = null;
      this.stopTicker();
      this.notify();
      this.notifyLifecycle('SESSION_COMPLETED');
      return;
    }

    // Update remaining if changed
    if (remaining !== this._remainingSeconds) {
      this._remainingSeconds = remaining;
      this.notify();
    }
  }
}

// Global singleton instance so timer state is preserved across route navigation
export const focusTimerService = new FocusTimerService();
