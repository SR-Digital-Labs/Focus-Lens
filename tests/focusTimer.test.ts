import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  FocusTimerService,
  formatTimerDisplay,
  validateCustomDuration,
} from '../src/services/focusTimer.service.ts';

describe('formatTimerDisplay', () => {
  it('formats under 60 minutes correctly (MM:SS)', () => {
    assert.equal(formatTimerDisplay(1500), '25:00');
    assert.equal(formatTimerDisplay(2700), '45:00');
    assert.equal(formatTimerDisplay(258), '04:18');
    assert.equal(formatTimerDisplay(5), '00:05');
    assert.equal(formatTimerDisplay(0), '00:00');
  });

  it('formats over 60 minutes correctly (H:MM:SS)', () => {
    assert.equal(formatTimerDisplay(3600), '1:00:00');
    assert.equal(formatTimerDisplay(3665), '1:01:05');
    assert.equal(formatTimerDisplay(7200), '2:00:00');
  });

  it('handles negative or invalid values safely', () => {
    assert.equal(formatTimerDisplay(-10), '00:00');
  });
});

describe('validateCustomDuration', () => {
  it('accepts valid custom durations (1–180 minutes)', () => {
    assert.equal(validateCustomDuration(1).valid, true);
    assert.equal(validateCustomDuration(25).valid, true);
    assert.equal(validateCustomDuration(90).valid, true);
    assert.equal(validateCustomDuration(180).valid, true);
  });

  it('rejects values less than 1 minute', () => {
    const res = validateCustomDuration(0);
    assert.equal(res.valid, false);
    assert.match(res.error!, /Minimum focus session is 1 minute/);

    assert.equal(validateCustomDuration(-10).valid, false);
  });

  it('rejects values greater than 180 minutes', () => {
    const res = validateCustomDuration(181);
    assert.equal(res.valid, false);
    assert.match(res.error!, /Maximum focus session is 180 minutes/);
  });

  it('rejects non-integer decimals', () => {
    const res = validateCustomDuration(25.5);
    assert.equal(res.valid, false);
    assert.match(res.error!, /whole number/);
  });

  it('rejects NaN and non-finite values', () => {
    assert.equal(validateCustomDuration(NaN).valid, false);
    assert.equal(validateCustomDuration(Infinity).valid, false);
  });
});

