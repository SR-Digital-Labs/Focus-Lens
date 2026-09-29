"""
FocusLens — Development Preview
=================================
Renders an OpenCV window showing the processed camera frame together
with a diagnostics overlay (FPS, frame count, detection states) and —
when enabled — the facial landmark dots from MediaPipe.

This module is a **development tool only**.

It will be removed or replaced by a proper Tauri/React UI when the
frontend is connected to the CV layer (planned for Phase 7, Day 23+).

Privacy note
------------
The preview window displays frames locally on the developer's screen.
No frames are saved, recorded, or transmitted.

Day 05 additions
----------------
* When ``SHOW_LANDMARK_OVERLAY`` is True and a face is detected, the
  478 facial landmark dots are drawn on the preview frame.
* The overlay is clearly a debug feature and can be disabled by setting
  ``SHOW_LANDMARK_OVERLAY = False`` in cv/config/settings.py.
"""

from __future__ import annotations

import time
from collections import deque
from typing import Any

import cv2

from config import (
    DEV_PREVIEW_WINDOW_TITLE,
    SHOW_OVERLAY_INFO,
    SHOW_LANDMARK_OVERLAY,
    OVERLAY_TEXT_COLOR,
    OVERLAY_TEXT_SCALE,
    OVERLAY_TEXT_THICKNESS,
)
from utils.logger import get_logger

log = get_logger(__name__)

# Key code returned by cv2.waitKey when the user presses 'q' or 'Q'.
_QUIT_KEY = ord("q")
_QUIT_KEY_UPPER = ord("Q")

# ---------------------------------------------------------------------------
# Landmark visualisation constants (development only)
# ---------------------------------------------------------------------------

# Colour of the landmark dots: BGR.
_LANDMARK_DOT_COLOR = (0, 200, 255)   # orange-yellow
_LANDMARK_DOT_RADIUS = 1
_LANDMARK_DOT_THICKNESS = -1          # filled circle

# Colour for the face-detected status badge.
_FACE_DETECTED_COLOR = (0, 255, 120)  # mint green
_FACE_NOT_FOUND_COLOR = (0, 120, 255) # amber


