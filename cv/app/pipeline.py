"""
FocusLens — CV Pipeline
========================
Orchestrates one complete frame-processing cycle:

    CameraService  →  FrameProcessor  →  DevPreview (optional)

The pipeline owns the main capture loop and is the only place that
knows how all services connect together.

Future integration points
--------------------------
When Phase 7 (Tauri integration) begins, the pipeline will also:
    * Accept commands from the Tauri IPC layer (start / stop).
    * Send ``FrameResult`` data back to the Tauri layer instead of
      (or in addition to) showing the dev preview.

Day 04 scope
------------
Headless mode (``SHOW_DEV_PREVIEW = False``) runs the capture loop
without displaying anything — useful for background/integrated use.
"""

from __future__ import annotations

import time

from typing import Optional, TYPE_CHECKING
from config import SHOW_DEV_PREVIEW, TARGET_FPS
from services.camera_service import CameraService, CameraError
from services.frame_processor import FrameProcessor
from utils.logger import get_logger

if TYPE_CHECKING:
    from app.dev_preview import DevPreview

log = get_logger(__name__)

# Minimum seconds to wait between frames so we don't spin at 100 % CPU.
_MIN_FRAME_INTERVAL: float = 1.0 / TARGET_FPS if TARGET_FPS > 0 else 0.0


class CVPipeline:
    """
    Runs the FocusLens local computer-vision pipeline.

    The pipeline is intentionally kept simple:

    1. Open the camera.
    2. Loop:
       a. Read a frame.
       b. Process the frame (``FrameProcessor``).
       c. Show the dev preview (if enabled).
       d. Sleep just long enough to approach the target FPS.
    3. On exit (user quit, error, or external stop signal):
       * Release the camera.
       * Close the preview window.

    Usage::

        pipeline = CVPipeline()
        pipeline.run()   # blocks until the user quits

    Call ``pipeline.stop()`` from another thread to request a clean stop.
    """

    def __init__(self) -> None:
        self._camera = CameraService()
        self._processor = FrameProcessor()
        self._running = False

        # DevPreview is imported lazily so the module can be used even
        # if an OpenCV GUI is not available (e.g. headless CI).
        self._preview: Optional['DevPreview'] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self) -> None:
        """
        Start the capture loop.

        Blocks until:
            * The user presses Q in the preview window.
            * The preview window is closed.
            * ``stop()`` is called from another thread.
            * A non-recoverable camera error occurs.
        """
        log.info("=" * 55)
        log.info("FocusLens — CV Pipeline starting (Day 04)")
        log.info("Privacy: all processing is LOCAL — no data leaves this machine.")
        log.info("=" * 55)

        try:
            self._open_camera()
            self._setup_preview()
            self._running = True
            self._capture_loop()
        except CameraError as exc:
            log.error("Camera error: %s", exc)
        except KeyboardInterrupt:
            log.info("KeyboardInterrupt received — stopping.")
        finally:
            self._teardown()

    def stop(self) -> None:
        """
        Request the pipeline to stop after the current frame.

        Thread-safe: the capture loop checks ``self._running`` each iteration.
        """
        log.info("Stop requested.")
        self._running = False

    # ------------------------------------------------------------------
    # Private — setup & teardown
    # ------------------------------------------------------------------

    def _open_camera(self) -> None:
        """Open the webcam; propagates ``CameraError`` if it fails."""
        self._camera.open()

    def _setup_preview(self) -> None:
        """Create the dev-preview window if previewing is enabled."""
        if SHOW_DEV_PREVIEW:
            from app.dev_preview import DevPreview
            self._preview = DevPreview()

    def _teardown(self) -> None:
        """Release all resources regardless of how the loop exited."""
        self._running = False
        self._camera.release()
        if self._preview is not None:
            self._preview.close()
            self._preview = None
        log.info("CV pipeline stopped cleanly.")

    # ------------------------------------------------------------------
    # Private — capture loop
    # ------------------------------------------------------------------

    def _capture_loop(self) -> None:
        """
        The inner frame-capture loop.

        Each iteration:
            1. Record the start time.
            2. Read one frame from the camera.
            3. Process the frame.
            4. Update the dev preview.
            5. Sleep if we finished faster than the target FPS.
        """
        log.info("Capture loop started. Target FPS: %d.", TARGET_FPS)

        while self._running:
            iter_start = time.perf_counter()

            # --- Capture ---
            try:
                camera_frame = self._camera.read_frame()
            except CameraError as exc:
                log.error("Frame read failed: %s", exc)
                break

            # --- Process ---
            frame_result = self._processor.process(camera_frame)

            # --- Preview ---
            if self._preview is not None:
                self._preview.show(frame_result)
                if self._preview.quit_requested():
                    log.info("Preview quit signal received.")
                    break

            # --- Frame-rate throttle ---
            elapsed = time.perf_counter() - iter_start
            sleep_for = _MIN_FRAME_INTERVAL - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)
