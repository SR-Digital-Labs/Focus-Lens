import type { FocusTimerState } from '../types';
import type {
  ActivityMonitoringState,
  ActivitySignal,
  CvResponse,
  ServiceEvent,
  Unsubscribe,
} from './contracts';

type TimerSource = {
  getState(): FocusTimerState;
  subscribe(listener: (state: FocusTimerState) => void): Unsubscribe;
};
type ActivityEventSource = {
  activity: {
    subscribe(handler: (event: ServiceEvent<ActivitySignal>) => void): Promise<Unsubscribe>;
  };
  cv: {
    subscribe(handler: (event: ServiceEvent<CvResponse>) => void): Promise<Unsubscribe>;
  };
};

const UNKNOWN_SIGNAL: ActivitySignal = {
  occurredAt: '',
  personPresence: 'unknown',
  screenFacing: 'unknown',
  posture: 'unknown',
};

const INITIAL_STATE: ActivityMonitoringState = {
  sessionId: null,
  status: 'inactive',
  signal: null,
  error: null,
};

const MAX_REMEMBERED_EVENT_IDS = 256;

export class ActivitySessionMonitor {
  private readonly timer: TimerSource;
  private readonly events: ActivityEventSource;
  private readonly createSessionId: () => string;
  private readonly listeners = new Set<(state: ActivityMonitoringState) => void>();
  private readonly seenEventIds = new Set<string>();
  private state: ActivityMonitoringState = INITIAL_STATE;
  private timerStatus: FocusTimerState['status'] | null = null;
  private sessionStartedAt = 0;
  private latestSignalAt = 0;
  private unsubscribeTimer: Unsubscribe | null = null;
  private unsubscribeActivity: Unsubscribe | null = null;
  private unsubscribeCv: Unsubscribe | null = null;
  private disposed = false;

  constructor(
    events: ActivityEventSource,
    timer: TimerSource,
    createSessionId: () => string = () => crypto.randomUUID(),
  ) {
    this.timer = timer;
    this.events = events;
    this.createSessionId = createSessionId;
  }

