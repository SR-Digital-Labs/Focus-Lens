import type { FocusTimerState } from '../types';
import type { Unsubscribe } from './contracts';
import { focusTimerService } from './focusTimer.service.ts';

export type WellnessReminderKind = 'water' | 'sleep';
export type WellnessReminderAction = 'done' | 'snooze' | 'dismiss';

export interface WellnessSettings {
  waterEnabled: boolean;
  waterIntervalMinutes: number;
  sleepEnabled: boolean;
  sleepTime: string;
  snoozeMinutes: number;
}

export interface WellnessReminder {
  id: string;
  kind: WellnessReminderKind;
  triggeredAt: string;
}

export interface WellnessReminderSnapshot {
  settings: WellnessSettings;
  reminder: WellnessReminder | null;
}

export interface WellnessStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WellnessClock {
  now(): number;
}

interface PersistedReminderState {
  waterElapsedSeconds: number;
  waterSnoozeRemainingSeconds: number;
  waterCompletedAt: string | null;
  sleepDismissedDate: string | null;
  sleepSnoozedUntil: string | null;
  sleepSnoozedDate: string | null;
  reminder: WellnessReminder | null;
}

interface WellnessReminderOptions {
  storage: WellnessStorage;
  timer: Pick<typeof focusTimerService, 'getState' | 'subscribe'>;
  clock?: WellnessClock;
}

const SETTINGS_KEY = 'focuslens.wellness.settings.v1';
const STATE_KEY = 'focuslens.wellness.state.v1';
const DEFAULT_SETTINGS: WellnessSettings = {
  waterEnabled: true,
  waterIntervalMinutes: 60,
  sleepEnabled: true,
  sleepTime: '22:00',
  snoozeMinutes: 15,
};

const DEFAULT_PERSISTED_STATE: PersistedReminderState = {
  waterElapsedSeconds: 0,
  waterSnoozeRemainingSeconds: 0,
  waterCompletedAt: null,
  sleepDismissedDate: null,
  sleepSnoozedUntil: null,
  sleepSnoozedDate: null,
  reminder: null,
};

const WATER_INTERVAL_OPTIONS = [30, 45, 60, 90] as const;

export class WellnessReminderService {
  private readonly storage: WellnessStorage;
  private readonly timer: Pick<typeof focusTimerService, 'getState' | 'subscribe'>;
  private readonly clock: WellnessClock;
  private readonly listeners = new Set<(snapshot: WellnessReminderSnapshot) => void>();
  private settings: WellnessSettings;
  private persistedState: PersistedReminderState;
  private timerStatus: FocusTimerState['status'] = 'idle';
  private lastTickAt: number | null = null;
  private unsubscribeTimer: Unsubscribe | null = null;
  private started = false;

  constructor({ storage, timer, clock = Date }: WellnessReminderOptions) {
    this.storage = storage;
    this.timer = timer;
    this.clock = clock;
    this.settings = this.readSettings();
    this.persistedState = this.readPersistedState();
  }

  getSnapshot(): WellnessReminderSnapshot {
    return {
      settings: { ...this.settings },
      reminder: this.persistedState.reminder
        ? { ...this.persistedState.reminder }
        : null,
    };
  }

  subscribe(listener: (snapshot: WellnessReminderSnapshot) => void): Unsubscribe {
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
    this.lastTickAt = this.clock.now();
    this.unsubscribeTimer = this.timer.subscribe((state) => this.onTimerState(state));
    this.tick();
    return () => this.stop();
  }

  stop(): void {
    this.unsubscribeTimer?.();
    this.unsubscribeTimer = null;
    this.started = false;
    this.lastTickAt = null;
  }

  setSettings(settings: WellnessSettings): void {
    validateSettings(settings);
    const previousSettings = this.settings;
    const previousState = this.persistedState;
    this.settings = { ...settings };
    this.persistedState = { ...previousState };

    if (!settings.waterEnabled && this.persistedState.reminder?.kind === 'water') {
      this.persistedState.reminder = null;
      this.persistedState.waterSnoozeRemainingSeconds = 0;
    }
    if (!settings.sleepEnabled && this.persistedState.reminder?.kind === 'sleep') {
      this.persistedState.reminder = null;
      this.persistedState.sleepSnoozedUntil = null;
      this.persistedState.sleepSnoozedDate = null;
    }

    try {
      this.persistSettings();
      this.persistState();
    } catch (error) {
      this.settings = previousSettings;
      this.persistedState = previousState;
      throw error;
    }
    this.emit();
    if (this.started) {
      this.tick();
    }
  }

