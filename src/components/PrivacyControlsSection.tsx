/**
 * FocusLens — Privacy Controls Section (Day 29)
 * ==============================================
 * Shavisha's Day 29 work: privacy settings UI component.
 *
 * Responsibilities:
 * - Display live camera status from cameraCaptureService (read-only, no camera activation).
 * - Display session tracking status from activityEventTracker (read-only).
 * - Provide accurate, plain-language privacy information based on the actual implementation.
 *
 * What this component does NOT do:
 * - It does NOT start or stop the camera — that is done in FocusSession.
 * - It does NOT duplicate camera-permission-request logic from Ragavi's pipeline.
 * - It does NOT start a focus session.
 */

import React, { useEffect, useState } from 'react';
import {
  Camera,
  CameraOff,
  Eye,
  EyeOff,
  Info,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { CameraStatus } from '../services/contracts';
import { cameraCaptureService } from '../services/cameraCapture.service';
import { activityEventTracker } from '../services/activityEventTracker.service';
import {
  cameraStateLabel,
  cameraStateDescription,
  cameraStateVariant,
  type CameraStatusVariant,
} from '../utils/cameraStatusPresentation';

// Re-export helpers so callers that import from this module still work
export { cameraStateLabel, cameraStateDescription, cameraStateVariant };
export type { CameraStatusVariant };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PrivacyControlsSectionProps {
  /** Optional: called with a user-facing status message after a relevant state change. */
  onMessage?: (message: string) => void;
}

/**
 * PrivacyControlsSection
 *
 * Renders the camera-access status, session-tracking status, and a privacy
 * information panel for the Settings page.  Integrates with the existing
 * cameraCaptureService and activityEventTracker singletons; does NOT start,
 * stop, or request camera access.
 */
export const PrivacyControlsSection: React.FC<PrivacyControlsSectionProps> = () => {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(
    () => cameraCaptureService.getStatus(),
  );
  const [isTracking, setIsTracking] = useState<boolean>(
    () => activityEventTracker.isTracking(),
  );

  useEffect(() => {
    // Subscribe to live camera state updates emitted by cameraCaptureService.
    const unsubscribeCamera = cameraCaptureService.subscribeStatus((status) => {
      setCameraStatus(status);
    });

    // activityEventTracker.isTracking() is a synchronous accessor without a
    // subscribe API, so poll at 1-second intervals to keep the display in sync.
    const trackingInterval = window.setInterval(() => {
      setIsTracking(activityEventTracker.isTracking());
    }, 1_000);

    return () => {
      unsubscribeCamera();
      window.clearInterval(trackingInterval);
    };
  }, []);

  const variant = cameraStateVariant(cameraStatus.state);
  const isActive = cameraStatus.state === 'active';
  const isError = variant === 'error';
  const needsPermissionGuidance =
    cameraStatus.state === 'permission_denied' ||
    cameraStatus.state === 'device_unavailable';

  return (
    <>
      {/* ----------------------------------------------------------------- */}
      {/* Camera Access                                                       */}
      {/* ----------------------------------------------------------------- */}
      <section
        className="card settings-group"
        aria-labelledby="privacy-camera-heading"
        data-testid="privacy-camera-section"
      >
        <div className="settings-group-heading">
          {isActive
            ? <Camera size={20} aria-hidden="true" />
            : <CameraOff size={20} aria-hidden="true" />}
          <div>
            <h2 id="privacy-camera-heading">Camera access</h2>
            <p>Current webcam status for local attention and posture detection.</p>
          </div>
        </div>

        {/* Status badge + description row */}
        <div className="privacy-status-row">
          <div
            className={`privacy-status-badge privacy-status-badge--${variant}`}
            role="status"
            aria-live="polite"
            aria-label={`Camera status: ${cameraStateLabel(cameraStatus.state)}`}
            data-testid="camera-status-badge"
            data-state={cameraStatus.state}
          >
            <span className="privacy-status-dot" aria-hidden="true" />
            <span>{cameraStateLabel(cameraStatus.state)}</span>
          </div>
          <p
            className="privacy-status-description"
            role={isError ? 'alert' : undefined}
            data-testid="camera-status-description"
          >
            {cameraStateDescription(cameraStatus)}
          </p>
        </div>

        {/* Actionable guidance for error states that need OS-level remediation */}
        {needsPermissionGuidance && (
          <div className="privacy-guidance-note privacy-guidance-note--warning" role="note">
            <ShieldAlert size={14} aria-hidden="true" />
            <span>
              Granting camera permission in your OS settings alone is not sufficient —
              you must also re-enable the camera from the{' '}
              <strong>Focus Session</strong> page.
            </span>
          </div>
        )}

        {cameraStatus.state === 'inactive' && (
          <p className="settings-privacy-note">
            Camera access is not active. To use attention and posture detection,
            open <strong>Focus Session</strong> and press{' '}
            <em>Enable camera</em>. No camera access is initiated from this
            settings screen.
          </p>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Session Tracking                                                    */}
      {/* ----------------------------------------------------------------- */}
      <section
        className="card settings-group"
        aria-labelledby="privacy-tracking-heading"
        data-testid="privacy-tracking-section"
      >
        <div className="settings-group-heading">
          {isTracking
            ? <Eye size={20} aria-hidden="true" />
            : <EyeOff size={20} aria-hidden="true" />}
          <div>
            <h2 id="privacy-tracking-heading">Session tracking</h2>
            <p>Activity-signal recording during a running focus session.</p>
          </div>
        </div>

        <div className="privacy-status-row">
          <div
            className={`privacy-status-badge privacy-status-badge--${isTracking ? 'active' : 'inactive'}`}
            role="status"
            aria-live="polite"
            aria-label={`Session tracking: ${isTracking ? 'active' : 'inactive'}`}
            data-testid="tracking-status-badge"
          >
            <span className="privacy-status-dot" aria-hidden="true" />
            <span>{isTracking ? 'Active' : 'Inactive'}</span>
          </div>
          <p
            className="privacy-status-description"
            data-testid="tracking-status-description"
          >
            {isTracking
              ? 'Activity signals (person presence, screen-facing direction, posture) are being recorded for the current focus session. All signal data stays on this device.'
              : 'Session tracking is inactive. It starts automatically when the focus timer starts — provided the camera is enabled — and stops when the session ends.'}
          </p>
        </div>

        <p className="settings-privacy-note">
          Tracking is driven by the focus-session timer and cannot be toggled
          independently. Disabling the camera from the Focus Session page prevents
          new detection signals from being recorded. Unknown or unavailable
          detection results are not stored as confirmed activity events.
        </p>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Privacy Information                                                 */}
      {/* ----------------------------------------------------------------- */}
      <section
        className="card settings-group"
        aria-labelledby="privacy-info-heading"
        data-testid="privacy-info-section"
      >
        <div className="settings-group-heading">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <h2 id="privacy-info-heading">How FocusLens handles your data</h2>
            <p>Local-only processing — no external servers, no cloud uploads.</p>
          </div>
        </div>

        <ul className="privacy-info-list" role="list">
          <li>
            <strong>Camera frames</strong> — processed entirely on this device by
            a local computer-vision pipeline (OpenCV / MediaPipe via a headless
            Python process). Raw frames are not saved, transmitted, or accessible
            outside the CV process.
          </li>
          <li>
            <strong>Derived activity signals</strong> — high-level detections
            (person presence, screen-facing direction, posture) are received by
            the UI and stored in a local SQLite database on this device. No raw
            frame data is written to the database.
          </li>
          <li>
            <strong>Session history</strong> — focus session records are kept on
            this device for the duration configured under{' '}
            <em>Session history retention</em>. Session data does not leave this
            device.
          </li>
          <li>
            <strong>No accounts or cloud sync</strong> — FocusLens does not
            transmit any user data to external servers. All processing and storage
            is local.
          </li>
          <li className="privacy-info-list__limitation">
            <Info
              size={13}
              aria-hidden="true"
              style={{ verticalAlign: 'middle', marginRight: '4px', flexShrink: 0 }}
            />
            <span>
              <strong>Limitation</strong> — the local CV pipeline has not been
              independently audited. If you have specific privacy requirements,
              review the open-source implementation before use.
            </span>
          </li>
        </ul>
      </section>
    </>
  );
};
