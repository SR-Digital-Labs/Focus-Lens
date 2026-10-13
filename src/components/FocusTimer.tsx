/**
 * FocusLens — FocusTimer Component
 * ================================
 * Day 16: Primary Focus Session countdown timer and controls UI.
 * Integrates with useFocusTimer hook for reliable deadline-based timekeeping.
 */

import React, { useState } from 'react';
import { Play, Pause, Square, RotateCcw, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { useFocusTimer } from '../hooks/useFocusTimer';
import { PRESET_DURATIONS, type FocusDurationPreset } from '../types';

export const FocusTimer: React.FC = () => {
  const {
    status,
    durationMinutes,
    remainingSeconds,
    elapsedSeconds,
    progress,
    formattedRemaining,
    customMinutes,
    setCustomMinutes,
    validationError,
    selectPreset,
    applyCustomDuration,
    start,
    pause,
    resume,
    end,
    reset,
  } = useFocusTimer();

  const [isCustomSelected, setIsCustomSelected] = useState(
    !PRESET_DURATIONS.includes(durationMinutes as FocusDurationPreset)
  );

  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isIdle = status === 'idle';
  const isConfigurable = isIdle || isCompleted;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyCustomDuration();
  };

  const handlePresetClick = (preset: FocusDurationPreset) => {
    if (!isConfigurable) return;
    setIsCustomSelected(false);
    selectPreset(preset);
  };

  const handleCustomToggle = () => {
    if (!isConfigurable) return;
    setIsCustomSelected(true);
    if (customMinutes) {
      applyCustomDuration();
    }
  };

  return (
    <div className="card focus-timer-card" aria-label="Focus session timer">
      {/* Status Badge */}
      <div className="timer-status-bar">
        {isRunning && (
          <span className="timer-badge running" role="status" aria-live="polite">
            <span className="pulsing-dot" aria-hidden="true" />
            Focus Session Running
          </span>
        )}
        {isPaused && (
          <span className="timer-badge paused" role="status" aria-live="polite">
            <span className="paused-dot" aria-hidden="true" />
            Session Paused
          </span>
        )}
        {isCompleted && (
          <span className="timer-badge completed" role="status" aria-live="polite">
            <CheckCircle2 size={16} />
            Session Completed! Great Focus Work.
          </span>
        )}
        {isIdle && (
          <span className="timer-badge idle" role="status">
            <Clock size={16} />
            Session Ready
          </span>
        )}
      </div>

      {/* Main Countdown Display */}
      <div className="timer-display-container">
        <div
          className={`timer-digital-display ${status}`}
          role="timer"
          aria-label={`Time remaining: ${formattedRemaining}`}
        >
          {formattedRemaining}
        </div>

        {/* Progress Bar */}
        <div
          className="timer-progress-track"
          role="progressbar"
          aria-label="Session elapsed progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className={`timer-progress-fill ${status}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time summary stats */}
        <div className="timer-metrics-row">
          <span>
            Planned: <strong>{durationMinutes}m</strong>
          </span>
          <span>
            Elapsed:{' '}
            <strong>
              {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
            </strong>
          </span>
          <span>
            Remaining:{' '}
            <strong>
              {Math.floor(remainingSeconds / 60)}m {remainingSeconds % 60}s
            </strong>
          </span>
        </div>
      </div>

      {/* Duration Selection (Available when not actively running/paused) */}
      {isConfigurable && (
        <div className="timer-duration-selection">
          <div className="duration-label">Select Session Duration:</div>
          <div className="duration-presets" role="group" aria-label="Session duration options">
            {PRESET_DURATIONS.map((preset) => {
              const isSelected = !isCustomSelected && durationMinutes === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`btn-preset ${isSelected ? 'active' : ''}`}
                  onClick={() => handlePresetClick(preset)}
                  aria-pressed={isSelected}
                >
                  {preset} min
                </button>
              );
            })}
            <button
              type="button"
              className={`btn-preset ${isCustomSelected ? 'active' : ''}`}
              onClick={handleCustomToggle}
              aria-pressed={isCustomSelected}
            >
              Custom
            </button>
          </div>

          {/* Custom Duration Input Form */}
          {isCustomSelected && (
            <form className="custom-duration-form" onSubmit={handleCustomSubmit}>
              <div className="custom-input-group">
                <input
                  type="number"
                  min="1"
                  max="180"
                  step="1"
                  placeholder="Minutes (1–180)"
                  className={`custom-duration-input ${validationError ? 'error' : ''}`}
                  value={customMinutes}
                  onChange={(e) => {
                    setCustomMinutes(e.target.value);
                    if (e.target.value) {
                      applyCustomDuration(Number(e.target.value));
                    }
                  }}
                  aria-label="Custom duration in minutes"
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? 'custom-duration-error' : undefined}
                />
                <button type="submit" className="btn btn-secondary btn-apply">
                  Set Duration
                </button>
              </div>
              {validationError && (
                <div id="custom-duration-error" className="duration-error-text" role="alert">
                  {validationError}
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* Timer Controls */}
      <div className="timer-controls">
        {isIdle && (
          <button
            type="button"
            className="btn btn-primary btn-timer-primary"
            onClick={start}
            disabled={!!validationError}
          >
            <Play size={20} />
            Start Focus Session
          </button>
        )}

        {isRunning && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-timer-action"
              onClick={pause}
              aria-label="Pause timer"
            >
              <Pause size={18} />
              Pause
            </button>
            <button
              type="button"
              className="btn btn-danger btn-timer-action"
              onClick={end}
              aria-label="End session"
            >
              <Square size={18} />
              End Session
            </button>
          </>
        )}

        {isPaused && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-timer-action"
              onClick={resume}
              aria-label="Resume timer"
            >
              <Play size={18} />
              Resume
            </button>
            <button
              type="button"
              className="btn btn-danger btn-timer-action"
              onClick={end}
              aria-label="End session"
            >
              <Square size={18} />
              End Session
            </button>
          </>
        )}

        {isCompleted && (
          <div className="completed-controls">
            <button
              type="button"
              className="btn btn-primary btn-timer-primary"
              onClick={reset}
            >
              <RotateCcw size={18} />
              Start New Session
            </button>
          </div>
        )}
      </div>

      {/* Quiet helper note */}
      <p className="timer-privacy-note">
        <Sparkles size={14} aria-hidden="true" />
        Timekeeping runs strictly on your machine. Sessions can be paused or ended anytime.
      </p>
    </div>
  );
};
