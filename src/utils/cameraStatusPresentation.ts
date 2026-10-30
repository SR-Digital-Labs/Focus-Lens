/**
 * FocusLens — Camera Status Presentation Utilities (Day 29)
 * ==========================================================
 * Pure, side-effect-free helper functions that map CameraState / CameraStatus
 * values to human-readable labels, descriptions, and badge variants.
 *
 * Kept in a separate .ts file (no JSX) so they can be imported by both the
 * React component and the Node.js test suite without a JSX transform.
 */

import type { CameraState, CameraStatus } from '../services/contracts';

export type CameraStatusVariant = 'active' | 'inactive' | 'error' | 'warning';

/**
 * Returns a concise, human-readable label for a given CameraState value.
 * Suitable for use in a status badge or aria-label.
 */
export function cameraStateLabel(state: CameraState): string {
  switch (state) {
    case 'active':                return 'Active';
    case 'inactive':              return 'Inactive';
    case 'starting':
    case 'requesting':            return 'Starting\u2026';
    case 'permission_denied':     return 'Permission denied';
    case 'device_unavailable':    return 'No camera found';
    case 'initialization_failed': return 'Initialization failed';
    case 'device_in_use':         return 'Camera in use';
    case 'frame_error':           return 'Frame error';
    case 'unavailable':           return 'Unavailable';
    case 'error':                 return 'Error';
    case 'unknown':
    default:                      return 'Unknown';
  }
}

/**
 * Returns a plain-language description of the given CameraStatus.
 * Uses status.message when the service provides one (e.g. for permission_denied
 * or device_in_use states that carry OS-specific context).
 */
export function cameraStateDescription(status: CameraStatus): string {
  switch (status.state) {
    case 'active':
      return 'The webcam is streaming frames locally for attention and posture analysis. All processing happens on this device.';
    case 'inactive':
      return 'The camera is not currently active. To enable it, open the Focus Session page and press the camera enable button.';
    case 'starting':
    case 'requesting':
      return 'Camera access is being requested from the operating system. An OS permission prompt may appear.';
    case 'permission_denied':
      return (
        status.message ??
        'Camera access was denied. Allow camera access in OS or app settings, then re-enable it from the Focus Session page.'
      );
    case 'device_unavailable':
      return status.message ?? 'No compatible webcam was found on this device.';
    case 'initialization_failed':
      return status.message ?? 'The camera could not be initialized. Restarting the app may resolve this.';
    case 'device_in_use':
      return (
        status.message ??
        'The webcam appears to be in use by another application. Close the other app, then retry from the Focus Session page.'
      );
    case 'frame_error':
      return (
        status.message ??
        'The camera stopped providing frames. Disable and re-enable it from the Focus Session page.'
      );
    case 'unavailable':
      return 'Camera features require the native desktop runtime (Tauri) and are not available in this environment.';
    case 'error':
      return status.message ?? 'An unexpected camera error occurred.';
    case 'unknown':
    default:
      return 'Camera status has not been determined yet. This resolves once a camera action is taken from the Focus Session page.';
  }
}

/**
 * Maps a CameraState to a visual badge variant for the privacy-status-badge CSS modifier.
 *
 * active   → green   — camera is delivering frames
 * inactive → muted   — camera is off or status unknown; not an error
 * error    → red     — a hard error that prevents use (permission denied, device missing, etc.)
 * warning  → amber   — a transient state (starting) or environmental mismatch (unavailable)
 */
export function cameraStateVariant(state: CameraState): CameraStatusVariant {
  switch (state) {
    case 'active':
      return 'active';
    case 'inactive':
    case 'unknown':
      return 'inactive';
    case 'permission_denied':
    case 'device_unavailable':
    case 'initialization_failed':
    case 'device_in_use':
    case 'frame_error':
    case 'error':
      return 'error';
    case 'starting':
    case 'requesting':
    case 'unavailable':
      return 'warning';
  }
}
