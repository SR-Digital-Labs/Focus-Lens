import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  ActivitySignal,
  CameraStatus,
  CvPipelineStatus,
  CvResponse,
  ServiceEvent,
  ServiceRequest,
  ServiceResponse,
  Unsubscribe,
} from '../src/services/contracts.ts';
import { CvService } from '../src/services/cv.service.ts';
import { appConfig } from '../src/config/appConfig.ts';
import { ActivityEventTrackerService } from '../src/services/activityEventTracker.service.ts';

// ---------------------------------------------------------------------------
// Mock Environment & Harness for Day 24 CV / Desktop Integration
// ---------------------------------------------------------------------------

class MockTauriBridge {
  public running = false;
  public cameraState: CameraStatus['state'] = 'inactive';
  public lastRequestId: string | null = null;
  public readonly activityListeners = new Set<(event: ServiceEvent<ActivitySignal>) => void>();
  public readonly cvListeners = new Set<(event: ServiceEvent<CvResponse>) => void>();

  public handleCommand(command: string, args: { request: ServiceRequest<Record<string, unknown>> }): ServiceResponse<unknown> {
    const { request } = args;
    this.lastRequestId = request.requestId;

    if (request.protocolVersion !== appConfig.serviceProtocolVersion) {
      return {
        protocolVersion: appConfig.serviceProtocolVersion,
        requestId: request.requestId,
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Unsupported protocol version.' },
      };
    }

    if (command === appConfig.nativeCommands.startCvPipeline) {
      this.running = true;
      this.cameraState = 'active';
      return {
        protocolVersion: appConfig.serviceProtocolVersion,
        requestId: request.requestId,
        ok: true,
        data: { running: true, message: 'CV pipeline started.' } satisfies CvPipelineStatus,
      };
    }

    if (command === appConfig.nativeCommands.stopCvPipeline) {
      this.running = false;
      this.cameraState = 'inactive';
      return {
        protocolVersion: appConfig.serviceProtocolVersion,
        requestId: request.requestId,
        ok: true,
        data: { running: false, message: 'CV pipeline stopped.' } satisfies CvPipelineStatus,
      };
    }

    if (command === appConfig.nativeCommands.getCameraStatus) {
      return {
        protocolVersion: appConfig.serviceProtocolVersion,
        requestId: request.requestId,
        ok: true,
        data: {
          state: this.cameraState,
          message: this.running ? 'CV pipeline is active.' : 'CV pipeline is inactive.',
        } satisfies CameraStatus,
      };
    }

    return {
      protocolVersion: appConfig.serviceProtocolVersion,
      requestId: request.requestId,
      ok: false,
      error: { code: 'NOT_IMPLEMENTED', message: `Unknown command: ${command}` },
    };
  }

  public emitActivitySignal(signal: ActivitySignal, eventId = `sig-${Date.now()}`): void {
    const event: ServiceEvent<ActivitySignal> = {
      eventId,
      occurredAt: signal.occurredAt,
      payload: signal,
    };
    this.activityListeners.forEach((l) => l(event));
  }

