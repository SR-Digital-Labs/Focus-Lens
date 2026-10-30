/**
 * FocusLens — Day 30: Notification & Break Settings UI Test Suite
 * ================================================================
 * Tests for the NotificationBreakSection presenter helpers and
 * integration contracts (Shavisha's Day 30 work).
 *
 * Covers:
 * 1. breakIntervalLabel — correct label for every supported interval
 * 2. isValidBreakInterval — accepts supported values, rejects invalid ones
 * 3. BREAK_INTERVAL_OPTIONS — matches the values the wellness service validates
 * 4. Settings preference persistence through WellnessReminderService
 * 5. Enabling/disabling break reminders via service.setSettings
 * 6. Invalid interval values are rejected without corrupting stored state
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BREAK_INTERVAL_OPTIONS,
  breakIntervalLabel,
  isValidBreakInterval,
  type BreakIntervalMinutes,
} from '../src/utils/breakIntervalPresentation.ts';

import {
  WELLNESS_DEFAULTS,
  WELLNESS_SETTINGS_KEY,
  WellnessReminderService,
  validateSettings,
  type WellnessClock,
  type WellnessSettings,
  type WellnessStorage,
} from '../src/services/wellnessReminder.service.ts';

import type { FocusTimerState } from '../src/types/index.ts';
import type { Unsubscribe } from '../src/services/contracts.ts';

// ---------------------------------------------------------------------------
// Minimal fakes needed to instantiate WellnessReminderService in tests
// ---------------------------------------------------------------------------

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

  constructor(timestamp = Date.now()) {
    this.timestamp = timestamp;
  }

  now(): number {
    return this.timestamp;
  }
}

class FakeTimer {
  private status: FocusTimerState['status'] = 'idle';
  private readonly listeners = new Set<(state: FocusTimerState) => void>();

  getState(): FocusTimerState {
    return {
      status: this.status,
      sessionId: null,
      durationMinutes: 25,
      totalSeconds: 1_500,
      remainingSeconds: 1_500,
      elapsedSeconds: 0,
      progress: 0,
      formattedRemaining: '25:00',
    };
  }

  subscribe(listener: (state: FocusTimerState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }
}

function makeService(): { service: WellnessReminderService; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  const service = new WellnessReminderService({
    storage,
    timer: new FakeTimer(),
    clock: new FakeClock(),
  });
  return { service, storage };
}

// ---------------------------------------------------------------------------
// breakIntervalLabel
// ---------------------------------------------------------------------------

describe('breakIntervalLabel', () => {
  it('returns a non-empty string for every supported interval', () => {
    for (const minutes of BREAK_INTERVAL_OPTIONS) {
      const label = breakIntervalLabel(minutes);
      assert.ok(
        typeof label === 'string' && label.trim().length > 0,
        `Expected non-empty label for ${minutes}, got: "${label}"`,
      );
    }
  });

  it('returns "Every 30 minutes" for 30', () => {
    assert.equal(breakIntervalLabel(30), 'Every 30 minutes');
  });

  it('returns "Every 45 minutes" for 45', () => {
    assert.equal(breakIntervalLabel(45), 'Every 45 minutes');
  });

  it('returns "Every hour" for 60', () => {
    assert.equal(breakIntervalLabel(60), 'Every hour');
  });

  it('returns "Every 90 minutes" for 90', () => {
    assert.equal(breakIntervalLabel(90), 'Every 90 minutes');
  });

  it('covers all four options in BREAK_INTERVAL_OPTIONS without repetition', () => {
    const labels = BREAK_INTERVAL_OPTIONS.map(breakIntervalLabel);
    const unique = new Set(labels);
    assert.equal(unique.size, BREAK_INTERVAL_OPTIONS.length, 'Each option must have a distinct label');
  });
});

// ---------------------------------------------------------------------------
// isValidBreakInterval
// ---------------------------------------------------------------------------

describe('isValidBreakInterval', () => {
  it('returns true for every value in BREAK_INTERVAL_OPTIONS', () => {
    for (const minutes of BREAK_INTERVAL_OPTIONS) {
      assert.equal(
        isValidBreakInterval(minutes),
        true,
        `Expected ${minutes} to be valid`,
      );
    }
  });

  it('returns false for values not in BREAK_INTERVAL_OPTIONS', () => {
    const invalid = [0, 1, 15, 20, 25, 35, 50, 75, 100, 120, 180, -1, NaN, Infinity];
    for (const value of invalid) {
      assert.equal(
        isValidBreakInterval(value),
        false,
        `Expected ${value} to be invalid`,
      );
    }
  });

  it('does not accept floating-point values that coincidentally round to a valid option', () => {
    assert.equal(isValidBreakInterval(30.0), true);   // 30.0 === 30, this is fine
    assert.equal(isValidBreakInterval(30.5), false);  // not in the set
    assert.equal(isValidBreakInterval(59.9), false);
  });
});

// ---------------------------------------------------------------------------
// BREAK_INTERVAL_OPTIONS — alignment with wellness service
// ---------------------------------------------------------------------------

describe('BREAK_INTERVAL_OPTIONS alignment with WellnessReminderService', () => {
  it('every option in BREAK_INTERVAL_OPTIONS passes validateSettings', () => {
    const base: WellnessSettings = { ...WELLNESS_DEFAULTS };
    for (const minutes of BREAK_INTERVAL_OPTIONS) {
      assert.doesNotThrow(
        () => validateSettings({ ...base, waterIntervalMinutes: minutes }),
        `validateSettings should accept waterIntervalMinutes=${minutes}`,
      );
    }
  });

  it('validateSettings rejects values not in BREAK_INTERVAL_OPTIONS', () => {
    const base: WellnessSettings = { ...WELLNESS_DEFAULTS };
    for (const bad of [1, 15, 25, 46, 61, 80, 120]) {
      assert.throws(
        () => validateSettings({ ...base, waterIntervalMinutes: bad }),
        /Water reminder interval/,
        `validateSettings should reject waterIntervalMinutes=${bad}`,
      );
    }
  });

  it('BREAK_INTERVAL_OPTIONS has exactly four entries', () => {
    assert.equal(BREAK_INTERVAL_OPTIONS.length, 4);
  });
});

// ---------------------------------------------------------------------------
// Settings persistence — break reminder enable/disable
// ---------------------------------------------------------------------------

describe('Break-reminder enable/disable through WellnessReminderService', () => {
  it('disabling waterEnabled is persisted to storage', () => {
    const { service, storage } = makeService();

    // Verify default is enabled
    assert.equal(service.getSnapshot().settings.waterEnabled, WELLNESS_DEFAULTS.waterEnabled);

    // Disable break reminders
    service.setSettings({ ...service.getSnapshot().settings, waterEnabled: false });

    const stored: WellnessSettings = JSON.parse(
      storage.getItem(WELLNESS_SETTINGS_KEY) ?? '{}',
    ) as WellnessSettings;
    assert.equal(stored.waterEnabled, false);
    assert.equal(service.getSnapshot().settings.waterEnabled, false);
  });

  it('re-enabling waterEnabled is persisted to storage', () => {
    const { service, storage } = makeService();

    service.setSettings({ ...service.getSnapshot().settings, waterEnabled: false });
    service.setSettings({ ...service.getSnapshot().settings, waterEnabled: true });

    const stored: WellnessSettings = JSON.parse(
      storage.getItem(WELLNESS_SETTINGS_KEY) ?? '{}',
    ) as WellnessSettings;
    assert.equal(stored.waterEnabled, true);
    assert.equal(service.getSnapshot().settings.waterEnabled, true);
  });

  it('disabling break reminders clears any active water reminder', () => {
    const clock = new FakeClock(new Date(2026, 5, 1, 12, 0).getTime());
    const storage = new MemoryStorage();
    const timer = new FakeTimer();
    const service = new WellnessReminderService({ storage, timer, clock });
    const stop = service.start();

    // Simulate 60 minutes of running session to trigger water reminder
    (timer as unknown as { status: FocusTimerState['status']; listeners: Set<(s: FocusTimerState) => void> }).status = 'running';
    (timer as unknown as { listeners: Set<(s: FocusTimerState) => void> }).listeners.forEach((l) =>
      l((timer as unknown as { getState(): FocusTimerState }).getState()),
    );

    clock.timestamp += 60 * 60_000;
    service.tick();
    assert.equal(service.getSnapshot().reminder?.kind, 'water');

    // Disabling reminders must clear the active water reminder
    service.setSettings({ ...service.getSnapshot().settings, waterEnabled: false });
    assert.equal(service.getSnapshot().reminder, null);

    stop();
  });
});

// ---------------------------------------------------------------------------
// Settings persistence — focus interval
// ---------------------------------------------------------------------------

describe('Focus interval persistence through WellnessReminderService', () => {
  it('changing waterIntervalMinutes to a valid option is persisted', () => {
    const { service, storage } = makeService();

    for (const minutes of BREAK_INTERVAL_OPTIONS) {
      service.setSettings({ ...service.getSnapshot().settings, waterIntervalMinutes: minutes });
      const stored: WellnessSettings = JSON.parse(
        storage.getItem(WELLNESS_SETTINGS_KEY) ?? '{}',
      ) as WellnessSettings;
      assert.equal(stored.waterIntervalMinutes, minutes);
      assert.equal(service.getSnapshot().settings.waterIntervalMinutes, minutes);
    }
  });

  it('an invalid interval is rejected by service.setSettings without corrupting state', () => {
    const { service } = makeService();
    const before = service.getSnapshot().settings.waterIntervalMinutes;

    assert.throws(
      () =>
        service.setSettings({
          ...service.getSnapshot().settings,
          waterIntervalMinutes: 17 as BreakIntervalMinutes,
        }),
      /Water reminder interval/,
    );

    // State must be unchanged
    assert.equal(service.getSnapshot().settings.waterIntervalMinutes, before);
  });

  it('settings survive a simulated service restart (re-read from storage)', () => {
    const storage = new MemoryStorage();

    const first = new WellnessReminderService({ storage, timer: new FakeTimer(), clock: new FakeClock() });
    first.setSettings({ ...first.getSnapshot().settings, waterIntervalMinutes: 45 });

    const second = new WellnessReminderService({ storage, timer: new FakeTimer(), clock: new FakeClock() });
    assert.equal(second.getSnapshot().settings.waterIntervalMinutes, 45);
  });
});

// ---------------------------------------------------------------------------
// BreakIntervalMinutes type contract
// ---------------------------------------------------------------------------

describe('BreakIntervalMinutes type contract', () => {
  it('30, 45, 60, and 90 satisfy the BreakIntervalMinutes union', () => {
    // Type-level check exercised at value level
    const values: BreakIntervalMinutes[] = [30, 45, 60, 90];
    assert.deepEqual([...values].sort((a, b) => a - b), [30, 45, 60, 90]);
  });
});
