/**
 * FocusLens — useFocusTimer Hook
 * ==============================
 * Day 16: React hook providing ergonomic access to FocusTimerService.
 * Automatically synchronizes with the timer service and handles custom duration validation.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  focusTimerService,
  validateCustomDuration,
} from '../services/focusTimer.service';
import type { FocusDurationPreset, FocusTimerState } from '../types';

export function useFocusTimer() {
  const [timerState, setTimerState] = useState<FocusTimerState>(() =>
    focusTimerService.getState()
  );
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    return focusTimerService.subscribe((nextState) => {
      setTimerState(nextState);
    });
  }, []);

  const selectPreset = useCallback((preset: FocusDurationPreset) => {
    setValidationError(null);
    setCustomMinutes('');
    return focusTimerService.setDuration(preset);
  }, []);

  const applyCustomDuration = useCallback((inputMinutes?: number) => {
    const rawValue = inputMinutes !== undefined ? inputMinutes : Number(customMinutes);
    const validation = validateCustomDuration(rawValue);

    if (!validation.valid) {
      setValidationError(validation.error ?? 'Invalid duration');
      return false;
    }

    setValidationError(null);
    const ok = focusTimerService.setDuration(rawValue);
    if (!ok) {
      setValidationError('Cannot change duration during an active session.');
      return false;
    }
    return true;
  }, [customMinutes]);

  const start = useCallback(() => {
    setValidationError(null);
    return focusTimerService.start();
  }, []);

  const pause = useCallback(() => {
    return focusTimerService.pause();
  }, []);

  const resume = useCallback(() => {
    return focusTimerService.resume();
  }, []);

  const end = useCallback(() => {
    return focusTimerService.end();
  }, []);

  const reset = useCallback(() => {
    return focusTimerService.reset();
  }, []);

  return {
    ...timerState,
    customMinutes,
    setCustomMinutes,
    validationError,
    setValidationError,
    selectPreset,
    applyCustomDuration,
    start,
    pause,
    resume,
    end,
    reset,
  };
}