  tick(now = this.clock.now()): void {
    if (!Number.isFinite(now)) {
      throw new Error('Wellness reminder clock must return a finite timestamp.');
    }

    const previousTick = this.lastTickAt;
    this.lastTickAt = now;
    const elapsedSeconds =
      this.timerStatus === 'running' && previousTick !== null
        ? Math.max(0, (now - previousTick) / 1_000)
        : 0;

    if (this.settings.waterEnabled && this.timerStatus === 'running') {
      this.advanceWaterReminder(elapsedSeconds);
    }
    this.advanceSleepReminder(now);
  }

  respondToReminder(action: WellnessReminderAction, now = this.clock.now()): void {
    const reminder = this.persistedState.reminder;
    if (!reminder) {
      return;
    }

    if (action === 'snooze') {
      if (reminder.kind === 'water') {
        this.persistedState.waterSnoozeRemainingSeconds = this.settings.snoozeMinutes * 60;
      } else {
        const today = localDateKey(now);
        this.persistedState.sleepSnoozedDate = today;
        this.persistedState.sleepSnoozedUntil = new Date(
          now + this.settings.snoozeMinutes * 60_000,
        ).toISOString();
      }
      this.persistedState.reminder = null;
    } else if (reminder.kind === 'water') {
      if (action === 'done') {
        this.persistedState.waterCompletedAt = new Date(now).toISOString();
      }
      this.persistedState.waterElapsedSeconds = 0;
      this.persistedState.waterSnoozeRemainingSeconds = 0;
      this.persistedState.reminder = null;
    } else {
      this.persistedState.sleepDismissedDate = localDateKey(now);
      this.persistedState.sleepSnoozedDate = null;
      this.persistedState.sleepSnoozedUntil = null;
      this.persistedState.reminder = null;
    }

    this.persistState();
    this.emit();
  }

  private onTimerState(state: FocusTimerState): void {
    if (this.timerStatus === 'running' && state.status === 'paused') {
      this.tick();
    }
    this.timerStatus = state.status;
    this.lastTickAt = this.clock.now();
  }

  private advanceWaterReminder(elapsedSeconds: number): void {
    if (this.persistedState.reminder?.kind === 'water') {
      return;
    }

    if (this.persistedState.waterSnoozeRemainingSeconds > 0) {
      this.persistedState.waterSnoozeRemainingSeconds = Math.max(
        0,
        this.persistedState.waterSnoozeRemainingSeconds - elapsedSeconds,
      );
      if (this.persistedState.waterSnoozeRemainingSeconds > 0) {
        this.persistState();
        return;
      }
      this.showReminder('water');
      return;
    }

    this.persistedState.waterElapsedSeconds += elapsedSeconds;
    this.persistState();
    if (
      this.persistedState.waterElapsedSeconds >= this.settings.waterIntervalMinutes * 60
    ) {
      this.showReminder('water');
    }
  }

  private advanceSleepReminder(now: number): void {
    const today = localDateKey(now);
    const reminder = this.persistedState.reminder;

    if (reminder?.kind === 'sleep' && localDateKey(Date.parse(reminder.triggeredAt)) !== today) {
      this.persistedState.reminder = null;
      this.persistedState.sleepSnoozedUntil = null;
      this.persistedState.sleepSnoozedDate = null;
    }
    if (this.persistedState.sleepSnoozedDate !== today) {
      this.persistedState.sleepSnoozedUntil = null;
      this.persistedState.sleepSnoozedDate = null;
    }

    if (
      !this.settings.sleepEnabled
      || this.persistedState.reminder?.kind === 'sleep'
      || this.persistedState.sleepDismissedDate === today
      || !hasReachedLocalTime(now, this.settings.sleepTime)
      || this.isSleepSnoozed(now, today)
    ) {
      this.persistState();
      return;
    }
    this.showReminder('sleep', now);
  }

  private isSleepSnoozed(now: number, today: string): boolean {
    if (
      !this.persistedState.sleepSnoozedUntil
      || this.persistedState.sleepSnoozedDate !== today
    ) {
      return false;
    }
    const snoozedUntil = Date.parse(this.persistedState.sleepSnoozedUntil);
    if (!Number.isFinite(snoozedUntil) || now >= snoozedUntil) {
      this.persistedState.sleepSnoozedUntil = null;
      this.persistedState.sleepSnoozedDate = null;
      return false;
    }
    return true;
  }

  private showReminder(kind: WellnessReminderKind, now = this.clock.now()): void {
    const activeReminder = this.persistedState.reminder;
    if (activeReminder?.kind === 'sleep' && kind === 'water') {
      return;
    }
    if (activeReminder?.kind === kind) {
      return;
    }

    this.persistedState.reminder = {
      id: createReminderId(),
      kind,
      triggeredAt: new Date(now).toISOString(),
    };
    this.persistState();
    this.emit();
  }

