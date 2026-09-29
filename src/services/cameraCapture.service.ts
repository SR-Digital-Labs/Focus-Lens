import type { CameraStatus, LiveCameraFrame, Unsubscribe } from './contracts';

type FrameCallback = (frame: LiveCameraFrame) => void;
type VideoFrameMetadata = { width: number; height: number };
type VideoWithFrameCallbacks = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadata) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const FRAME_STALL_TIMEOUT_MS = 4_000;
const FIRST_FRAME_TIMEOUT_MS = 8_000;

class CameraCaptureService {
  private status: CameraStatus = { state: 'inactive' };
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frameRequest: number | null = null;
  private frameRequestUsesVideoCallback = false;
  private watchdog: number | null = null;
  private firstFrameTimeout: number | null = null;
  private firstFrameResolver: (() => void) | null = null;
  private firstFrameReject: ((reason: Error) => void) | null = null;
  private trackEndedHandler: (() => void) | null = null;
  private lastFrameAt = 0;
  private lastMediaTime = -1;
  private frameIndex = 0;
  private generation = 0;
  private startPromise: Promise<void> | null = null;
  private readonly statusListeners = new Set<(status: CameraStatus) => void>();
  private readonly frameListeners = new Set<FrameCallback>();

  getStatus(): CameraStatus {
    return this.status;
  }

  subscribeStatus(listener: (status: CameraStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  subscribeFrames(listener: FrameCallback): Unsubscribe {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  startCapture(video: HTMLVideoElement): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.status.state === 'active' && this.video === video) return Promise.resolve();

    const generation = ++this.generation;
    this.setStatus({ state: 'starting', message: 'Requesting camera access.' });
    this.startPromise = this.openCapture(video, generation).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  stopCapture(): void {
    this.generation += 1;
    this.releaseResources();
    this.setStatus({ state: 'inactive' });
  }

  private async openCapture(video: HTMLVideoElement, generation: number): Promise<void> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by this runtime.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;
      this.video = video;
      this.frameIndex = 0;
      this.lastMediaTime = -1;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      this.trackEndedHandler = () => this.failForStoppedStream();
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', this.trackEndedHandler as EventListener, { once: true });
      });

      await video.play();
      if (generation !== this.generation) return;

      this.scheduleFrame(generation);
      await new Promise<void>((resolve, reject) => {
        this.firstFrameResolver = resolve;
        this.firstFrameReject = reject;
        this.firstFrameTimeout = window.setTimeout(() => {
          this.firstFrameTimeout = null;
          this.firstFrameResolver = null;
          this.firstFrameReject = null;
          reject(new Error('The camera opened but did not provide a video frame.'));
        }, FIRST_FRAME_TIMEOUT_MS);
      });
      if (generation !== this.generation) return;

      this.watchdog = window.setInterval(() => {
        if (performance.now() - this.lastFrameAt > FRAME_STALL_TIMEOUT_MS) {
          this.failForStoppedStream();
        }
      }, 1_000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.releaseResources();
      this.setStatus(this.statusForInitializationError(error));
    }
  }

  private scheduleFrame(generation: number): void {
    const video = this.video as VideoWithFrameCallbacks | null;
    if (!video || generation !== this.generation) return;

    if (video.requestVideoFrameCallback) {
      this.frameRequestUsesVideoCallback = true;
      this.frameRequest = video.requestVideoFrameCallback((_now, metadata) => {
        this.publishFrame(metadata.width, metadata.height);
        this.scheduleFrame(generation);
      });
      return;
    }

    this.frameRequestUsesVideoCallback = false;
    this.frameRequest = window.requestAnimationFrame(() => {
      if (video.currentTime !== this.lastMediaTime) {
        this.lastMediaTime = video.currentTime;
        this.publishFrame(video.videoWidth, video.videoHeight);
      }
      this.scheduleFrame(generation);
    });
  }

  private publishFrame(width: number, height: number): void {
    const video = this.video;
    if (!video || width <= 0 || height <= 0) return;

    this.lastFrameAt = performance.now();
    const frame: LiveCameraFrame = {
      data: video,
      frameIndex: this.frameIndex++,
      capturedAt: Date.now(),
      width,
      height,
    };

    if (this.status.state !== 'active') {
      this.setStatus({ state: 'active', message: 'Camera is delivering live frames.' });
      if (this.firstFrameTimeout !== null) {
        window.clearTimeout(this.firstFrameTimeout);
        this.firstFrameTimeout = null;
      }
      this.firstFrameResolver?.();
      this.firstFrameResolver = null;
      this.firstFrameReject = null;
    }

    this.frameListeners.forEach((listener) => {
      try {
        listener(frame);
      } catch {
        // One consumer must not interrupt frame delivery to other listeners.
      }
    });
  }

  private failForStoppedStream(): void {
    this.generation += 1;
    this.releaseResources();
    this.setStatus({
      state: 'frame_error',
      reason: 'frame_stopped',
      message: 'The camera stopped providing frames. Disable and retry the camera.',
    });
  }

  private statusForInitializationError(error: unknown): CameraStatus {
    const name = error instanceof DOMException ? error.name : '';
    const message = error instanceof Error ? error.message : 'Camera initialization failed.';

    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        state: 'permission_denied',
        reason: 'permission_denied',
        message: 'Camera access was denied. Allow camera access in system or app settings, then retry.',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      return {
        state: 'device_unavailable',
        reason: 'device_unavailable',
        message: 'No compatible webcam was found.',
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        state: 'device_in_use',
        reason: 'device_in_use',
        message: 'The webcam could not be opened. It may be in use by another application.',
      };
    }
    return { state: 'initialization_failed', reason: 'initialization_failed', message };
  }

  private releaseResources(): void {
    if (this.frameRequest !== null) {
      if (this.frameRequestUsesVideoCallback) {
        (this.video as VideoWithFrameCallbacks | null)?.cancelVideoFrameCallback?.(this.frameRequest);
      } else {
        window.cancelAnimationFrame(this.frameRequest);
      }
      this.frameRequest = null;
    }
    if (this.watchdog !== null) {
      window.clearInterval(this.watchdog);
      this.watchdog = null;
    }
    if (this.firstFrameTimeout !== null) {
      window.clearTimeout(this.firstFrameTimeout);
      this.firstFrameTimeout = null;
    }
    const rejectPendingStart = this.firstFrameReject;
    this.firstFrameReject = null;
    this.firstFrameResolver = null;
    rejectPendingStart?.(new Error('Camera capture stopped before the first frame arrived.'));

    this.stream?.getVideoTracks().forEach((track) => {
      if (this.trackEndedHandler) {
        track.removeEventListener('ended', this.trackEndedHandler as EventListener);
      }
      track.stop();
    });
    this.stream = null;

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
    this.trackEndedHandler = null;
  }

  private setStatus(status: CameraStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export const cameraCaptureService = new CameraCaptureService();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => cameraCaptureService.stopCapture());
}