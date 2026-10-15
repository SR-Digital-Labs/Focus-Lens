import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ShieldCheck } from 'lucide-react';
import type { ActivityMonitoringState, CameraStatus } from '../services/contracts';
import { cameraCaptureService } from '../services/cameraCapture.service';
import { focusLensService } from '../services/focusLensService';
import { focusTimerService } from '../services/focusTimer.service';
import { FocusTimer } from '../components/FocusTimer';
import { ActivitySessionMonitor } from '../services/activitySessionMonitor.service';

const INITIAL_ACTIVITY_STATE: ActivityMonitoringState = {
  sessionId: null,
  status: 'inactive',
  signal: null,
  error: null,
};

const FocusSession: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCountRef = useRef(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(cameraCaptureService.getStatus());
  const [frameCount, setFrameCount] = useState(0);
  const [showPostureReminder, setShowPostureReminder] = useState(false);
  const [activityState, setActivityState] = useState(INITIAL_ACTIVITY_STATE);

  useEffect(() => {
    const unsubscribeStatus = cameraCaptureService.subscribeStatus(setCameraStatus);
    const unsubscribeFrames = cameraCaptureService.subscribeFrames((frame) => {
      frameCountRef.current = frame.frameIndex + 1;
    });
    const frameCountTimer = window.setInterval(() => {
      setFrameCount(frameCountRef.current);
    }, 1_000);
    const monitor = new ActivitySessionMonitor(focusLensService, focusTimerService);
    const unsubscribeActivityState = monitor.subscribe((state) => {
      setActivityState(state);
      if (state.signal?.postureReminder) {
        setShowPostureReminder(true);
      }
    });
    const stopMonitoring = monitor.start();

    return () => {
      window.clearInterval(frameCountTimer);
      stopMonitoring();
      unsubscribeActivityState();
      unsubscribeStatus();
      unsubscribeFrames();
      cameraCaptureService.stopCapture();
    };
  }, []);

  const isActive = cameraStatus.state === 'active';
  const isStarting = cameraStatus.state === 'starting' || cameraStatus.state === 'requesting';

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
            onClick={() => setShowPostureReminder(false)}
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
