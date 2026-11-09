/**
 * FocusLens — Computer Vision Service (Day 24)
 * ============================================
 * Provides the application-level abstraction layer for the native CV pipeline.
 * Manages pipeline lifecycle (start / stop), subscription to derived activity
 * signals, status monitoring, and integration with the activity event tracker.
 *
 * Privacy Guarantees:
 * - Operates entirely on-device (local webcam -> local OpenCV/MediaPipe -> local Tauri -> UI).
 * - Downsized frames are forwarded only through local Tauri IPC and are never persisted or networked.
 * - Only high-level, derived detection metadata (presence, screen-facing, posture)
 *   is received and processed.
 */

import { isTauri } from '@tauri-apps/api/core';
import { focusLensService } from './focusLensService.ts';
import type {
  ActivitySignal,
  CameraStatus,
  CvPipelineStatus,
  CvResponse,
  LiveCameraFrame,
  ServiceEvent,
  Unsubscribe,
} from './contracts.ts';
import {
  activityEventTracker,
  type ActivityEventTrackerService,
} from './activityEventTracker.service.ts';

export interface CvServiceState {
  running: boolean;
  lastStatusMessage: string | null;
  lastSignal: ActivitySignal | null;
  error: string | null;
}

export class CvService {
  private readonly native: typeof focusLensService;
  private readonly availability: () => boolean;

  constructor(
    native: typeof focusLensService = focusLensService,
    availability: () => boolean = isTauri,
  ) {
    this.native = native;
    this.availability = availability;
  }

  private running = false;
  private lastStatusMessage: string | null = null;
  private lastSignal: ActivitySignal | null = null;
  private error: string | null = null;
  private readonly listeners = new Set<(state: CvServiceState) => void>();
  private unsubscribeSignals: Unsubscribe | null = null;
  private unsubscribeStatus: Unsubscribe | null = null;
  private lastFrameSubmittedAt = 0;
  private frameSubmissionPending = false;
  private frameSubmissionFailed = false;
  private recoveryPromise: Promise<CvPipelineStatus> | null = null;
  private consecutiveRecoveryAttempts = 0;
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;

  /**
   * Check whether the native desktop CV environment is available.
   */
  public isAvailable(): boolean {
    return this.availability();
  }

  /**
   * Current running state of the CV pipeline.
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Snapshot of the current CV service state.
   */
  public getState(): CvServiceState {
    return {
      running: this.running,
      lastStatusMessage: this.lastStatusMessage,
      lastSignal: this.lastSignal,
      error: this.error,
    };
  }

