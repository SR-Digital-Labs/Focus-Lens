/**
 * FocusLens — Notification & Break Settings Section (Day 30)
 * ===========================================================
 * Shavisha's Day 30 work: notification and break settings UI component.
 *
 * Responsibilities:
 * - Display and toggle the break-reminder enabled state (waterEnabled).
 * - Allow the user to select a supported focus interval (waterIntervalMinutes).
 * - Explain when and how in-app break reminders are delivered.
 * - Save preference changes through the existing WellnessReminderService
 *   (service.setSettings), which persists to localStorage.
 *
 * What this component does NOT do:
 * - It does NOT implement a second reminder timer.
 * - It does NOT manage sleep reminders (handled elsewhere in Settings).
 * - It does NOT promise OS-level notifications (that is the desktop fallback row).
 * - It does NOT touch snooze settings (handled in the Snooze section).
 */

import React from 'react';
import { AlarmClock, Bell, BellOff, Info } from 'lucide-react';
import {
  getWellnessReminderService,
  type WellnessSettings,
} from '../services/wellnessReminder.service';
import {
  BREAK_INTERVAL_OPTIONS,
  breakIntervalLabel,
  isValidBreakInterval,
  type BreakIntervalMinutes,
} from '../utils/breakIntervalPresentation';

// Re-export helpers so callers that import from this module still work
export { BREAK_INTERVAL_OPTIONS, breakIntervalLabel, isValidBreakInterval };
export type { BreakIntervalMinutes };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NotificationBreakSectionProps {
  /** Optional: called with a user-facing status message after a preference change. */
  onMessage?: (message: string) => void;
}

/**
 * NotificationBreakSection
 *
 * Renders the break-reminder toggle and focus-interval selector inside the
 * Settings page.  Reads and writes preferences through the shared
 * WellnessReminderService singleton — the same service that drives the
 * WellnessReminderHost — so changes take effect without a page reload.
 */
const NotificationBreakSection: React.FC<NotificationBreakSectionProps> = ({
  onMessage,
}) => {
  const service = getWellnessReminderService();

  // Mirror service snapshot into local state so the UI reacts to
  // external changes (e.g. another settings row toggling waterEnabled).
  const [settings, setSettings] = React.useState<WellnessSettings>(
    () => service.getSnapshot().settings,
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Keep local state in sync if the service emits a change from elsewhere.
  React.useEffect(() => {
    const unsubscribe = service.subscribe((snapshot) => {
      setSettings(snapshot.settings);
    });
    return unsubscribe;
  }, [service]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const applySettings = (changes: Partial<WellnessSettings>) => {
    const next: WellnessSettings = { ...settings, ...changes };
    try {
      service.setSettings(next);
      setSaveError(null);
      onMessage?.('Break reminder settings saved on this device.');
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Unable to save break reminder settings.';
      setSaveError(msg);
      console.error('NotificationBreakSection: unable to save settings.', error);
    }
  };

  const toggleBreakReminders = (enabled: boolean) => {
    applySettings({ waterEnabled: enabled });
  };

  const changeInterval = (minutes: number) => {
    if (!isValidBreakInterval(minutes)) {
      setSaveError(`${minutes} is not a supported focus interval.`);
      return;
    }
    applySettings({ waterIntervalMinutes: minutes });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const { waterEnabled, waterIntervalMinutes } = settings;
  const intervalIsValid = isValidBreakInterval(waterIntervalMinutes);

  return (
    <section
      className="card settings-group"
      aria-labelledby="break-reminder-heading"
      data-testid="notification-break-section"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Section heading                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="settings-group-heading">
        <AlarmClock size={20} aria-hidden="true" />
        <div>
          <h2 id="break-reminder-heading">Break reminders</h2>
          <p>
            Timely in-app prompts to step away and rehydrate during a focus
            session.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Enable / disable toggle                                               */}
      {/* ------------------------------------------------------------------ */}
      <label
        className="settings-toggle"
        htmlFor="break-reminders-toggle"
        data-testid="break-reminder-toggle-label"
      >
        <span className="break-reminder-toggle-text">
          {waterEnabled ? (
            <>
              <Bell size={15} aria-hidden="true" className="break-reminder-icon break-reminder-icon--on" />
              <span>Break reminders are <strong>on</strong></span>
            </>
          ) : (
            <>
              <BellOff size={15} aria-hidden="true" className="break-reminder-icon break-reminder-icon--off" />
              <span>Break reminders are <strong>off</strong></span>
            </>
          )}
        </span>
        <input
          id="break-reminders-toggle"
          type="checkbox"
          checked={waterEnabled}
          onChange={(event) => toggleBreakReminders(event.target.checked)}
          aria-describedby="break-reminder-toggle-hint"
        />
      </label>

      <p
        id="break-reminder-toggle-hint"
        className="settings-privacy-note break-reminder-hint"
        data-testid="break-reminder-toggle-hint"
      >
        {waterEnabled
          ? 'An in-app panel will appear after each focus interval, prompting you to take a short break and drink water.'
          : 'No break reminders will appear. You can re-enable them at any time.'}
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Focus interval selector                                               */}
      {/* ------------------------------------------------------------------ */}
      <label
        className="settings-field"
        htmlFor="focus-interval-select"
        data-testid="focus-interval-label"
      >
        <div>
          <span>Focus interval</span>
          <small
            style={{
              display: 'block',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              marginTop: '2px',
            }}
          >
            How long you focus before the break reminder appears.
          </small>
        </div>
        <select
          id="focus-interval-select"
          value={intervalIsValid ? waterIntervalMinutes : ''}
          disabled={!waterEnabled}
          onChange={(event) => changeInterval(Number(event.target.value))}
          aria-describedby="focus-interval-hint"
          data-testid="focus-interval-select"
        >
          {BREAK_INTERVAL_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {breakIntervalLabel(minutes)}
            </option>
          ))}
        </select>
      </label>

      <p
        id="focus-interval-hint"
        className="settings-privacy-note"
        data-testid="focus-interval-hint"
        style={{ display: waterEnabled ? undefined : 'none' }}
        aria-hidden={!waterEnabled}
      >
        The timer counts only while a focus session is <em>running</em>.
        Pausing the session pauses the break-reminder interval.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* How reminders are delivered                                            */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="break-reminder-info-note"
        role="note"
        data-testid="break-reminder-delivery-note"
      >
        <Info size={14} aria-hidden="true" className="break-reminder-info-icon" />
        <p>
          Break reminders appear as an <strong>in-app panel</strong> while
          FocusLens is open. An optional desktop notification fallback can be
          enabled separately in the <em>Snooze and notifications</em> section
          above, and will only appear when the app window is in the background.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Save error                                                             */}
      {/* ------------------------------------------------------------------ */}
      {saveError && (
        <p
          className="break-reminder-error"
          role="alert"
          data-testid="break-reminder-save-error"
        >
          {saveError}
        </p>
      )}
    </section>
  );
};

export default NotificationBreakSection;
