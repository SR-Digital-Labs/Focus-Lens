import { useCallback, useEffect, useRef, useState } from 'react';

type CatGreetingPhase = 'looking-up' | 'turning-to-user' | 'idle';

const LOOK_UP_MS = 1_000;
const TURN_TO_USER_MS = 700;
const MESSAGE_DURATION_MS = 2_800;

export default function DashboardCatMascot() {
  const [phase, setPhase] = useState<CatGreetingPhase>('looking-up');
  const [showMessage, setShowMessage] = useState(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  }, []);

  const scheduleGreeting = useCallback(() => {
    timersRef.current.push(window.setTimeout(() => {
      setPhase('turning-to-user');
    }, LOOK_UP_MS));
    timersRef.current.push(window.setTimeout(() => {
      setPhase('idle');
      setShowMessage(true);
    }, LOOK_UP_MS + TURN_TO_USER_MS));
    timersRef.current.push(window.setTimeout(() => {
      setShowMessage(false);
    }, LOOK_UP_MS + TURN_TO_USER_MS + MESSAGE_DURATION_MS));
  }, []);

  const playGreeting = useCallback(() => {
    clearTimers();
    setShowMessage(false);
    setPhase('looking-up');
    scheduleGreeting();
  }, [clearTimers, scheduleGreeting]);

  useEffect(() => {
    scheduleGreeting();
    return clearTimers;
  }, [clearTimers, scheduleGreeting]);

  return (
    <div className="dashboard-cat-mascot">
      <div className="dashboard-cat-message-slot" aria-live="polite">
        {showMessage && (
          <span className="dashboard-cat-message" role="status">
            Hi!
          </span>
        )}
      </div>
      <button
        className={`dashboard-cat-face ${phase}`}
        type="button"
        aria-label="Cute animated cat. Click to hear hello again."
        onClick={playGreeting}
      >
        <span className="dashboard-cat-art" aria-hidden="true">
          <img src="/focus%20cat.gif" alt="" draggable="false" />
        </span>
      </button>
    </div>
  );
}