  /**
   * Subscribe to state updates of the CV service.
   */
  public subscribeState(listener: (state: CvServiceState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  /**
   * Start the native computer vision pipeline.
   * Spawns the headless Python process and binds event listeners.
   */
  public async start(): Promise<CvPipelineStatus> {
    if (!this.isAvailable()) {
      const msg = 'CV pipeline requires native desktop runtime (Tauri).';
      this.updateState({ error: msg });
      return { running: false, message: msg };
    }

    try {
      // Set up listeners for pipeline events if not already established
      await this.ensureEventListeners();

      const result = await this.native.cv.start();
      this.running = result.running;
      this.frameSubmissionPending = false;
      this.frameSubmissionFailed = false;
      this.lastStatusMessage = result.message;
      this.error = null;
      this.notifyListeners();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.running = false;
      this.frameSubmissionPending = false;
      this.error = message;
      this.notifyListeners();
      throw err;
    }
  }

  /**
   * Stop the native computer vision pipeline.
   * Terminates the background Python subprocess.
   */
  public async stop(): Promise<CvPipelineStatus> {
    if (!this.isAvailable()) {
      this.running = false;
      this.notifyListeners();
      return { running: false, message: 'CV pipeline stopped (non-desktop environment).' };
    }

    try {
      const result = await this.native.cv.stop();
      this.running = false;
      this.lastFrameSubmittedAt = 0;
      this.frameSubmissionFailed = false;
      this.lastStatusMessage = result.message;
      this.notifyListeners();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error = message;
      this.notifyListeners();
      throw err;
    }
  }

  /**
   * Forward a throttled, downsized JPEG frame to the local Python CV process.
   * The original MediaStream and uncompressed frame remain in the webview.
   */
  public async submitFrame(frame: LiveCameraFrame): Promise<void> {
    if (
      !this.running
      || !this.isAvailable()
      || this.frameSubmissionPending
      || this.frameSubmissionFailed
    ) {
      return;
    }
    if (frame.capturedAt - this.lastFrameSubmittedAt < 200) {
      return;
    }

    this.frameSubmissionPending = true;
    this.lastFrameSubmittedAt = frame.capturedAt;
    try {
      const scale = Math.min(1, 640 / frame.width, 480 / frame.height);
      const width = Math.max(1, Math.round(frame.width * scale));
      const height = Math.max(1, Math.round(frame.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to prepare a local camera frame for CV processing.');
      }
      context.drawImage(frame.data, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      const separator = dataUrl.indexOf(',');
      if (separator < 0) {
        throw new Error('Unable to encode the local camera frame as JPEG.');
      }
      const jpegBase64 = dataUrl.slice(separator + 1);
      if (jpegBase64.length > 512 * 1024) {
        throw new Error('The encoded camera frame exceeds the desktop processing limit.');
      }

      await this.native.cv.processFrame({
        frameIndex: frame.frameIndex,
        width,
        height,
        jpegBase64,
      });
    } catch (error) {
      this.frameSubmissionFailed = true;
      this.running = false;
      this.error = error instanceof Error ? error.message : String(error);
      this.notifyListeners();
      throw error;
    } finally {
      this.frameSubmissionPending = false;
    }
  }

  /**
   * Query current camera / pipeline status.
   */
  public async getCameraStatus(): Promise<CameraStatus> {
    return this.native.camera.getStatus();
  }

  /**
   * Perform one bounded, de-duplicated recovery attempt.  The caller controls
   * when restoration is appropriate (for example after the camera returns).
   */
  public recover(): Promise<CvPipelineStatus> {
    if (this.running) {
      return Promise.resolve({ running: true, message: 'CV pipeline is already active.' });
    }
    if (this.recoveryPromise) return this.recoveryPromise;
    if (this.consecutiveRecoveryAttempts >= CvService.MAX_RECOVERY_ATTEMPTS) {
      return Promise.reject(new Error('CV recovery limit reached. Start a new session to retry.'));
    }
    this.consecutiveRecoveryAttempts += 1;
    this.frameSubmissionPending = false;
    this.frameSubmissionFailed = false;
    this.recoveryPromise = this.start().finally(() => {
      this.recoveryPromise = null;
    });
    return this.recoveryPromise;
  }

  public resetRecoveryBudget(): void {
    this.consecutiveRecoveryAttempts = 0;
  }

  /**
   * Subscribe to raw activity signal events from native CV.
   */
  public async subscribeSignals(
    handler: (event: ServiceEvent<ActivitySignal>) => void,
  ): Promise<Unsubscribe> {
    return this.native.activity.subscribe(handler);
  }

  /**
   * Subscribe to status / error events from native CV.
   */
  public async subscribeCvResponses(
    handler: (event: ServiceEvent<CvResponse>) => void,
  ): Promise<Unsubscribe> {
    return this.native.cv.subscribe(handler);
  }

  /**
   * Pipe native activity signals directly into the ActivityEventTracker.
   */
  public async connectToEventTracker(
    tracker: ActivityEventTrackerService = activityEventTracker,
  ): Promise<Unsubscribe> {
    return this.native.activity.connectToEventTracker(tracker);
  }

  /**
   * Teardown subscriptions and reset service state.
   */
  public teardown(): void {
    this.unsubscribeSignals?.();
    this.unsubscribeStatus?.();
    this.unsubscribeSignals = null;
    this.unsubscribeStatus = null;
    this.listeners.clear();
    this.running = false;
    this.lastSignal = null;
    this.error = null;
    this.lastFrameSubmittedAt = 0;
    this.frameSubmissionPending = false;
    this.frameSubmissionFailed = false;
    this.recoveryPromise = null;
    this.consecutiveRecoveryAttempts = 0;
  }

  private async ensureEventListeners(): Promise<void> {
    if (!this.unsubscribeSignals) {
      this.unsubscribeSignals = await this.native.activity.subscribe((event) => {
        if (event.payload) {
          this.lastSignal = event.payload;
          this.notifyListeners();
        }
      });
    }

    if (!this.unsubscribeStatus) {
      this.unsubscribeStatus = await this.native.cv.subscribe((event) => {
        if (event.payload) {
          if (event.payload.status === 'failed' || event.payload.status === 'unavailable') {
            this.running = false;
            this.frameSubmissionPending = false;
            this.frameSubmissionFailed = false;
            this.error = event.payload.error?.message ?? `CV status: ${event.payload.status}`;
            this.notifyListeners();
          } else if (event.payload.status === 'completed') {
            this.running = true;
            this.consecutiveRecoveryAttempts = 0;
            this.error = null;
            this.notifyListeners();
          }
        }
      });
    }
  }

  private updateState(partial: Partial<CvServiceState>): void {
    if (partial.running !== undefined) this.running = partial.running;
    if (partial.lastStatusMessage !== undefined) this.lastStatusMessage = partial.lastStatusMessage;
    if (partial.lastSignal !== undefined) this.lastSignal = partial.lastSignal;
    if (partial.error !== undefined) this.error = partial.error;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in CvService listener:', err);
      }
    });
  }
}

export const cvService = new CvService();
