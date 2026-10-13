import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ShieldCheck } from 'lucide-react';
import type { CameraStatus } from '../services/contracts';
import { cameraCaptureService } from '../services/cameraCapture.service';
import { FocusTimer } from '../components/FocusTimer';

const FocusSession: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCountRef = useRef(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(cameraCaptureService.getStatus());
  const [frameCount, setFrameCount] = useState(0);

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

      <div className="focus-session-layout">
        {/* Core Focus Session Timer (Day 16) */}
        <div className="focus-session-main">
          <FocusTimer />
        </div>

        {/* Local Camera Preview & Device Status */}
        <div className="focus-session-sidebar">
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
