import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { FocusTimerState } from '../src/types/index.ts';
import type { Unsubscribe } from '../src/services/contracts.ts';
import {
  WELLNESS_DEFAULTS,
  WELLNESS_SETTINGS_KEY,
  WELLNESS_STATE_KEY,
  WellnessReminderService,
  type WellnessClock,
  type WellnessSettings,
  type WellnessStorage,
} from '../src/services/wellnessReminder.service.ts';

class MemoryStorage implements WellnessStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeClock implements WellnessClock {
  timestamp: number;

  constructor(timestamp: number) {
    this.timestamp = timestamp;
  }

  now(): number {
    return this.timestamp;
  }

  advance(milliseconds: number): void {
    this.timestamp += milliseconds;
  }
}

class FakeTimer {
  private status: FocusTimerState['status'] = 'idle';
  private readonly listeners = new Set<(state: FocusTimerState) => void>();

  getState(): FocusTimerState {
    return {
      status: this.status,
      durationMinutes: 25,
      totalSeconds: 1_500,
      remainingSeconds: 1_500,
      elapsedSeconds: 0,
      progress: 0,
      formattedRemaining: '25:00',
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  subscribe(listener: (state: FocusTimerState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  setStatus(status: FocusTimerState['status']): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(this.getState()));
  }
}

function setup(date: Date = new Date(2026, 5, 1, 12, 0)) {
  const clock = new FakeClock(date.getTime());
  const storage = new MemoryStorage();
  const timer = new FakeTimer();
  const service = new WellnessReminderService({ storage, timer, clock });
  const stop = service.start();
  return { clock, storage, timer, service, stop };
}

function updateSettings(
  service: WellnessReminderService,
  changes: Partial<WellnessSettings>,
): void {
  service.setSettings({ ...service.getSnapshot().settings, ...changes });
}

describe('WellnessReminderService', () => {
  it('loads configurable defaults and persists settings locally', () => {
    const { storage, service, stop } = setup();
    assert.deepEqual(service.getSnapshot().settings, WELLNESS_DEFAULTS);

    updateSettings(service, { waterIntervalMinutes: 45, snoozeMinutes: 10 });

    assert.deepEqual(JSON.parse(storage.getItem(WELLNESS_SETTINGS_KEY) ?? '{}'), {
      ...WELLNESS_DEFAULTS,
      waterIntervalMinutes: 45,
      snoozeMinutes: 10,
    });
    stop();
  });

  it('reminds after the configured running-session interval and pauses accrual', () => {
    const { clock, timer, service, stop } = setup();
    updateSettings(service, { waterIntervalMinutes: 30 });
    timer.setStatus('running');
    clock.advance(29 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder, null);

    timer.setStatus('paused');
    clock.advance(45 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder, null);

    timer.setStatus('running');
    clock.advance(60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder?.kind, 'water');
    stop();
  });

  it('uses an updated interval for future water reminders', () => {
    const { clock, timer, service, stop } = setup();
    updateSettings(service, { waterIntervalMinutes: 30 });
    timer.setStatus('running');
    clock.advance(20 * 60_000);
    service.tick();
    updateSettings(service, { waterIntervalMinutes: 45 });

    clock.advance(24 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder, null);
    clock.advance(60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder?.kind, 'water');
    stop();
  });

  it('records water completion and starts a fresh interval', () => {
    const { clock, timer, storage, service, stop } = setup();
    timer.setStatus('running');
    clock.advance(60 * 60_000);
    service.tick();
    const completedAt = new Date(clock.now()).toISOString();

    service.respondToReminder('done');

    assert.equal(service.getSnapshot().reminder, null);
    assert.equal(JSON.parse(storage.getItem(WELLNESS_STATE_KEY) ?? '{}').waterCompletedAt, completedAt);
    clock.advance(59 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder, null);
    clock.advance(60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder?.kind, 'water');
    stop();
  });

  it('snoozes a water reminder using focus-active time only', () => {
    const { clock, timer, service, stop } = setup();
    timer.setStatus('running');
    clock.advance(60 * 60_000);
    service.tick();
    service.respondToReminder('snooze');
    assert.equal(service.getSnapshot().reminder, null);

    clock.advance(14 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder, null);
    timer.setStatus('paused');
    clock.advance(20 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder, null);
    timer.setStatus('running');
    clock.advance(60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder?.kind, 'water');
    stop();
  });

  it('does not trigger disabled reminders', () => {
    const { clock, timer, service, stop } = setup();
    updateSettings(service, { waterEnabled: false, sleepEnabled: false });
    timer.setStatus('running');
    clock.advance(24 * 60 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder, null);
    stop();
  });

  it('triggers once at the configured local sleep time and resets on the next day', () => {
    const { clock, service, stop } = setup(new Date(2026, 5, 1, 21, 59));
    updateSettings(service, { sleepTime: '22:00' });
    clock.advance(60_000);
    service.tick();
    const reminderId = service.getSnapshot().reminder?.id;
    assert.equal(service.getSnapshot().reminder?.kind, 'sleep');

    clock.advance(5_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder?.id, reminderId);

    service.respondToReminder('dismiss');
    assert.equal(service.getSnapshot().reminder, null);
    clock.advance(24 * 60 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder?.kind, 'sleep');
    stop();
  });

  it('handles startup after sleep time and persists the pending reminder across restart', () => {
    const clock = new FakeClock(new Date(2026, 5, 1, 23, 0).getTime());
    const storage = new MemoryStorage();
    const firstService = new WellnessReminderService({
      storage,
      timer: new FakeTimer(),
      clock,
    });
    const stopFirst = firstService.start();
    const reminderId = firstService.getSnapshot().reminder?.id;
    stopFirst();

    const secondService = new WellnessReminderService({
      storage,
      timer: new FakeTimer(),
      clock,
    });
    const stopSecond = secondService.start();

    assert.equal(secondService.getSnapshot().reminder?.kind, 'sleep');
    assert.equal(secondService.getSnapshot().reminder?.id, reminderId);
    stopSecond();
  });

  it('persists completed water time and accumulated focus time across app restarts', () => {
    const clock = new FakeClock(new Date(2026, 5, 1, 12, 0).getTime());
    const storage = new MemoryStorage();
    const firstTimer = new FakeTimer();
    const firstService = new WellnessReminderService({
      storage,
      timer: firstTimer,
      clock,
    });
    const stopFirst = firstService.start();
    firstTimer.setStatus('running');
    clock.advance(20 * 60_000);
    firstService.tick();
    stopFirst();

    const secondTimer = new FakeTimer();
    const secondService = new WellnessReminderService({
      storage,
      timer: secondTimer,
      clock,
    });
    const stopSecond = secondService.start();
    secondTimer.setStatus('running');
    clock.advance(39 * 60_000);
    secondService.tick();
    assert.equal(secondService.getSnapshot().reminder, null);
    clock.advance(60_000);
    secondService.tick();
    assert.equal(secondService.getSnapshot().reminder?.kind, 'water');
    stopSecond();
  });

  it('does not let a sleep snooze crossing midnight fire at an unintended time', () => {
    const { clock, service, stop } = setup(new Date(2026, 5, 1, 22, 0));
    service.tick();
    service.respondToReminder('snooze');
    clock.advance(2 * 60 * 60_000);
    service.tick();

    assert.equal(service.getSnapshot().reminder, null);
    clock.advance(22 * 60 * 60_000);
    service.tick();
    assert.equal(service.getSnapshot().reminder?.kind, 'sleep');
    stop();
  });

  it('clears a reminder when disabled and does not create duplicate active reminders', () => {
    const { clock, timer, service, stop } = setup();
    timer.setStatus('running');
    clock.advance(60 * 60_000);
    service.tick();
    const reminderId = service.getSnapshot().reminder?.id;
    service.tick();
    assert.equal(service.getSnapshot().reminder?.id, reminderId);

    updateSettings(service, { waterEnabled: false });
    assert.equal(service.getSnapshot().reminder, null);
    stop();
  });

  it('cleans up the focus-timer subscription when the reminder host stops', () => {
    const { timer, stop } = setup();
    assert.equal(timer.listenerCount, 1);

    stop();

    assert.equal(timer.listenerCount, 0);
  });

  it('rejects invalid reminder settings instead of silently storing them', () => {
    const { service, stop } = setup();
    assert.throws(
      () => updateSettings(service, { waterIntervalMinutes: 17 }),
      /Water reminder interval must be 30, 45, 60, or 90 minutes/,
    );
    assert.throws(
      () => updateSettings(service, { sleepTime: '25:90' }),
      /Sleep reminder time must use 24-hour HH:MM format/,
    );
    stop();
  });
});
