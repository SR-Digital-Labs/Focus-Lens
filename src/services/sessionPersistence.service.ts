import type { FocusTimerState } from '../types';
import type { ActivityMonitoringState, Unsubscribe } from './contracts';
import type { AwayDetectionEvent, AwayDetectionSnapshot } from './awayDetection.service';
import type { ActivityEventRepository, SessionUpdate } from './db.service';
import type { Session } from '../types';

interface SessionPersistenceOptions {
  activity: {
    subscribe(listener: (state: ActivityMonitoringState) => void): Unsubscribe;
  };
  timer: {
    getState(): FocusTimerState;
    subscribe(listener: (state: FocusTimerState) => void): Unsubscribe;
  };
  away: {
    subscribe(listener: (snapshot: AwayDetectionSnapshot) => void): Unsubscribe;
  };
  sessions: {
    create(session: Session): Promise<unknown>;
    update(id: string, changes: SessionUpdate): Promise<unknown>;
  };
  events: Pick<ActivityEventRepository, 'record'>;
  now?: () => number;
  onError?: (error: Error) => void;
}

export class SessionPersistenceService {
  private readonly activity: SessionPersistenceOptions['activity'];
  private readonly timer: SessionPersistenceOptions['timer'];
  private readonly away: SessionPersistenceOptions['away'];
  private readonly sessions: SessionPersistenceOptions['sessions'];
  private readonly events: SessionPersistenceOptions['events'];
  private readonly now: () => number;
  private readonly onError: (error: Error) => void;
  private currentSession: Session | null = null;
  private timerState: FocusTimerState;
  private lastObservedElapsedSeconds = 0;
  private previousActivityState: ActivityMonitoringState | null = null;
  private lastPersistedElapsedSecond = 0;
  private pendingWrites: Promise<void> = Promise.resolve();
  private awayEventStates = new Map<string, boolean>();
  private unsubscribeActivity: Unsubscribe | null = null;
  private unsubscribeTimer: Unsubscribe | null = null;
  private unsubscribeAway: Unsubscribe | null = null;
  private started = false;

  constructor(options: SessionPersistenceOptions) {
    this.activity = options.activity;
    this.timer = options.timer;
    this.away = options.away;
    this.sessions = options.sessions;
    this.events = options.events;
    this.now = options.now ?? Date.now;
    this.onError = options.onError ?? ((error) => console.error('Session persistence failed:', error));
    this.timerState = this.timer.getState();
  }

  start(): Unsubscribe {
    if (this.started) {
      return () => this.stop();
    }
    this.started = true;
    this.unsubscribeActivity = this.activity.subscribe((state) => this.onActivityState(state));
    this.unsubscribeTimer = this.timer.subscribe((state) => this.onTimerState(state));
    this.unsubscribeAway = this.away.subscribe((snapshot) => this.onAwaySnapshot(snapshot));
    return () => this.stop();
  }

  stop(): void {
    this.unsubscribeActivity?.();
    this.unsubscribeTimer?.();
    this.unsubscribeAway?.();
    this.unsubscribeActivity = null;
    this.unsubscribeTimer = null;
    this.unsubscribeAway = null;
    this.started = false;
  }

  flush(): Promise<void> {
    return this.pendingWrites;
  }

  private onActivityState(state: ActivityMonitoringState): void {
    this.previousActivityState = state;
    if (!state.sessionId) {
      if (this.currentSession) {
        this.finishSession(this.terminalStatus(), this.timer.getState());
      }
      return;
    }

    if (this.currentSession?.id !== state.sessionId) {
      if (this.currentSession) {
        this.finishSession('interrupted', this.timer.getState());
      }
      this.awayEventStates.clear();
      this.beginSession(state.sessionId, this.timer.getState());
      return;
    }

    const desiredStatus = this.timerState.status === 'paused' || state.status === 'paused'
      ? 'paused'
      : 'running';
    this.updateActiveSession(desiredStatus, this.timer.getState());
  }

  private onTimerState(state: FocusTimerState): void {
    this.timerState = state;
    if (state.status === 'running' || state.status === 'paused' || state.status === 'completed') {
      this.lastObservedElapsedSeconds = Math.max(
        this.lastObservedElapsedSeconds,
        state.elapsedSeconds,
      );
    }
    if (!this.currentSession) {
      return;
    }
    if (state.status === 'completed') {
      this.finishSession('completed', state);
      return;
    }
    if (state.status === 'idle') {
      this.finishSession('cancelled', state);
      return;
    }
    const activity = this.previousActivityState;
    const desiredStatus = state.status === 'paused' || activity?.status === 'paused'
      ? 'paused'
      : 'running';
    this.updateActiveSession(desiredStatus, state);
  }

