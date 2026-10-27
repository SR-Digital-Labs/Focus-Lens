import React, { useEffect, useState } from 'react';
import { Bell, Clock3, Moon, Save, ShieldCheck, Timer, Waves } from 'lucide-react';
import {
  DEFAULT_AWAY_THRESHOLD_MINUTES,
  getAwayDetectionStorage,
  readAwayThresholdMinutes,
  saveAwayThresholdMinutes,
} from '../services/awayDetection.service';
import {
  getWellnessReminderService,
  type WellnessSettings,
} from '../services/wellnessReminder.service';
import {
  getWellnessNotificationPermission,
  isWellnessNotificationSupported,
  requestWellnessNotificationPermission,
} from '../services/wellnessNotification.service';
import { privacySettingsRepository } from '../services/db.service';
import type { PrivacySettings } from '../types';

const Settings: React.FC = () => {
  const service = getWellnessReminderService();
  const [settings, setSettings] = useState<WellnessSettings>(() =>
    service.getSnapshot().settings,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [awayThresholdMinutes, setAwayThresholdMinutes] = useState(() => {
    try {
      return readAwayThresholdMinutes(getAwayDetectionStorage());
    } catch (error) {
      console.error('Unable to load away-detection settings:', error);
      return DEFAULT_AWAY_THRESHOLD_MINUTES;
    }
  });
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported' | 'unknown'
  >('unknown');

  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    saveVideoLocally: false,
    blurBackgroundInVideo: true,
    dataRetentionDays: 30,
  });

  useEffect(() => {
    void getWellnessNotificationPermission()
      .then(setNotificationPermission)
      .catch((error: unknown) => {
        console.error('Unable to read desktop notification permission:', error);
      });

    void Promise.all([
      privacySettingsRepository.get('saveVideoLocally').catch(() => null),
      privacySettingsRepository.get('blurBackgroundInVideo').catch(() => null),
      privacySettingsRepository.get('dataRetentionDays').catch(() => null),
    ]).then(([saveVideo, blurBg, retention]) => {
      setPrivacySettings({
        saveVideoLocally: saveVideo ?? false,
        blurBackgroundInVideo: blurBg ?? true,
        dataRetentionDays: retention ?? 30,
      });
    }).catch((err) => {
      console.warn('Unable to load privacy settings from database:', err);
    });
  }, []);

  const updatePrivacySetting = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => {
    const next = { ...privacySettings, [key]: value };
    setPrivacySettings(next);
    void privacySettingsRepository.set(key, value).then(() => {
      setMessage('Privacy settings saved on this device.');
    }).catch((err) => {
      console.warn('Unable to save privacy setting:', err);
      setMessage('Privacy setting updated.');
    });
  };

  const saveSettings = (nextSettings: WellnessSettings) => {
    try {
      service.setSettings(nextSettings);
      setSettings(nextSettings);
      setMessage('Wellness reminder settings saved on this device.');
    } catch (error) {
      console.error('Unable to save wellness reminder settings:', error);
      setMessage(error instanceof Error ? error.message : 'Unable to save reminder settings.');
    }
  };

  const update = (changes: Partial<WellnessSettings>) => {
    saveSettings({ ...settings, ...changes });
  };

  const updateAwayThreshold = (minutes: number) => {
    try {
      saveAwayThresholdMinutes(getAwayDetectionStorage(), minutes);
      setAwayThresholdMinutes(minutes);
      setMessage('Away-detection threshold saved on this device.');
    } catch (error) {
      console.error('Unable to save away-detection threshold:', error);
      setMessage(error instanceof Error ? error.message : 'Unable to save away-detection threshold.');
    }
  };

  const enableSystemNotifications = async () => {
    try {
      const permission = await requestWellnessNotificationPermission();
      setNotificationPermission(permission);
      setMessage(
        permission === 'granted'
          ? 'System notifications enabled.'
          : permission === 'unsupported'
            ? 'System notifications are not supported by this runtime.'
            : 'System notifications were not allowed. The in-app reminder panel will still appear.',
      );
    } catch (error) {
      console.error('Unable to request system notification permission:', error);
      setMessage('Unable to request system notification permission.');
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>Settings</h1>
        <p>Configure local wellness reminders to fit your day.</p>
      </header>

      <section className="card settings-group">
        <div className="settings-group-heading">
          <Waves size={20} aria-hidden="true" />
          <div>
            <h2>Water reminders</h2>
            <p>Gentle hydration reminders while a focus session is running.</p>
          </div>
        </div>
        <label className="settings-toggle">
          <span>Enable water reminders</span>
          <input
            type="checkbox"
            checked={settings.waterEnabled}
            onChange={(event) => update({ waterEnabled: event.target.checked })}
          />
        </label>
        <label className="settings-field">
          <span>Remind me every</span>
          <select
            value={settings.waterIntervalMinutes}
            disabled={!settings.waterEnabled}
            onChange={(event) => update({ waterIntervalMinutes: Number(event.target.value) })}
          >
            {[30, 45, 60, 90].map((minutes) => (
              <option key={minutes} value={minutes}>{minutes} minutes</option>
            ))}
          </select>
        </label>
      </section>

      <section className="card settings-group">
        <div className="settings-group-heading">
          <Moon size={20} aria-hidden="true" />
          <div>
            <h2>Sleep reminder</h2>
            <p>One friendly nudge each evening after your chosen local time.</p>
          </div>
        </div>
        <label className="settings-toggle">
          <span>Enable sleep reminders</span>
          <input
            type="checkbox"
            checked={settings.sleepEnabled}
            onChange={(event) => update({ sleepEnabled: event.target.checked })}
          />
        </label>
        <label className="settings-field">
          <span>Remind me at</span>
          <input
            type="time"
            value={settings.sleepTime}
            disabled={!settings.sleepEnabled}
            onChange={(event) => update({ sleepTime: event.target.value })}
          />
        </label>
      </section>

      <section className="card settings-group">
        <div className="settings-group-heading">
          <Timer size={20} aria-hidden="true" />
          <div>
            <h2>Away detection</h2>
            <p>Record an away event only after reliable absence lasts this long.</p>
          </div>
        </div>
        <label className="settings-field">
          <span>Away threshold</span>
          <select
            value={awayThresholdMinutes}
            onChange={(event) => updateAwayThreshold(Number(event.target.value))}
          >
            {[1, 2, 3, 5, 10, 15].map((minutes) => (
              <option key={minutes} value={minutes}>{minutes} {minutes === 1 ? 'minute' : 'minutes'}</option>
            ))}
          </select>
        </label>
        <p className="settings-privacy-note">
          Away tracking runs only in a running focus session. Unknown or unavailable detection
          does not count as away; paused time is excluded.
        </p>
      </section>

      <section className="card settings-group">
        <div className="settings-group-heading">
          <Clock3 size={20} aria-hidden="true" />
          <div>
            <h2>Snooze and notifications</h2>
            <p>Set how long the puppy waits before reminding you again.</p>
          </div>
        </div>
        <label className="settings-field">
          <span>Snooze duration</span>
          <select
            value={settings.snoozeMinutes}
            onChange={(event) => update({ snoozeMinutes: Number(event.target.value) })}
          >
            {[5, 10, 15, 20, 30, 45, 60].map((minutes) => (
              <option key={minutes} value={minutes}>{minutes} minutes</option>
            ))}
          </select>
        </label>
        <div className="settings-notification-row">
          <div>
            <strong><Bell size={16} aria-hidden="true" /> Desktop notification fallback</strong>
            <p>
              {notificationPermission === 'granted'
                ? 'Allowed; a system notification can appear when FocusLens is in the background.'
                : notificationPermission === 'unsupported'
                  ? 'Not supported by this runtime.'
                  : 'Allow notifications so reminders remain noticeable when FocusLens is in the background.'}
            </p>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={
              notificationPermission === 'granted'
              || (notificationPermission === 'unsupported' && !isWellnessNotificationSupported())
            }
            onClick={() => void enableSystemNotifications()}
          >
            {notificationPermission === 'granted' ? 'Enabled' : 'Enable'}
          </button>
        </div>
      </section>

      <section className="card settings-group">
        <div className="settings-group-heading">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <h2>Privacy and data controls</h2>
            <p>On-device privacy guarantees and local storage policies.</p>
          </div>
        </div>
        <label className="settings-toggle">
          <div>
            <span>Blur background during video preview</span>
            <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
              Keeps background private during live camera preview.
            </small>
          </div>
          <input
            type="checkbox"
            checked={privacySettings.blurBackgroundInVideo}
            onChange={(event) => updatePrivacySetting('blurBackgroundInVideo', event.target.checked)}
          />
        </label>
        <label className="settings-toggle">
          <div>
            <span>Save session video locally</span>
            <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
              Zero raw recordings are saved by default.
            </small>
          </div>
          <input
            type="checkbox"
            checked={privacySettings.saveVideoLocally}
            onChange={(event) => updatePrivacySetting('saveVideoLocally', event.target.checked)}
          />
        </label>
        <label className="settings-field">
          <div>
            <span>Session history retention</span>
            <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
              How long completed focus sessions are preserved locally.
            </small>
          </div>
          <select
            value={privacySettings.dataRetentionDays}
            onChange={(event) => updatePrivacySetting('dataRetentionDays', Number(event.target.value))}
          >
            {[7, 14, 30, 90, 180, 365].map((days) => (
              <option key={days} value={days}>{days} days</option>
            ))}
          </select>
        </label>
      </section>

      {message && (
        <p className="settings-feedback" role="status">
          <Save size={16} aria-hidden="true" />
          {message}
        </p>
      )}

      <p className="settings-privacy-note">
        Reminder preferences, privacy configurations, and session records stay exclusively in local device storage.
      </p>
    </div>
  );
};

export default Settings;
