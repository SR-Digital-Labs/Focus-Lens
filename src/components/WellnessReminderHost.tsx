import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock3, X } from 'lucide-react';
import WellnessAvatar from './WellnessAvatar';
import {
  getWellnessReminderService,
  type WellnessReminderSnapshot,
} from '../services/wellnessReminder.service';
import {
  dismissWellnessSystemNotification,
  showWellnessSystemNotification,
} from '../services/wellnessNotification.service';

const WellnessReminderHost: React.FC = () => {
  const service = getWellnessReminderService();
  const [snapshot, setSnapshot] = useState<WellnessReminderSnapshot>(() =>
    service.getSnapshot(),
  );
  const lastNotifiedReminderId = useRef<string | null>(null);

  useEffect(() => {
    const notifyWhenHidden = (nextSnapshot: WellnessReminderSnapshot) => {
      const nextReminder = nextSnapshot.reminder;
      if (
        !nextReminder
        || document.visibilityState !== 'hidden'
        || lastNotifiedReminderId.current === nextReminder.id
      ) {
        return;
      }
      lastNotifiedReminderId.current = nextReminder.id;
      void showWellnessSystemNotification(nextReminder)
        .then((shown) => {
          if (!shown && lastNotifiedReminderId.current === nextReminder.id) {
            lastNotifiedReminderId.current = null;
          }
        })
        .catch((error: unknown) => {
          console.error('Unable to display the wellness desktop notification.', error);
          if (lastNotifiedReminderId.current === nextReminder.id) {
            lastNotifiedReminderId.current = null;
          }
        });
    };
    const unsubscribe = service.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      if (!nextSnapshot.reminder) {
        dismissWellnessSystemNotification();
      }
      notifyWhenHidden(nextSnapshot);
    });
    const stop = service.start();
    const interval = window.setInterval(() => service.tick(), 1_000);
    const refreshOnWake = () => {
      service.tick();
      notifyWhenHidden(service.getSnapshot());
    };
    document.addEventListener('visibilitychange', refreshOnWake);
    window.addEventListener('focus', refreshOnWake);
    window.addEventListener('pageshow', refreshOnWake);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshOnWake);
      window.removeEventListener('focus', refreshOnWake);
      window.removeEventListener('pageshow', refreshOnWake);
      stop();
      unsubscribe();
    };
  }, [service]);

  const reminder = snapshot.reminder;
  if (!reminder) {
    return null;
  }

  const isWater = reminder.kind === 'water';
  const message = isWater
    ? 'Woof! 🐶 Time to drink some water!'
    : `It’s ${formatSleepTime(snapshot.settings.sleepTime)}! 🐶 Time to wrap up and get ready for sleep.`;

  return (
    <aside
      className={`wellness-reminder-panel ${reminder.kind}`}
      role="status"
      aria-live="polite"
      aria-label={`${reminder.kind} wellness reminder`}
    >
      <button
        className="wellness-reminder-close"
        type="button"
        aria-label="Dismiss wellness reminder"
        onClick={() => service.respondToReminder('dismiss')}
      >
        <X size={17} />
      </button>
      <WellnessAvatar kind={reminder.kind} />
      <div className="wellness-speech-bubble">
        <p className="wellness-reminder-eyebrow">
          {isWater ? 'A little wellness break' : 'A gentle evening reminder'}
        </p>
        <h2 id="wellness-reminder-title">
          {isWater ? 'Hydration time!' : 'Time to wind down'}
        </h2>
        <p id="wellness-reminder-message">{message}</p>
      </div>
      <div className="wellness-reminder-actions">
        {isWater ? (
          <button
            className="btn wellness-action-primary"
            type="button"
            onClick={() => service.respondToReminder('done')}
          >
            <Check size={16} />
            Done
          </button>
        ) : (
          <button
            className="btn wellness-action-primary"
            type="button"
            onClick={() => service.respondToReminder('dismiss')}
          >
            <Check size={16} />
            Start winding down
          </button>
        )}
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => service.respondToReminder('snooze')}
        >
          <Clock3 size={16} />
          Remind me in {snapshot.settings.snoozeMinutes} min
        </button>
        <button
          className="wellness-dismiss-link"
          type="button"
          onClick={() => service.respondToReminder('dismiss')}
        >
          {isWater ? 'Dismiss' : 'Dismiss for tonight'}
        </button>
      </div>
    </aside>
  );
};

function formatSleepTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    ...(minutes === 0 ? {} : { minute: '2-digit' }),
  });
}

export default WellnessReminderHost;