  private beginSession(sessionId: string, timerState: FocusTimerState): void {
    if (timerState.status !== 'running' && timerState.status !== 'paused') {
      return;
    }
    const now = this.now();
    const paused = timerState.status === 'paused';
    const session: Session = {
      id: sessionId,
      status: paused ? 'paused' : 'running',
      plannedDurationSeconds: timerState.totalSeconds,
      startedAt: new Date(now).toISOString(),
      pausedAt: paused ? new Date(now).toISOString() : null,
      endedAt: null,
      elapsedSeconds: timerState.elapsedSeconds,
      pausedDurationSeconds: 0,
    };
    this.lastObservedElapsedSeconds = timerState.elapsedSeconds;
    this.currentSession = session;
    this.lastPersistedElapsedSecond = session.elapsedSeconds;
    this.enqueue(async () => {
      await this.sessions.create({ ...session });
    });
  }

  private updateActiveSession(
    status: 'running' | 'paused',
    timerState: FocusTimerState,
  ): void {
    const current = this.currentSession;
    if (!current || ['completed', 'cancelled', 'interrupted'].includes(current.status)) {
      return;
    }
    const now = this.now();
    let pausedAt = current.pausedAt;
    let pausedDurationSeconds = current.pausedDurationSeconds;
    if (status === 'paused' && current.status !== 'paused') {
      pausedAt = new Date(now).toISOString();
    } else if (status === 'running' && current.status === 'paused') {
      if (pausedAt) {
        pausedDurationSeconds += Math.max(0, now - Date.parse(pausedAt)) / 1_000;
      }
      pausedAt = null;
    }
    const next: Session = {
      ...current,
      status,
      pausedAt,
      elapsedSeconds: Math.max(current.elapsedSeconds, Math.min(
        current.plannedDurationSeconds,
        timerState.elapsedSeconds,
      )),
      pausedDurationSeconds,
    };
    this.currentSession = next;
    const elapsedCheckpoint = Math.floor(next.elapsedSeconds / 5) * 5;
    const stateChanged =
      next.status !== current.status
      || next.pausedAt !== current.pausedAt
      || next.pausedDurationSeconds !== current.pausedDurationSeconds;
    if (stateChanged || elapsedCheckpoint > this.lastPersistedElapsedSecond) {
      this.lastPersistedElapsedSecond = elapsedCheckpoint;
      this.enqueue(async () => {
        await this.sessions.update(next.id, sessionUpdateFrom(next));
      });
    }
  }

  private finishSession(
    status: 'completed' | 'cancelled' | 'interrupted',
    timerState: FocusTimerState,
  ): void {
    const current = this.currentSession;
    if (!current || ['completed', 'cancelled', 'interrupted'].includes(current.status)) {
      return;
    }
    const now = this.now();
    let pausedDurationSeconds = current.pausedDurationSeconds;
    if (current.pausedAt) {
      pausedDurationSeconds += Math.max(0, now - Date.parse(current.pausedAt)) / 1_000;
    }
    const ended: Session = {
      ...current,
      status,
      pausedAt: null,
      endedAt: new Date(now).toISOString(),
      elapsedSeconds: Math.max(
        current.elapsedSeconds,
        Math.min(
          current.plannedDurationSeconds,
          timerState.status === 'idle'
            ? this.lastObservedElapsedSeconds
            : timerState.elapsedSeconds,
        ),
      ),
      pausedDurationSeconds,
    };
    this.currentSession = ended;
    this.enqueue(async () => {
      await this.sessions.update(ended.id, sessionUpdateFrom(ended));
    });
  }

  private terminalStatus(): 'completed' | 'cancelled' | 'interrupted' {
    const timerState = this.timer.getState();
    if (timerState.status === 'completed') {
      return 'completed';
    }
    if (timerState.status === 'idle') {
      return 'cancelled';
    }
    return 'interrupted';
  }

  private onAwaySnapshot(snapshot: AwayDetectionSnapshot): void {
    const session = this.currentSession;
    if (
      !session
      || (session.status !== 'running' && session.status !== 'paused')
      || snapshot.sessionId !== session.id
    ) {
      return;
    }
    for (const event of snapshot.events) {
      if (event.sessionId !== session.id) {
        continue;
      }
      const finalized = this.awayEventStates.get(event.id);
      if (finalized === undefined || (event.endedAt !== null && !finalized)) {
        this.awayEventStates.set(event.id, event.endedAt !== null);
        const persistedEvent: AwayDetectionEvent = { ...event };
        this.enqueue(() => this.events.record(persistedEvent));
      }
    }
  }

  private enqueue(operation: () => Promise<void>): void {
    this.pendingWrites = this.pendingWrites
      .then(operation)
      .catch((error: unknown) => {
        const normalized = error instanceof Error ? error : new Error('Unknown local persistence error.');
        this.onError(normalized);
      });
  }
}

function sessionUpdateFrom(session: Session): SessionUpdate {
  return {
    status: session.status,
    pausedAt: session.pausedAt,
    endedAt: session.endedAt,
    elapsedSeconds: session.elapsedSeconds,
    pausedDurationSeconds: session.pausedDurationSeconds,
  };
}