class DevPreview:
    """
    Manages an OpenCV ``namedWindow`` for development frame display.

    Usage::

        preview = DevPreview()
        preview.show(frame_result)   # call each iteration
        if preview.quit_requested():
            break
        preview.close()

    FPS is estimated from a rolling window of the last
    ``_FPS_SAMPLE_SIZE`` frame timestamps.
    """

    _FPS_SAMPLE_SIZE = 30  # number of recent frames used to estimate FPS

    def __init__(self) -> None:
        self._timestamps: deque[float] = deque(maxlen=self._FPS_SAMPLE_SIZE)
        self._quit = False
        cv2.namedWindow(DEV_PREVIEW_WINDOW_TITLE, cv2.WINDOW_NORMAL)
        log.info("Dev preview window opened. Press Q inside the window to quit.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def show(self, frame_result: Any) -> None:
        """
        Display ``frame_result.processed_frame`` in the preview window.

        If ``SHOW_LANDMARK_OVERLAY`` is True and a face is detected in
        ``frame_result.face_detection``, the 478 landmark dots are drawn.

        Args:
            frame_result: A :class:`~services.frame_processor.FrameResult`.
        """
        self._timestamps.append(time.perf_counter())
        display_frame = frame_result.processed_frame.copy()

        # --- Development: landmark dot overlay (Day 05) ---
        if SHOW_LANDMARK_OVERLAY:
            self._draw_landmarks(display_frame, frame_result)

        # --- Diagnostic text overlay ---
        if SHOW_OVERLAY_INFO:
            self._draw_overlay(display_frame, frame_result)

        cv2.imshow(DEV_PREVIEW_WINDOW_TITLE, display_frame)

        # waitKey(1) is required by OpenCV to refresh the window.
        # It also checks for keyboard input; 1 ms timeout keeps the loop fast.
        key = cv2.waitKey(1) & 0xFF
        if key in (_QUIT_KEY, _QUIT_KEY_UPPER):
            log.info("Quit key pressed — stopping dev preview.")
            self._quit = True

    def quit_requested(self) -> bool:
        """Return True if the user pressed Q or closed the window."""
        # Also check if the window was closed via the OS title-bar button.
        try:
            window_visible = cv2.getWindowProperty(
                DEV_PREVIEW_WINDOW_TITLE, cv2.WND_PROP_VISIBLE
            )
            if window_visible < 1:
                self._quit = True
        except cv2.error:
            self._quit = True

        return self._quit

    def close(self) -> None:
        """Destroy the preview window and release OpenCV GUI resources."""
        cv2.destroyAllWindows()
        log.info("Dev preview window closed.")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _estimate_fps(self) -> float:
        """Calculate FPS from the rolling timestamp buffer."""
        if len(self._timestamps) < 2:
            return 0.0
        elapsed = self._timestamps[-1] - self._timestamps[0]
        return (len(self._timestamps) - 1) / elapsed if elapsed > 0 else 0.0

    def _draw_landmarks(self, image: Any, frame_result: Any) -> None:
        """
        Draw facial landmark dots on the preview frame (development only).

        Each of the 478 landmarks is drawn as a small filled circle.
        Coordinates are normalised (0–1); we scale them back to pixel
        space using the actual frame dimensions.

        This method is a no-op when:
        * ``frame_result.face_detection`` is None.
        * No face was detected (``face_detection.detected`` is False).

        Args:
            image:        BGR NumPy array to draw on (in-place).
            frame_result: :class:`~services.frame_processor.FrameResult`.
        """
        face = getattr(frame_result, "face_detection", None)
        if face is None or not face.detected:
            return

        h, w = image.shape[:2]

        for lm in face.landmarks:
            px = int(lm.x * w)
            py = int(lm.y * h)
            cv2.circle(
                image,
                (px, py),
                _LANDMARK_DOT_RADIUS,
                _LANDMARK_DOT_COLOR,
                _LANDMARK_DOT_THICKNESS,
            )

    def _draw_overlay(self, image: Any, frame_result: Any) -> None:
        """
        Burn diagnostic text onto ``image`` in-place.

        Lines drawn (Day 05):
            * FPS estimate
            * Frame index
            * Face detected status + landmark count
            * Detection states (most still UNKNOWN in Day 05)
        """
        fps = self._estimate_fps()
        face = getattr(frame_result, "face_detection", None)

        # Build the face info string.
        if face is None:
            face_info = "Unavailable"
        elif not face.available:
            face_info = "Model not loaded"
        elif face.detected:
            face_info = f"YES  ({len(face.landmarks)} pts)"
        else:
            face_info = "No face"

        lines = [
            f"FPS:     {fps:.1f}",
            f"Frame:   {frame_result.frame_index}",
            f"Face:    {face_info}",
            f"Person:  {frame_result.person_state}",
            f"Facing:  {frame_result.screen_facing_state}",
            f"Posture: {frame_result.posture_state}",
        ]

        x, y_start, y_step = 10, 22, 20

        for i, line in enumerate(lines):
            y = y_start + i * y_step

            # Choose colour for the Face line to make status obvious.
            if i == 2 and face is not None:
                color = _FACE_DETECTED_COLOR if face.detected else _FACE_NOT_FOUND_COLOR
            else:
                color = OVERLAY_TEXT_COLOR

            # Thin black shadow for readability on any background.
            cv2.putText(
                image, line, (x + 1, y + 1),
                cv2.FONT_HERSHEY_SIMPLEX,
                OVERLAY_TEXT_SCALE, (0, 0, 0), OVERLAY_TEXT_THICKNESS + 1,
                cv2.LINE_AA,
            )
            # Coloured foreground text.
            cv2.putText(
                image, line, (x, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                OVERLAY_TEXT_SCALE, color, OVERLAY_TEXT_THICKNESS,
                cv2.LINE_AA,
            )