describe('FocusTimerService', () => {
  let timer: FocusTimerService;

  beforeEach(() => {
    timer = new FocusTimerService();
  });

  afterEach(() => {
    timer?.end();
  });

  it('initializes in idle state with 25 minutes default', () => {
    const state = timer.getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.durationMinutes, 25);
    assert.equal(state.totalSeconds, 1500);
    assert.equal(state.remainingSeconds, 1500);
    assert.equal(state.elapsedSeconds, 0);
    assert.equal(state.progress, 0);
    assert.equal(state.formattedRemaining, '25:00');
  });

  it('sets preset and custom durations when idle', () => {
    assert.equal(timer.setDuration(45), true);
    assert.equal(timer.getState().durationMinutes, 45);
    assert.equal(timer.getState().remainingSeconds, 2700);

    assert.equal(timer.setDuration(60), true);
    assert.equal(timer.getState().durationMinutes, 60);

    assert.equal(timer.setDuration(30), true);
    assert.equal(timer.getState().durationMinutes, 30);
  });

  it('rejects invalid custom durations', () => {
    assert.equal(timer.setDuration(0), false);
    assert.equal(timer.setDuration(-5), false);
    assert.equal(timer.setDuration(181), false);
    assert.equal(timer.setDuration(25.5), false);
    assert.equal(timer.getState().durationMinutes, 25); // unchanged
  });

  it('starts a session and transitions to running state', () => {
    assert.equal(timer.start(), true);
    assert.equal(timer.getStatus(), 'running');
    assert.equal(timer.getState().status, 'running');

    // Repeated start call is rejected (guards against duplicate timers)
    assert.equal(timer.start(), false);
  });

  it('does not treat start from paused as a fresh session', () => {
    timer.start();
    timer.pause();
    const remainingBeforeStart = timer.getState().remainingSeconds;

    assert.equal(timer.start(), false);
    assert.equal(timer.getStatus(), 'paused');
    assert.equal(timer.getState().remainingSeconds, remainingBeforeStart);
    assert.equal(timer.resume(), true);
  });

  it('cannot change duration while running or paused', () => {
    timer.start();
    assert.equal(timer.setDuration(45), false);
    assert.equal(timer.getState().durationMinutes, 25);

    timer.pause();
    assert.equal(timer.setDuration(45), false);
  });

  it('pauses and freezes remaining time accurately', () => {
    timer.start();
    assert.equal(timer.pause(), true);
    assert.equal(timer.getStatus(), 'paused');

    // Repeated pause is rejected
    assert.equal(timer.pause(), false);
  });

  it('resumes from paused state and continues countdown', () => {
    timer.start();
    timer.pause();
    assert.equal(timer.getStatus(), 'paused');

    assert.equal(timer.resume(), true);
    assert.equal(timer.getStatus(), 'running');

    // Repeated resume is rejected
    assert.equal(timer.resume(), false);
  });

  it('end() stops timer and returns to idle with full duration restored', () => {
    timer.start();
    timer.end();
    assert.equal(timer.getStatus(), 'idle');
    assert.equal(timer.getState().remainingSeconds, timer.getState().totalSeconds);
  });

  it('subscribers receive state notifications on changes', () => {
    const states: string[] = [];
    const unsubscribe = timer.subscribe((s) => {
      states.push(s.status);
    });

    // 1st notification is immediate upon subscription ('idle')
    timer.start(); // 'running'
    timer.pause(); // 'paused'
    timer.resume(); // 'running'
    timer.end(); // 'idle'

    unsubscribe();
    timer.start(); // should not notify after unsubscribe

    assert.deepEqual(states, ['idle', 'running', 'paused', 'running', 'idle']);
  });

  it('ticker stops at zero and never goes negative', async () => {
    // Set 1 minute (or manipulate deadline)
    timer.setDuration(1);
    timer.start();

    // Fast-forward deadline into the past to simulate reaching zero
    // @ts-expect-error accessing private property for unit test
    timer._targetDeadline = Date.now() - 5000;
    // @ts-expect-error calling private tick
    timer.tick();

    const state = timer.getState();
    assert.equal(state.status, 'completed');
    assert.equal(state.remainingSeconds, 0);
    assert.equal(state.formattedRemaining, '00:00');
    assert.equal(state.progress, 100);
  });

  it('preserves exact remaining time across pause and resume cycles', () => {
    timer.setDuration(25);
    timer.start();

    // Simulate 500 seconds remaining
    // @ts-expect-error accessing private property for unit test
    timer._targetDeadline = Date.now() + 500 * 1000;
    timer.pause();

    assert.equal(timer.getStatus(), 'paused');
    const remainingAtPause = timer.getState().remainingSeconds;
    assert.equal(remainingAtPause, 500);

    // Resuming establishes new deadline using exact remaining seconds
    timer.resume();
    assert.equal(timer.getStatus(), 'running');
    assert.equal(timer.getState().remainingSeconds, 500);

    // Pause again
    timer.pause();
    assert.equal(timer.getState().remainingSeconds, 500);
  });

  it('rapid calls do not create duplicate timers or corrupt state', () => {
    timer.start();
    assert.equal(timer.start(), false);
    assert.equal(timer.start(), false);

    timer.pause();
    assert.equal(timer.pause(), false);
    assert.equal(timer.pause(), false);

    timer.resume();
    assert.equal(timer.resume(), false);
    assert.equal(timer.resume(), false);
  });

  it('reset() returns completed timer back to idle with full duration restored', () => {
    timer.setDuration(45);
    timer.start();

    // Simulate completion
    // @ts-expect-error accessing private property for unit test
    timer._targetDeadline = Date.now() - 1000;
    // @ts-expect-error calling private tick
    timer.tick();

    assert.equal(timer.getStatus(), 'completed');
    assert.equal(timer.getState().remainingSeconds, 0);

    timer.reset();
    assert.equal(timer.getStatus(), 'idle');
    assert.equal(timer.getState().durationMinutes, 45);
    assert.equal(timer.getState().remainingSeconds, 45 * 60);
    assert.equal(timer.getState().progress, 0);
  });

  it('tick() does not update state when timer is idle or paused', () => {
    // Idle
    // @ts-expect-error calling private tick
    timer.tick();
    assert.equal(timer.getStatus(), 'idle');

    // Paused
    timer.start();
    timer.pause();
    const pausedRemaining = timer.getState().remainingSeconds;
    // @ts-expect-error calling private tick
    timer.tick();
    assert.equal(timer.getState().remainingSeconds, pausedRemaining);
  });
});

