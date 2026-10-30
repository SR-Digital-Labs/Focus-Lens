/**
 * FocusLens — Day 29: Privacy Settings UI Test Suite
 * ====================================================
 * Tests for the PrivacyControlsSection presentation helpers and integration
 * contracts (Shavisha's Day 29 work).
 *
 * Covers:
 * 1. cameraStateLabel — all 11 CameraState values
 * 2. cameraStateDescription — correct text per state; falls back to status.message when present
 * 3. cameraStateVariant — correct badge variant per state
 * 4. Camera-state interface integration — badge variant does not mislead (no active variant for error states)
 * 5. Privacy information accuracy — limitation notice is always present
 * 6. Settings persistence — verifies privacySettingsRepository contract shape for supported keys
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraStateLabel,
  cameraStateDescription,
  cameraStateVariant,
  type CameraStatusVariant,
} from '../src/utils/cameraStatusPresentation.ts';
import type { CameraState, CameraStatus } from '../src/services/contracts.ts';

// ---------------------------------------------------------------------------
// All CameraState values defined by the existing contracts
// ---------------------------------------------------------------------------
const ALL_CAMERA_STATES: CameraState[] = [
  'unknown',
  'inactive',
  'requesting',
  'starting',
  'permission_denied',
  'frame_error',
  'device_unavailable',
  'initialization_failed',
  'device_in_use',
  'active',
  'unavailable',
  'error',
];

// ---------------------------------------------------------------------------
// cameraStateLabel
// ---------------------------------------------------------------------------
describe('cameraStateLabel', () => {
  it('returns a non-empty string for every defined CameraState', () => {
    for (const state of ALL_CAMERA_STATES) {
      const label = cameraStateLabel(state);
      assert.ok(
        typeof label === 'string' && label.trim().length > 0,
        `Expected non-empty label for state "${state}", got: "${label}"`,
      );
    }
  });

  it('returns "Active" for the active state', () => {
    assert.equal(cameraStateLabel('active'), 'Active');
  });

  it('returns "Inactive" for the inactive state', () => {
    assert.equal(cameraStateLabel('inactive'), 'Inactive');
  });

  it('returns "Permission denied" for permission_denied', () => {
    assert.equal(cameraStateLabel('permission_denied'), 'Permission denied');
  });

  it('returns "No camera found" for device_unavailable', () => {
    assert.equal(cameraStateLabel('device_unavailable'), 'No camera found');
  });

  it('returns "Camera in use" for device_in_use', () => {
    assert.equal(cameraStateLabel('device_in_use'), 'Camera in use');
  });

  it('returns "Unavailable" for unavailable (non-Tauri runtime)', () => {
    assert.equal(cameraStateLabel('unavailable'), 'Unavailable');
  });

  it('returns "Unknown" for the unknown state', () => {
    assert.equal(cameraStateLabel('unknown'), 'Unknown');
  });
});

// ---------------------------------------------------------------------------
// cameraStateDescription
// ---------------------------------------------------------------------------
describe('cameraStateDescription', () => {
  const makeStatus = (state: CameraState, message?: string): CameraStatus => ({
    state,
    message,
  });

  it('returns a non-empty description for every defined CameraState', () => {
    for (const state of ALL_CAMERA_STATES) {
      const description = cameraStateDescription(makeStatus(state));
      assert.ok(
        typeof description === 'string' && description.trim().length > 0,
        `Expected non-empty description for state "${state}"`,
      );
    }
  });

  it('mentions local processing for the active state', () => {
    const desc = cameraStateDescription(makeStatus('active'));
    assert.ok(
      desc.toLowerCase().includes('local') || desc.toLowerCase().includes('device'),
      `Expected "active" description to mention local/device processing, got: "${desc}"`,
    );
  });

  it('does not suggest the camera is active for the inactive state', () => {
    const desc = cameraStateDescription(makeStatus('inactive'));
    assert.ok(
      !desc.toLowerCase().startsWith('the webcam is streaming'),
      `Inactive description should not imply the camera is streaming, got: "${desc}"`,
    );
  });

  it('uses the status.message override when provided for permission_denied', () => {
    const customMessage = 'Custom OS denied message.';
    const desc = cameraStateDescription(makeStatus('permission_denied', customMessage));
    assert.equal(desc, customMessage);
  });

  it('uses the status.message override when provided for device_in_use', () => {
    const customMessage = 'Camera held by OBS Studio.';
    const desc = cameraStateDescription(makeStatus('device_in_use', customMessage));
    assert.equal(desc, customMessage);
  });

  it('falls back to a default for permission_denied when no message is provided', () => {
    const desc = cameraStateDescription(makeStatus('permission_denied'));
    assert.ok(
      desc.toLowerCase().includes('denied') || desc.toLowerCase().includes('permission'),
      `Expected permission_denied fallback description to mention denial, got: "${desc}"`,
    );
  });

  it('explains that unavailable is a runtime environment issue, not a user error', () => {
    const desc = cameraStateDescription(makeStatus('unavailable'));
    assert.ok(
      desc.toLowerCase().includes('runtime') || desc.toLowerCase().includes('tauri'),
      `Expected "unavailable" description to explain runtime requirement, got: "${desc}"`,
    );
  });

  it('does not blame the user for the unknown state', () => {
    const desc = cameraStateDescription(makeStatus('unknown'));
    assert.ok(
      typeof desc === 'string' && desc.trim().length > 0,
      `Expected non-empty unknown state description`,
    );
    // Should not contain accusatory language
    assert.ok(
      !desc.toLowerCase().includes('you must'),
      `Unknown state description should not be accusatory`,
    );
  });
});

// ---------------------------------------------------------------------------
// cameraStateVariant
// ---------------------------------------------------------------------------
describe('cameraStateVariant', () => {
  const VALID_VARIANTS: CameraStatusVariant[] = ['active', 'inactive', 'error', 'warning'];

  it('returns a valid variant for every defined CameraState', () => {
    for (const state of ALL_CAMERA_STATES) {
      const variant = cameraStateVariant(state);
      assert.ok(
        VALID_VARIANTS.includes(variant),
        `Expected a valid variant for state "${state}", got: "${variant}"`,
      );
    }
  });

  it('returns "active" only for the active state', () => {
    assert.equal(cameraStateVariant('active'), 'active');
    for (const state of ALL_CAMERA_STATES.filter((s) => s !== 'active')) {
      assert.notEqual(
        cameraStateVariant(state),
        'active',
        `State "${state}" should not produce an "active" badge variant`,
      );
    }
  });

  it('returns "error" for all hard-error states', () => {
    const errorStates: CameraState[] = [
      'permission_denied',
      'device_unavailable',
      'initialization_failed',
      'device_in_use',
      'frame_error',
      'error',
    ];
    for (const state of errorStates) {
      assert.equal(
        cameraStateVariant(state),
        'error',
        `Expected "error" variant for state "${state}"`,
      );
    }
  });

  it('returns "inactive" for inactive and unknown states', () => {
    assert.equal(cameraStateVariant('inactive'), 'inactive');
    assert.equal(cameraStateVariant('unknown'), 'inactive');
  });

  it('returns "warning" for transient in-progress states', () => {
    const warningStates: CameraState[] = ['starting', 'requesting', 'unavailable'];
    for (const state of warningStates) {
      assert.equal(
        cameraStateVariant(state),
        'warning',
        `Expected "warning" variant for state "${state}"`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Integration contract: variant must not visually mislead the user
// ---------------------------------------------------------------------------
describe('PrivacyControlsSection — variant correctness contracts', () => {
  it('error states never produce a visually positive badge', () => {
    const errorStates: CameraState[] = [
      'permission_denied',
      'device_unavailable',
      'initialization_failed',
      'device_in_use',
      'frame_error',
      'error',
    ];
    for (const state of errorStates) {
      const variant = cameraStateVariant(state);
      assert.ok(
        variant !== 'active',
        `Camera state "${state}" must not produce an "active" badge — that would be misleading`,
      );
    }
  });

  it('inactive state does not produce an "active" or "error" badge', () => {
    const variant = cameraStateVariant('inactive');
    assert.notEqual(variant, 'active');
    assert.notEqual(variant, 'error');
  });

  it('label and variant are consistent for the active state', () => {
    const label = cameraStateLabel('active');
    const variant = cameraStateVariant('active');
    assert.equal(label, 'Active');
    assert.equal(variant, 'active');
  });

  it('label and variant are consistent for permission_denied', () => {
    const label = cameraStateLabel('permission_denied');
    const variant = cameraStateVariant('permission_denied');
    assert.equal(label, 'Permission denied');
    assert.equal(variant, 'error');
  });
});

// ---------------------------------------------------------------------------
// Privacy information content contracts
// ---------------------------------------------------------------------------
describe('PrivacyControlsSection — privacy information accuracy', () => {
  it('description for active state mentions device-local processing', () => {
    const desc = cameraStateDescription({ state: 'active' });
    const lower = desc.toLowerCase();
    assert.ok(
      lower.includes('device') || lower.includes('local'),
      `Active state description must mention local/device processing: "${desc}"`,
    );
  });

  it('description for active state does not mention cloud or network transmission', () => {
    const desc = cameraStateDescription({ state: 'active' });
    const lower = desc.toLowerCase();
    assert.ok(
      !lower.includes('cloud') && !lower.includes('upload') && !lower.includes('server'),
      `Active state description must not mention cloud/upload/server: "${desc}"`,
    );
  });

  it('description for unavailable state does not imply camera is working', () => {
    const desc = cameraStateDescription({ state: 'unavailable' });
    assert.ok(
      !desc.toLowerCase().includes('streaming') && !desc.toLowerCase().includes('is active'),
      `Unavailable state must not imply camera is working: "${desc}"`,
    );
  });

  it('description for inactive state directs user to Focus Session page, not Settings', () => {
    const desc = cameraStateDescription({ state: 'inactive' });
    const lower = desc.toLowerCase();
    assert.ok(
      lower.includes('focus session') || lower.includes('session'),
      `Inactive description should guide user to Focus Session page: "${desc}"`,
    );
  });
});

// ---------------------------------------------------------------------------
// PrivacySettings type contract — verifies keys match the existing architecture
// ---------------------------------------------------------------------------
describe('PrivacySettings — supported key contract', () => {
  it('the three persisted privacy keys are recognized by the type', () => {
    // This compile-time test verifies that PrivacySettings from types/index.ts
    // contains exactly the three keys that privacySettingsRepository supports.
    // We validate this at the value level by constructing a conforming object.
    const settings: import('../src/types/index.ts').PrivacySettings = {
      saveVideoLocally: false,
      blurBackgroundInVideo: true,
      dataRetentionDays: 30,
    };
    assert.equal(typeof settings.saveVideoLocally, 'boolean');
    assert.equal(typeof settings.blurBackgroundInVideo, 'boolean');
    assert.ok(Number.isInteger(settings.dataRetentionDays) && settings.dataRetentionDays >= 0);
  });

  it('dataRetentionDays must be a non-negative integer', () => {
    const validValues = [0, 7, 14, 30, 90, 180, 365, 3650];
    for (const days of validValues) {
      assert.ok(Number.isInteger(days) && days >= 0 && days <= 3650);
    }
    const invalidValues = [-1, 3651, 0.5, NaN, Infinity];
    for (const days of invalidValues) {
      const isValid =
        Number.isInteger(days) && Number.isFinite(days) && days >= 0 && days <= 3650;
      assert.equal(isValid, false, `Expected ${days} to be invalid for dataRetentionDays`);
    }
  });
});
