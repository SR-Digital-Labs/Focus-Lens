"""
FocusLens — Camera Service
===========================
Manages the full lifecycle of the webcam:

    open  →  read frame  →  release

Privacy guarantee
-----------------
This module NEVER saves frames to disk, uploads them to a network
endpoint, or encodes them as video. Frames exist only in RAM for the
duration of one processing cycle, after which they are discarded by
the Python garbage collector.

Design notes
------------
* ``CameraService`` is intentionally plain and self-contained.
* Future CV stages (MediaPipe, detection) will be added to
  ``services/frame_processor.py`` and called from ``app/pipeline.py``.
  They do NOT need to touch this file.
* The service raises descriptive ``CameraError`` exceptions so that
  callers can react to specific failure modes cleanly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import cv2

from config import CAMERA_INDEX, CAMERA_WIDTH, CAMERA_HEIGHT
from utils.logger import get_logger

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class CameraError(RuntimeError):
    """Raised when the camera cannot be opened or a frame cannot be read."""


# ---------------------------------------------------------------------------
# Frame container
# ---------------------------------------------------------------------------


@dataclass
class CameraFrame:
    """
    A single frame captured from the webcam.

    Attributes:
        data:       The raw BGR image as a NumPy ndarray.
        frame_index: Sequential counter (0-based) since the camera was opened.
        width:      Frame width in pixels.
        height:     Frame height in pixels.
    """

    data: object          # numpy.ndarray — typed as object to avoid importing numpy here
    frame_index: int
    width: int
    height: int


# ---------------------------------------------------------------------------
# Camera service
# ---------------------------------------------------------------------------


class CameraService:
    """
    Handles webcam access, frame acquisition, and resource cleanup.

    Typical usage::

        camera = CameraService()
        camera.open()
        try:
            while True:
                frame = camera.read_frame()
                # … hand frame to the processing pipeline …
        finally:
            camera.release()

    The service records the camera state internally; call
    ``is_open`` to check before reading.
    """

    def __init__(
        self,
        camera_index: int = CAMERA_INDEX,
        width: int = CAMERA_WIDTH,
        height: int = CAMERA_HEIGHT,
    ) -> None:
        self._index: int = camera_index
        self._width: int = width
        self._height: int = height
        self._cap: Optional[cv2.VideoCapture] = None
        self._frame_counter: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def is_open(self) -> bool:
        """Return True if the underlying VideoCapture is open and ready."""
        return self._cap is not None and self._cap.isOpened()

    def open(self) -> None:
        """
        Open the webcam.

        Raises:
            CameraError: If the device cannot be found or opened.
        """
        log.info("Opening camera (index=%d, target=%dx%d)…", self._index, self._width, self._height)

        cap = cv2.VideoCapture(self._index)

        if not cap.isOpened():
            raise CameraError(
                f"Camera at index {self._index} could not be opened. "
                "Check that no other application is using the webcam, "
                "or try a different camera index in cv/config/settings.py."
            )

        # Request the desired resolution; device may choose the closest match.
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)

        # Read back the actual resolution the device selected.
        actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        self._cap = cap
        self._frame_counter = 0

        log.info(
            "Camera opened successfully. Actual resolution: %dx%d.", actual_w, actual_h
        )

    def read_frame(self) -> CameraFrame:
        """
        Capture and return the next frame from the webcam.

        Returns:
            A :class:`CameraFrame` containing the BGR image data.

        Raises:
            CameraError: If the camera is not open, or if the frame
                         cannot be read (e.g. device disconnected mid-session).
        """
        if not self.is_open:
            raise CameraError(
                "read_frame() called but the camera is not open. "
                "Call open() first."
            )

        ok, raw_frame = self._cap.read()  # type: ignore[union-attr]

        if not ok or raw_frame is None:
            raise CameraError(
                "Failed to read a frame from the camera. "
                "The device may have been disconnected."
            )

        h, w = raw_frame.shape[:2]
        frame = CameraFrame(
            data=raw_frame,
            frame_index=self._frame_counter,
            width=w,
            height=h,
        )
        self._frame_counter += 1
        return frame

    def release(self) -> None:
        """
        Release the webcam and free all associated resources.

        Safe to call even if the camera was never opened or has
        already been released.
        """
        if self._cap is not None:
            self._cap.release()
            self._cap = None
            log.info("Camera released. Total frames captured: %d.", self._frame_counter)
        else:
            log.debug("release() called but camera was not open — nothing to do.")
