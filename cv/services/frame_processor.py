"""
FocusLens — Frame Processor
============================
Responsible for all per-frame CV operations.

Day 04 state
------------
The processor currently performs only lightweight, privacy-safe
operations:

* Resize if a scale factor != 1.0 is configured.
* Return a ``FrameResult`` describing what was found.

Future CV stages (Days 5–8 and beyond) will add detection calls here:

    Day 5 — MediaPipe face landmarker
    Day 9 — Person presence detection
    Day 10 — Screen-facing estimation
    Day 13 — Posture detection

All new detection steps should be added as *private methods* of
``FrameProcessor`` and called from ``process()``. The pipeline in
``app/pipeline.py`` does NOT need to change when new detectors are added.

Privacy guarantee
-----------------
``process()`` receives a frame, extracts signals from it, and returns
a ``FrameResult``. The raw frame is NOT stored, logged, or transmitted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import cv2

from config import FRAME_SCALE
from utils.logger import get_logger

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Detection state enumerations
# ---------------------------------------------------------------------------
# These are forward-declared here so they appear in one central place.
# Detection algorithms will populate them in later phases.


class PersonState:
    """Observable person-presence states."""
    PRESENT = "PRESENT"
    AWAY    = "AWAY"
    UNKNOWN = "UNKNOWN"


class ScreenFacingState:
    """Observable screen-facing states."""
    SCREEN_FACING = "SCREEN_FACING"
    LOOKING_AWAY  = "LOOKING_AWAY"
    UNKNOWN       = "UNKNOWN"


class PostureState:
    """Observable posture states."""
    GOOD_POSTURE     = "GOOD_POSTURE"
    SLOUCHED_POSTURE = "SLOUCHED_POSTURE"
    UNKNOWN          = "UNKNOWN"


# ---------------------------------------------------------------------------
# Frame result
# ---------------------------------------------------------------------------


@dataclass
class FrameResult:
    """
    Output of one frame-processing cycle.

    Day 04: all detection fields default to UNKNOWN — no detectors are
    wired in yet. Future phases will populate these from real CV results.

    Attributes:
        frame_index:    Sequential index of the processed frame.
        processed_frame: The (optionally resized) BGR frame, returned so
                         the dev preview can display it.
        person_state:   Person-presence detection result.
        screen_facing_state: Screen-facing estimation result.
        posture_state:  Posture classification result.
        extra:          Open-ended dict for future signals.
    """

    frame_index: int
    processed_frame: Any  # numpy.ndarray
    person_state: str = PersonState.UNKNOWN
    screen_facing_state: str = ScreenFacingState.UNKNOWN
    posture_state: str = PostureState.UNKNOWN
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Processor
# ---------------------------------------------------------------------------


class FrameProcessor:
    """
    Applies CV operations to a single :class:`~services.camera_service.CameraFrame`.

    The processor is stateless across frames by design — each call to
    ``process()`` is independent. State that must persist across frames
    (e.g. a "person was last seen N frames ago" counter) will live in the
    future ``ActivitySignalAggregator`` rather than here.

    Usage::

        processor = FrameProcessor()
        result = processor.process(camera_frame)
    """

    def __init__(self, scale: float = FRAME_SCALE) -> None:
        self._scale = scale
        log.debug("FrameProcessor initialised (scale=%.2f).", scale)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process(self, frame: Any) -> FrameResult:
        """
        Process one camera frame and return a :class:`FrameResult`.

        Args:
            frame: A :class:`~services.camera_service.CameraFrame` instance.

        Returns:
            :class:`FrameResult` with detection signals populated (all
            UNKNOWN for Day 04).
        """
        # Step 1 — optional resize
        image = self._maybe_resize(frame.data)

        # Step 2 — (future) pre-processing, colour conversion, etc.
        # image = self._to_rgb(image)  # Will be added for MediaPipe

        # Step 3 — (future) run detectors
        # person_state = self._detect_person(image)
        # screen_facing_state = self._estimate_screen_facing(image)
        # posture_state = self._classify_posture(image)

        return FrameResult(
            frame_index=frame.frame_index,
            processed_frame=image,
            # Day 04: detectors not yet wired in.
            person_state=PersonState.UNKNOWN,
            screen_facing_state=ScreenFacingState.UNKNOWN,
            posture_state=PostureState.UNKNOWN,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _maybe_resize(self, image: Any) -> Any:
        """
        Downscale the frame if ``FRAME_SCALE`` is less than 1.0.

        Resizing before running heavy CV algorithms reduces CPU load.
        At 1.0 (the Day 04 default) this is a no-op.
        """
        if self._scale == 1.0:
            return image

        h, w = image.shape[:2]
        new_w = int(w * self._scale)
        new_h = int(h * self._scale)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        log.debug("Frame resized: %dx%d → %dx%d.", w, h, new_w, new_h)
        return resized
