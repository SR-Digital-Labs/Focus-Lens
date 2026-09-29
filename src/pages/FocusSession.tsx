import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import type { CameraStatus } from '../services/contracts';
import { cameraCaptureService } from '../services/cameraCapture.service';

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
    <section className="focus-camera">
      <div className="focus-camera-heading">
        <div>
          <h1>Camera Preview</h1>
          <p>Local webcam capture. Frames stay on this device.</p>
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
          {isActive ? <CameraOff size={18} /> : <Camera size={18} />}
          {isStarting ? 'Starting Camera...' : isActive ? 'Disable Camera' : 'Enable Camera'}
        </button>
      </div>

      <div className="camera-preview" data-state={cameraStatus.state}>
        <video ref={videoRef} autoPlay muted playsInline aria-label="Live webcam preview" />
        {!isActive && (
          <div className="camera-preview-empty">
            <Camera size={30} aria-hidden="true" />
            <span>{isStarting ? 'Waiting for camera frames...' : 'Camera is off'}</span>
          </div>
        )}
      </div>

      <div className="camera-details">
        <div>
          <strong>{isActive ? 'Camera Active' : isStarting ? 'Camera Starting' : 'Camera Disabled'}</strong>
          <p role={cameraStatus.message && !isActive ? 'alert' : undefined}>
            {cameraStatus.message ?? 'Enable the camera to begin receiving live frames.'}
          </p>
        </div>
        {isActive && <span className="frame-count">{frameCount.toLocaleString()} frames received</span>}
      </div>
    </section>
  );
};

export default FocusSession;
