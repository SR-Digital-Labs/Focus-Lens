import { useCallback, useEffect, useRef, useState } from 'react';

type CatGreetingPhase = 'looking-up' | 'turning-to-user' | 'idle';

const LOOK_UP_MS = 1_000;
const TURN_TO_USER_MS = 700;
const MESSAGE_DURATION_MS = 2_800;

export default function DashboardCatMascot() {
  const [phase, setPhase] = useState<CatGreetingPhase>('looking-up');
  const [showMessage, setShowMessage] = useState(false);
  const artRef = useRef<HTMLSpanElement>(null);
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

  useEffect(() => {
    const resetLook = () => {
      const art = artRef.current;
      if (!art) return;
      art.style.setProperty('--cat-look-x', '0px');
      art.style.setProperty('--cat-look-y', '0px');
    };

    const trackPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const art = artRef.current;
      if (!art) return;

      const bounds = art.getBoundingClientRect();
      const horizontal = Math.max(-1, Math.min(1, (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2)));
      const vertical = Math.max(-1, Math.min(1, (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2)));
      art.style.setProperty('--cat-look-x', `${horizontal * 5}px`);
      art.style.setProperty('--cat-look-y', `${vertical * 3}px`);
    };

    const resetWhenPointerLeavesWindow = (event: PointerEvent) => {
      if (event.relatedTarget === null) resetLook();
    };

    window.addEventListener('pointermove', trackPointer);
    window.addEventListener('pointerout', resetWhenPointerLeavesWindow);
    window.addEventListener('blur', resetLook);
    document.addEventListener('pointerleave', resetLook);
    return () => {
      window.removeEventListener('pointermove', trackPointer);
      window.removeEventListener('pointerout', resetWhenPointerLeavesWindow);
      window.removeEventListener('blur', resetLook);
      document.removeEventListener('pointerleave', resetLook);
    };
  }, []);

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
        <span ref={artRef} className="dashboard-cat-art" aria-hidden="true">
          <img src="/focus-cat-transparent.gif" alt="" draggable="false" />
        </span>
        <span className="dashboard-cat-paw dashboard-cat-paw-left" aria-hidden="true" />
        <span className="dashboard-cat-paw dashboard-cat-paw-right" aria-hidden="true" />
      </button>
    </div>
  );
}
