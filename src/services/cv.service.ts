/**
 * FocusLens — Computer Vision Service (Day 24)
 * ============================================
 * Provides the application-level abstraction layer for the native CV pipeline.
 * Manages pipeline lifecycle (start / stop), subscription to derived activity
 * signals, status monitoring, and integration with the activity event tracker.
 *
 * Privacy Guarantees:
 * - Operates entirely on-device (local webcam -> local OpenCV/MediaPipe -> local Tauri -> UI).
 * - Raw frames never leave the Python CV process.
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
  private running = false;
  private lastStatusMessage: string | null = null;
  private lastSignal: ActivitySignal | null = null;
  private error: string | null = null;
  private readonly listeners = new Set<(state: CvServiceState) => void>();
  private unsubscribeSignals: Unsubscribe | null = null;
  private unsubscribeStatus: Unsubscribe | null = null;

  /**
   * Check whether the native desktop CV environment is available.
   */
  public isAvailable(): boolean {
    return isTauri();
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

      const result = await focusLensService.cv.start();
      this.running = result.running;
      this.lastStatusMessage = result.message;
      this.error = null;
      this.notifyListeners();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.running = false;
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
      const result = await focusLensService.cv.stop();
      this.running = false;
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
   * Query current camera / pipeline status.
   */
  public async getCameraStatus(): Promise<CameraStatus> {
    return focusLensService.camera.getStatus();
  }

  /**
   * Subscribe to raw activity signal events from native CV.
   */
  public async subscribeSignals(
    handler: (event: ServiceEvent<ActivitySignal>) => void,
  ): Promise<Unsubscribe> {
    return focusLensService.activity.subscribe(handler);
  }

  /**
   * Subscribe to status / error events from native CV.
   */
  public async subscribeCvResponses(
    handler: (event: ServiceEvent<CvResponse>) => void,
  ): Promise<Unsubscribe> {
    return focusLensService.cv.subscribe(handler);
  }

  /**
   * Pipe native activity signals directly into the ActivityEventTracker.
   */
  public async connectToEventTracker(
    tracker: ActivityEventTrackerService = activityEventTracker,
  ): Promise<Unsubscribe> {
    return focusLensService.activity.connectToEventTracker(tracker);
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
  }

  private async ensureEventListeners(): Promise<void> {
    if (!this.unsubscribeSignals) {
      this.unsubscribeSignals = await focusLensService.activity.subscribe((event) => {
        if (event.payload) {
          this.lastSignal = event.payload;
          this.notifyListeners();
        }
      });
    }

    if (!this.unsubscribeStatus) {
      this.unsubscribeStatus = await focusLensService.cv.subscribe((event) => {
        if (event.payload) {
          if (event.payload.status === 'failed' || event.payload.status === 'unavailable') {
            this.error = event.payload.error?.message ?? `CV status: ${event.payload.status}`;
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
