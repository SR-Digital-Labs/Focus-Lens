import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ShieldCheck } from 'lucide-react';
import type { CameraStatus } from '../services/contracts';
import { cameraCaptureService } from '../services/cameraCapture.service';
import { FocusTimer } from '../components/FocusTimer';
import { useActivityMonitoring } from '../context/useActivityMonitoring';

const FocusSession: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCountRef = useRef(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(cameraCaptureService.getStatus());
  const [frameCount, setFrameCount] = useState(0);
  const [dismissedPostureReminderAt, setDismissedPostureReminderAt] = useState<string | null>(null);
  const { activityState, awayState } = useActivityMonitoring();
  const showPostureReminder = Boolean(
    activityState.signal?.postureReminder
    && activityState.signal.occurredAt !== dismissedPostureReminderAt,
  );

  useEffect(() => {
    const unsubscribeStatus = cameraCaptureService.subscribeStatus(setCameraStatus);
    const unsubscribeFrames = cameraCaptureService.subscribeFrames((frame) => {
      frameCountRef.current = frame.frameIndex + 1;
    });
    const frameCountTimer = window.setInterval(() => {
      setFrameCount(frameCountRef.current);
    }, 1_000);
    return () => {
      window.clearInterval(frameCountTimer);
      unsubscribeStatus();
      unsubscribeFrames();
      cameraCaptureService.stopCapture();
    };
  }, []);

  const isActive = cameraStatus.state === 'active';
  const isStarting = cameraStatus.state === 'starting' || cameraStatus.state === 'requesting';
  const currentAwayEvent = awayState.events[awayState.events.length - 1];
  const awayDurationSeconds = Math.floor(awayState.awayDurationMs / 1_000);

  return (
    <div className="focus-session-page">
      <div className="focus-session-header">
        <div>
          <h1>Focus Session</h1>
          <p>Choose your duration, begin your session, and maintain your flow.</p>
        </div>
        <div className="privacy-pill">
          <ShieldCheck size={16} />
          <span>Privacy First · Local Only</span>
        </div>
      </div>

      {showPostureReminder && (
        <section className="posture-reminder" role="status" aria-live="polite">
          <div>
            <h2>Posture reminder</h2>
            <p>Your posture has been slouched for a while. Consider adjusting your sitting position.</p>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setDismissedPostureReminderAt(activityState.signal?.occurredAt ?? null)}
          >
            Got it
          </button>
        </section>
      )}

      <div className="focus-session-layout">
        {/* Core Focus Session Timer (Day 16) */}
        <div className="focus-session-main">
          <FocusTimer />
        </div>

        {/* Local Camera Preview & Device Status */}
        <div className="focus-session-sidebar">
          <section className="card activity-monitor-card" aria-live="polite">
            <div className="activity-monitor-heading">
              <div>
                <h2>Live activity</h2>
                <p>
                  {activityState.status === 'active'
                    ? 'Derived signals for this focus session.'
                    : activityState.status === 'paused'
                      ? 'Monitoring pauses with your focus session.'
                      : 'Activity indicators update during a running session.'}
                </p>
              </div>
              <span className={`activity-monitor-status ${activityState.status}`}>
                {activityState.status}
              </span>
            </div>

            <dl className="activity-indicators">
              <div>
                <dt>Person</dt>
                <dd>{activityState.signal?.personPresence ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Screen-facing</dt>
                <dd>{activityState.signal?.screenFacing ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Posture</dt>
                <dd>{activityState.signal?.posture ?? 'unknown'}</dd>
              </div>
              {activityState.signal?.confidence !== undefined && (
                <div>
                  <dt>Confidence</dt>
                  <dd>{Math.round(activityState.signal.confidence * 100)}%</dd>
                </div>
              )}
            </dl>

            {activityState.signal?.occurredAt && (
              <p className="activity-updated-at">
                Updated {new Date(activityState.signal.occurredAt).toLocaleTimeString()}
              </p>
            )}
            {awayState.sessionId === activityState.sessionId && awayState.awayStartedAt && (
              <p className="away-detection-status" role="status">
                Away for {formatAwayDuration(awayDurationSeconds)} of {awayState.thresholdMinutes} min threshold.
              </p>
            )}
            {awayState.sessionId === activityState.sessionId && currentAwayEvent && (
              <p className="away-detection-event" role="status">
                Away threshold reached at {new Date(currentAwayEvent.thresholdReachedAt).toLocaleTimeString()}.
                {' '}Duration: {formatAwayDuration(Math.floor(currentAwayEvent.duration ?? 0))}.
              </p>
            )}
            {activityState.error && (
              <p className="activity-monitor-error" role="status">
                {activityState.error}
              </p>
            )}
          </section>

          <section className="card focus-camera-card">
            <div className="focus-camera-heading">
              <div>
                <h2>Camera Preview</h2>
                <p>Local vision pipeline for attention & posture.</p>
              </div>
              <button
                className={`btn${isActive ? ' btn-secondary' : ''}`}
                type="button"
                disabled={isStarting}
                onClick={() => {
                  if (isActive) {
                    cameraCaptureService.stopCapture();
                    frameCountRef.current = 0;
                    setFrameCount(0);
                  } else if (videoRef.current) {
                    void cameraCaptureService.startCapture(videoRef.current);
                  }
                }}
              >
                {isActive ? <CameraOff size={16} /> : <Camera size={16} />}
                {isStarting ? 'Starting...' : isActive ? 'Disable' : 'Enable'}
              </button>
            </div>

            <div className="camera-preview" data-state={cameraStatus.state}>
              <video ref={videoRef} autoPlay muted playsInline aria-label="Live webcam preview" />
              {!isActive && (
                <div className="camera-preview-empty">
                  <Camera size={26} aria-hidden="true" />
                  <span>{isStarting ? 'Connecting...' : 'Camera is off'}</span>
                </div>
              )}
            </div>

            <div className="camera-details">
              <div>
                <strong>{isActive ? 'Camera Active' : isStarting ? 'Starting' : 'Disabled'}</strong>
                <p role={cameraStatus.message && !isActive ? 'alert' : undefined}>
                  {cameraStatus.message ?? 'Frames process locally on-device.'}
                </p>
              </div>
              {isActive && <span className="frame-count">{frameCount.toLocaleString()} frames</span>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default FocusSession;

function formatAwayDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
