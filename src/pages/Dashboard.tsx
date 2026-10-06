import React, { useEffect, useState } from 'react';
import { Moon, Sun, Sunrise, Sunset, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type DaypartId = 'morning' | 'afternoon' | 'evening' | 'night';
type DaypartAllocation = Record<DaypartId, number>;

const ALLOCATION_STORAGE_KEY = 'focuslens.daypart-allocation.v1';
const DEFAULT_ALLOCATION: DaypartAllocation = {
  morning: 90,
  afternoon: 120,
  evening: 60,
  night: 0,
};

const DAYPARTS = [
  { id: 'morning', label: 'Morning', hours: '05:00–12:00', icon: <Sunrise size={18} /> },
  { id: 'afternoon', label: 'Afternoon', hours: '12:00–17:00', icon: <Sun size={18} /> },
  { id: 'evening', label: 'Evening', hours: '17:00–21:00', icon: <Sunset size={18} /> },
  { id: 'night', label: 'Night', hours: '21:00–05:00', icon: <Moon size={18} /> },
] as const;

function readAllocation(): DaypartAllocation {
  if (typeof window === 'undefined') return { ...DEFAULT_ALLOCATION };

  try {
    const saved = window.localStorage.getItem(ALLOCATION_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_ALLOCATION };

    const parsed = JSON.parse(saved) as Partial<DaypartAllocation>;
    return Object.fromEntries(
      DAYPARTS.map(({ id }) => {
        const value = parsed[id];
        return [id, Number.isFinite(value) ? Math.min(480, Math.max(0, Number(value))) : DEFAULT_ALLOCATION[id]];
      }),
    ) as DaypartAllocation;
  } catch {
    return { ...DEFAULT_ALLOCATION };
  }
}

function getCurrentDaypart(date: Date): DaypartId {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [allocation, setAllocation] = useState<DaypartAllocation>(readAllocation);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ALLOCATION_STORAGE_KEY, JSON.stringify(allocation));
    } catch {
      // Keep allocation usable for this visit when local storage is unavailable.
    }
  }, [allocation]);

  const activeDaypart = getCurrentDaypart(now);
  const totalMinutes = Object.values(allocation).reduce((total, minutes) => total + minutes, 0);
  const clockText = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  const dateText = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);
  const greeting = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good evening',
  }[activeDaypart];

  return (
    <div>
      <div className="hero-section dashboard-hero">
        <div>
          <h1>{greeting}</h1>
          <p>Ready for a focused session?</p>
          <button className="btn" onClick={() => navigate('/session')}>
            <Target size={18} />
            Start Focus Session
          </button>
        </div>
        <div className="live-clock" role="timer" aria-label={`Local time ${clockText}`}>
          <span className="live-clock-label">LOCAL TIME</span>
          <strong>{clockText}</strong>
          <span>{dateText}</span>
        </div>
      </div>

      <div className="grid grid-cols-4">
        <div className="card">
          <div className="card-value">2h 45m</div>
          <div className="card-label">Today's focus time</div>
        </div>
        <div className="card">
          <div className="card-value">4</div>
          <div className="card-label">Sessions today</div>
        </div>
        <div className="card">
          <div className="card-value">41m</div>
          <div className="card-label">Average duration</div>
        </div>
        <div className="card">
          <div className="card-value">18m</div>
          <div className="card-label">Total away time</div>
        </div>
      </div>

      <section className="card allocation-panel" aria-labelledby="allocation-title">
        <div className="allocation-header">
          <div>
            <h2 id="allocation-title">Daily focus allocation</h2>
            <p>Set a planned focus target for each part of your day.</p>
          </div>
          <div className="allocation-total" aria-live="polite">
            <strong>{formatDuration(totalMinutes)}</strong>
            <span>planned total</span>
          </div>
        </div>

        <div className="daypart-list">
          {DAYPARTS.map((daypart) => {
            const share = totalMinutes > 0
              ? Math.round((allocation[daypart.id] / totalMinutes) * 100)
              : 0;
            const isCurrent = activeDaypart === daypart.id;

            return (
              <div
                className={`daypart-row${isCurrent ? ' current' : ''}`}
                key={daypart.id}
              >
                <div className="daypart-name">
                  <span className="daypart-icon" aria-hidden="true">{daypart.icon}</span>
                  <span>
                    <strong>{daypart.label}</strong>
                    <small>{daypart.hours}{isCurrent ? ' · Now' : ''}</small>
                  </span>
                </div>
                <label className="daypart-input">
                  <span className="visually-hidden">{daypart.label} focus target in minutes</span>
                  <input
                    type="number"
                    min="0"
                    max="480"
                    step="5"
                    value={allocation[daypart.id]}
                    onChange={(event) => {
                      const nextValue = Number(event.currentTarget.value);
                      if (Number.isFinite(nextValue)) {
                        setAllocation((current) => ({
                          ...current,
                          [daypart.id]: Math.min(480, Math.max(0, nextValue)),
                        }));
                      }
                    }}
                  />
                  <span>min</span>
                </label>
                <div
                  className="allocation-track"
                  role="progressbar"
                  aria-label={`${daypart.label} share of planned focus time`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={share}
                >
                  <span style={{ width: `${share}%` }} />
                </div>
                <span className="daypart-share">{share}%</span>
              </div>
            );
          })}
        </div>
        <p className="allocation-note">Targets are saved on this device. They show planned time, not tracked session totals.</p>
      </section>

      <div className="card">
        <div className="recent-sessions-header">
          <h2>Recent Sessions</h2>
          <a href="/history" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontSize: '0.875rem' }}>
            View History →
          </a>
        </div>
        
        <div className="session-list">
          <div className="session-item">
            <div className="session-time">09:00</div>
            <div className="session-duration">45 min</div>
            <div className="session-score">Focus Indicator 86%</div>
          </div>
          <div className="session-item">
            <div className="session-time">11:30</div>
            <div className="session-duration">60 min</div>
            <div className="session-score">Focus Indicator 81%</div>
          </div>
          <div className="session-item">
            <div className="session-time">14:00</div>
            <div className="session-duration">30 min</div>
            <div className="session-score">Focus Indicator 90%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