  private readSettings(): WellnessSettings {
    try {
      const stored = this.storage.getItem(SETTINGS_KEY);
      if (!stored) {
        return { ...DEFAULT_SETTINGS };
      }
      const parsed: unknown = JSON.parse(stored);
      if (!isWellnessSettings(parsed)) {
        throw new Error('Stored wellness preferences have an invalid shape.');
      }
      validateSettings(parsed);
      return parsed;
    } catch (error) {
      console.error('Unable to load wellness preferences; using safe defaults.', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  private readPersistedState(): PersistedReminderState {
    try {
      const stored = this.storage.getItem(STATE_KEY);
      if (!stored) {
        return { ...DEFAULT_PERSISTED_STATE };
      }
      const parsed: unknown = JSON.parse(stored);
      if (!isPersistedReminderState(parsed)) {
        throw new Error('Stored wellness reminder state has an invalid shape.');
      }
      return parsed;
    } catch (error) {
      console.error('Unable to load wellness reminder state; starting with empty reminder state.', error);
      return { ...DEFAULT_PERSISTED_STATE };
    }
  }

  private persistSettings(): void {
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Unable to save wellness preferences.', error);
      throw error;
    }
  }

  private persistState(): void {
    try {
      this.storage.setItem(STATE_KEY, JSON.stringify(this.persistedState));
    } catch (error) {
      console.error('Unable to save wellness reminder state.', error);
      throw error;
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function validateSettings(settings: WellnessSettings): void {
  if (typeof settings.waterEnabled !== 'boolean' || typeof settings.sleepEnabled !== 'boolean') {
    throw new Error('Wellness reminder enablement settings must be boolean values.');
  }
  if (!WATER_INTERVAL_OPTIONS.some((interval) => interval === settings.waterIntervalMinutes)) {
    throw new Error('Water reminder interval must be 30, 45, 60, or 90 minutes.');
  }
  if (typeof settings.sleepTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.sleepTime)) {
    throw new Error('Sleep reminder time must use 24-hour HH:MM format.');
  }
  if (!Number.isInteger(settings.snoozeMinutes) || settings.snoozeMinutes < 5 || settings.snoozeMinutes > 60) {
    throw new Error('Reminder snooze duration must be between 5 and 60 minutes.');
  }
}

function hasReachedLocalTime(now: number, time: string): boolean {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(now);
  return date.getHours() * 60 + date.getMinutes() >= hours * 60 + minutes;
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createReminderId(): string {
  return crypto.randomUUID();
}

function isWellnessSettings(value: unknown): value is WellnessSettings {
  return (
    typeof value === 'object'
    && value !== null
    && 'waterEnabled' in value
    && 'waterIntervalMinutes' in value
    && 'sleepEnabled' in value
    && 'sleepTime' in value
    && 'snoozeMinutes' in value
  );
}

function isPersistedReminderState(value: unknown): value is PersistedReminderState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const state = value as Record<string, unknown>;
  if (
    typeof state.waterElapsedSeconds !== 'number'
    || !Number.isFinite(state.waterElapsedSeconds)
    || state.waterElapsedSeconds < 0
    || typeof state.waterSnoozeRemainingSeconds !== 'number'
    || !Number.isFinite(state.waterSnoozeRemainingSeconds)
    || state.waterSnoozeRemainingSeconds < 0
  ) {
    return false;
  }
  return (
    (state.reminder === null || isWellnessReminder(state.reminder))
    && (state.waterCompletedAt === null || isValidTimestamp(state.waterCompletedAt))
    && (state.sleepDismissedDate === null || isValidLocalDateKey(state.sleepDismissedDate))
    && (state.sleepSnoozedUntil === null || isValidTimestamp(state.sleepSnoozedUntil))
    && (state.sleepSnoozedDate === null || isValidLocalDateKey(state.sleepSnoozedDate))
  );
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isValidLocalDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isWellnessReminder(value: unknown): value is WellnessReminder {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const reminder = value as Record<string, unknown>;
  return (
    typeof reminder.id === 'string'
    && (reminder.kind === 'water' || reminder.kind === 'sleep')
    && typeof reminder.triggeredAt === 'string'
    && Number.isFinite(Date.parse(reminder.triggeredAt))
  );
}

export const WELLNESS_DEFAULTS = DEFAULT_SETTINGS;
export const WELLNESS_SETTINGS_KEY = SETTINGS_KEY;
export const WELLNESS_STATE_KEY = STATE_KEY;

let sharedService: WellnessReminderService | null = null;

export function getWellnessReminderService(): WellnessReminderService {
  if (!sharedService) {
    sharedService = new WellnessReminderService({
      storage: window.localStorage,
      timer: focusTimerService,
    });
  }
  return sharedService;
}