  subscribe(listener: (state: ActivityMonitoringState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  start(): Unsubscribe {
    if (this.unsubscribeTimer || this.disposed) {
      return () => this.stop();
    }

    this.unsubscribeTimer = this.timer.subscribe((state) => this.onTimerState(state));
    void this.subscribeToActivity();
    void this.subscribeToCv();
    return () => this.stop();
  }

  stop(): void {
    this.disposed = true;
    this.unsubscribeTimer?.();
    this.unsubscribeActivity?.();
    this.unsubscribeCv?.();
    this.unsubscribeTimer = null;
    this.unsubscribeActivity = null;
    this.unsubscribeCv = null;
    this.listeners.clear();
  }

  private async subscribeToActivity(): Promise<void> {
    try {
      const unsubscribe = await this.events.activity.subscribe((event) => {
        this.onActivityEvent(event);
      });
      if (this.disposed) {
        unsubscribe();
      } else {
        this.unsubscribeActivity = unsubscribe;
      }
    } catch (error) {
      console.error('Unable to subscribe to CV activity signals:', error);
      if (!this.disposed) {
        this.updateState({
          status: 'error',
          signal: null,
          error: error instanceof Error ? error.message : 'CV activity subscription failed.',
        });
      }
    }
  }

  private async subscribeToCv(): Promise<void> {
    try {
      const unsubscribe = await this.events.cv.subscribe((event) => {
        this.onCvEvent(event);
      });
      if (this.disposed) {
        unsubscribe();
      } else {
        this.unsubscribeCv = unsubscribe;
      }
    } catch (error) {
      console.error('Unable to subscribe to CV service status:', error);
      if (!this.disposed) {
        this.updateState({
          status: 'error',
          signal: null,
          error: error instanceof Error ? error.message : 'CV service status subscription failed.',
        });
      }
    }
  }

  private onTimerState(state: FocusTimerState): void {
    const previousStatus = this.timerStatus;
    this.timerStatus = state.status;

    if (state.status === 'running') {
      if (previousStatus !== 'paused' || !this.state.sessionId) {
        this.beginSession();
      } else {
        this.sessionStartedAt = Date.now();
        this.latestSignalAt = 0;
        this.updateState({
          status: 'waiting',
          signal: null,
          error: null,
        });
      }
      return;
    }

    if (state.status === 'paused') {
      this.updateState({
        status: 'paused',
        signal: null,
        error: null,
      });
      return;
    }

    this.sessionStartedAt = 0;
    this.latestSignalAt = 0;
    this.seenEventIds.clear();
    this.updateState(INITIAL_STATE);
  }

  private beginSession(): void {
    this.sessionStartedAt = Date.now();
    this.latestSignalAt = 0;
    this.seenEventIds.clear();
    this.updateState({
      sessionId: this.createSessionId(),
      status: 'waiting',
      signal: null,
      error: null,
    });
  }

  private onActivityEvent(event: ServiceEvent<ActivitySignal>): void {
    if (this.timerStatus !== 'running' || !this.state.sessionId) {
      return;
    }
    if (!event || typeof event.eventId !== 'string' || !event.eventId.trim()) {
      return;
    }
    if (this.seenEventIds.has(event.eventId)) {
      return;
    }
    if (event.sessionId !== undefined && event.sessionId !== this.state.sessionId) {
      return;
    }

    const signal = normalizeActivitySignal(event.payload);
    if (!signal) {
      return;
    }

    const eventOccurredAt = Date.parse(event.occurredAt);
    const occurredAt = Date.parse(signal.occurredAt);
    if (
      !Number.isFinite(eventOccurredAt)
      ||
      !Number.isFinite(occurredAt)
      || eventOccurredAt < this.sessionStartedAt
      || occurredAt < this.sessionStartedAt
      || occurredAt <= this.latestSignalAt
    ) {
      return;
    }

    this.rememberEventId(event.eventId);
    this.latestSignalAt = occurredAt;
    this.updateState({
      status: 'active',
      signal,
      error: null,
    });
  }

  private onCvEvent(event: ServiceEvent<CvResponse>): void {
    if (!event || typeof event !== 'object' || !event.payload) {
      return;
    }
    if (this.timerStatus !== 'running' || !this.state.sessionId) {
      return;
    }
    if (event.sessionId !== undefined && event.sessionId !== this.state.sessionId) {
      return;
    }
    if (typeof event.eventId !== 'string' || !event.eventId.trim()) {
      return;
    }
    if (this.seenEventIds.has(event.eventId)) {
      return;
    }
    const occurredAt = Date.parse(event.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt < this.sessionStartedAt) {
      return;
    }

    if (event.payload?.status === 'unavailable' || event.payload?.status === 'failed') {
      this.rememberEventId(event.eventId);
      this.updateState({
        status: 'unavailable',
        signal: {
          ...UNKNOWN_SIGNAL,
          occurredAt: event.occurredAt,
        },
        error: event.payload.error?.message ?? 'Computer-vision service is unavailable.',
      });
    } else if (event.payload?.status === 'completed' && this.state.status === 'unavailable') {
      this.rememberEventId(event.eventId);
      this.updateState({
        status: 'waiting',
        signal: null,
        error: null,
      });
    }
  }

  private rememberEventId(eventId: string): void {
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > MAX_REMEMBERED_EVENT_IDS) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest !== undefined) {
        this.seenEventIds.delete(oldest);
      }
    }
  }

  private updateState(
    update: ActivityMonitoringState | Partial<ActivityMonitoringState>,
  ): void {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

function normalizeActivitySignal(value: unknown): ActivitySignal | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const signal = value as Record<string, unknown>;
  const occurredAt = normalizeTimestamp(signal.occurredAt ?? signal.timestamp);
  const personPresence = normalizePersonState(signal.personPresence ?? signal.person_presence);
  const screenFacing = normalizeFacingState(signal.screenFacing ?? signal.screen_facing);
  const posture = normalizePostureState(signal.posture);
  if (!occurredAt || !personPresence || !screenFacing || !posture) {
    return null;
  }

  const confidence = signal.confidence;
  const normalizedConfidence =
    typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
      ? confidence
      : undefined;

  const postureReminder = signal.postureReminder ?? signal.posture_reminder;
  return {
    occurredAt,
    personPresence,
    screenFacing,
    posture,
    ...(normalizedConfidence === undefined ? {} : { confidence: normalizedConfidence }),
    ...(typeof postureReminder === 'boolean' ? { postureReminder } : {}),
  };
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) < 1_000_000_000_000 ? value * 1_000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }
  return null;
}

function normalizePersonState(value: unknown): ActivitySignal['personPresence'] | null {
  switch (value) {
    case 'present':
    case 'PRESENT':
      return 'present';
    case 'away':
    case 'AWAY':
      return 'away';
    case 'unknown':
    case 'UNKNOWN':
      return 'unknown';
    default:
      return null;
  }
}

function normalizeFacingState(value: unknown): ActivitySignal['screenFacing'] | null {
  switch (value) {
    case 'facing':
    case 'SCREEN_FACING':
      return 'facing';
    case 'looking_away':
    case 'LOOKING_AWAY':
      return 'looking_away';
    case 'unknown':
    case 'UNKNOWN':
      return 'unknown';
    default:
      return null;
  }
}

function normalizePostureState(value: unknown): ActivitySignal['posture'] | null {
  switch (value) {
    case 'good':
    case 'GOOD':
    case 'GOOD_POSTURE':
      return 'good';
    case 'slouched':
    case 'SLOUCHED':
    case 'SLOUCHED_POSTURE':
      return 'slouched';
    case 'unknown':
    case 'UNKNOWN':
      return 'unknown';
    default:
      return null;
  }
}