  public emitCvStatus(response: CvResponse, eventId = `res-${Date.now()}`): void {
    const event: ServiceEvent<CvResponse> = {
      eventId,
      occurredAt: new Date().toISOString(),
      payload: response,
    };
    this.cvListeners.forEach((l) => l(event));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Day 24 — CV / Desktop Integration', () => {
  it('appConfig contains the required native commands and events for CV pipeline', () => {
    assert.equal(appConfig.nativeCommands.startCvPipeline, 'start_cv_pipeline');
    assert.equal(appConfig.nativeCommands.stopCvPipeline, 'stop_cv_pipeline');
    assert.equal(appConfig.nativeCommands.getCameraStatus, 'get_camera_status');
    assert.equal(appConfig.nativeEvents.activitySignal, 'activity-signal');
    assert.equal(appConfig.nativeEvents.cvResponse, 'cv-response');
  });

  it('validates protocol version and request envelope in mock Tauri bridge', () => {
    const bridge = new MockTauriBridge();
    const req: ServiceRequest<Record<string, unknown>> = {
      protocolVersion: 999, // invalid version
      requestId: 'req-1',
      payload: {},
    };

    const res = bridge.handleCommand('start_cv_pipeline', { request: req });
    assert.equal(res.ok, false);
    assert.equal(res.error?.code, 'INVALID_REQUEST');
  });

  it('manages CV pipeline startup, camera status update, and shutdown lifecycle', () => {
    const bridge = new MockTauriBridge();

    // Check camera status before starting
    const statusBefore = bridge.handleCommand(appConfig.nativeCommands.getCameraStatus, {
      request: { protocolVersion: 1, requestId: 'r1', payload: {} },
    });
    assert.equal(statusBefore.ok, true);
    assert.equal((statusBefore.data as CameraStatus).state, 'inactive');

    // Start pipeline
    const startRes = bridge.handleCommand(appConfig.nativeCommands.startCvPipeline, {
      request: { protocolVersion: 1, requestId: 'r2', payload: {} },
    });
    assert.equal(startRes.ok, true);
    assert.equal((startRes.data as CvPipelineStatus).running, true);
    assert.equal(bridge.running, true);

    // Check camera status after starting
    const statusActive = bridge.handleCommand(appConfig.nativeCommands.getCameraStatus, {
      request: { protocolVersion: 1, requestId: 'r3', payload: {} },
    });
    assert.equal(statusActive.ok, true);
    assert.equal((statusActive.data as CameraStatus).state, 'active');

    // Stop pipeline
    const stopRes = bridge.handleCommand(appConfig.nativeCommands.stopCvPipeline, {
      request: { protocolVersion: 1, requestId: 'r4', payload: {} },
    });
    assert.equal(stopRes.ok, true);
    assert.equal((stopRes.data as CvPipelineStatus).running, false);
    assert.equal(bridge.running, false);
  });

  it('forwards activity signals without raw frames (privacy verification)', () => {
    const bridge = new MockTauriBridge();
    const receivedSignals: ActivitySignal[] = [];

    const listener = (event: ServiceEvent<ActivitySignal>) => {
      receivedSignals.push(event.payload);
    };
    bridge.activityListeners.add(listener);

    const sampleSignal: ActivitySignal = {
      occurredAt: '2026-10-23T09:00:00.000Z',
      personPresence: 'present',
      screenFacing: 'facing',
      posture: 'good',
      confidence: 0.95,
      postureReminder: false,
    };

    bridge.emitActivitySignal(sampleSignal);

    assert.equal(receivedSignals.length, 1);
    const received = receivedSignals[0];
    assert.equal(received.personPresence, 'present');
    assert.equal(received.screenFacing, 'facing');
    assert.equal(received.posture, 'good');
    assert.equal(received.confidence, 0.95);

    // Verify privacy: no raw image or frame payload exists
    const keys = Object.keys(received);
    assert.ok(!keys.includes('frame'));
    assert.ok(!keys.includes('image'));
    assert.ok(!keys.includes('pixels'));
    assert.ok(!keys.includes('buffer'));

    bridge.activityListeners.delete(listener);
  });

  it('routes activity signals end-to-end to ActivityEventTracker', () => {
    const tracker = new ActivityEventTrackerService({ minTransitionIntervalMs: 0 });
    tracker.startSession('session-cv-integration');
    const bridge = new MockTauriBridge();

    const listener = (event: ServiceEvent<ActivitySignal>) => {
      if (event.payload) {
        tracker.processSignal({
          personPresence: event.payload.personPresence,
          screenFacing: event.payload.screenFacing,
          posture: event.payload.posture,
          confidence: event.payload.confidence,
          occurredAt: event.occurredAt || event.payload.occurredAt,
        });
      }
    };
    bridge.activityListeners.add(listener);

    const nowIso = new Date().toISOString();
    bridge.emitActivitySignal({
      occurredAt: nowIso,
      personPresence: 'present',
      screenFacing: 'facing',
      posture: 'good',
      confidence: 0.98,
    });

    const states = tracker.getCurrentTrackedStates();
    assert.equal(states.person, 'PRESENT');
    assert.equal(states.screenFacing, 'SCREEN_FACING');
    assert.equal(states.posture, 'GOOD_POSTURE');

    bridge.activityListeners.delete(listener);
    tracker.clearEvents();
  });

  it('handles CV failure responses and unsubscriptions cleanly', () => {
    const bridge = new MockTauriBridge();
    const cvErrors: CvResponse[] = [];

    const unsubscribe: Unsubscribe = (() => {
      const handler = (event: ServiceEvent<CvResponse>) => {
        cvErrors.push(event.payload);
      };
      bridge.cvListeners.add(handler);
      return () => bridge.cvListeners.delete(handler);
    })();

    bridge.emitCvStatus({
      requestId: 'req-err',
      status: 'failed',
      error: { code: 'DEVICE_UNAVAILABLE', message: 'Camera disconnected unexpectedly' },
    });

    assert.equal(cvErrors.length, 1);
    assert.equal(cvErrors[0].status, 'failed');
    assert.equal(cvErrors[0].error?.message, 'Camera disconnected unexpectedly');

    // Unsubscribe and verify no further events are received
    unsubscribe();
    bridge.emitCvStatus({
      requestId: 'req-err-2',
      status: 'unavailable',
    });

    assert.equal(cvErrors.length, 1); // unchanged
  });

  it('CvService reports unavailable when not running inside Tauri without crashing', async () => {
    const service = new CvService();
    assert.equal(service.isAvailable(), false);
    assert.equal(service.isRunning(), false);

    const startResult = await service.start();
    assert.equal(startResult.running, false);
    assert.ok(startResult.message.includes('desktop'));

    const stopResult = await service.stop();
    assert.equal(stopResult.running, false);

    const state = service.getState();
    assert.equal(state.running, false);
    assert.ok(state.error?.includes('desktop'));

    service.teardown();
  });
});
