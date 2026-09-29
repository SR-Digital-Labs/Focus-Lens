"""
FocusLens — Frame Processor
============================
Responsible for all per-frame CV operations.

Day 05 state
------------
The processor now:
* Optionally resizes the frame (FRAME_SCALE setting).
* Passes the frame to FaceLandmarkerService (MediaPipe).
* Attaches the FaceDetectionResult to the FrameResult.

Future CV stages (Days 9+ and beyond) will add detection calls here:

    Day 9  — Person presence detection
    Day 10 — Screen-facing estimation  (uses face landmarks from Day 05)
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

from config import (
    FRAME_SCALE,
    MEDIAPIPE_MODEL_PATH,
    FACE_DETECTION_CONFIDENCE,
    FACE_PRESENCE_CONFIDENCE,
    MAX_FACES,
)
from services.face_landmarker import FaceLandmarkerService, FaceDetectionResult
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

    Day 05: ``face_detection`` is now populated from the MediaPipe Face
    Landmarker. The other detection fields remain UNKNOWN until their
    respective algorithms are implemented in later phases.

    Attributes:
        frame_index:        Sequential index of the processed frame.
        processed_frame:    The (optionally resized) BGR frame, returned so
                            the dev preview can display it.
        face_detection:     Result from the MediaPipe Face Landmarker.
                            Check ``face_detection.detected`` before using
                            landmark data.
        person_state:       Person-presence detection result (Day 9+).
        screen_facing_state: Screen-facing estimation result (Day 10+).
        posture_state:      Posture classification result (Day 13+).
        extra:              Open-ended dict for future signals.
    """

    frame_index: int
    processed_frame: Any  # numpy.ndarray
    face_detection: Optional[FaceDetectionResult] = None
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

    Day 05: Holds and drives a :class:`~services.face_landmarker.FaceLandmarkerService`.

    The processor itself is stateless across frames by design — each call to
    ``process()`` is independent. State that must persist across frames
    (e.g. a "person was last seen N frames ago" counter) will live in the
    future ``ActivitySignalAggregator`` rather than here.

    Usage::

        processor = FrameProcessor()
        result = processor.process(camera_frame)   # FrameResult
        processor.close()                          # release MediaPipe model
    """

    def __init__(self, scale: float = FRAME_SCALE) -> None:
        self._scale = scale

        # Face Landmarker service — initialised once, reused every frame.
        self._face_landmarker = FaceLandmarkerService(
            model_path=MEDIAPIPE_MODEL_PATH,
            min_detection_confidence=FACE_DETECTION_CONFIDENCE,
            min_presence_confidence=FACE_PRESENCE_CONFIDENCE,
            max_faces=MAX_FACES,
        )
        ok = self._face_landmarker.initialise()
        if not ok:
            log.warning(
                "FaceLandmarkerService did not initialise. "
                "Face detection will be unavailable until the model is downloaded. "
                "Run:  python cv/models/download_model.py"
            )

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
            :class:`FrameResult` with ``face_detection`` populated from
            MediaPipe (Day 05). Other detection fields remain UNKNOWN
            until their respective phases are implemented.
        """
        # Step 1 — optional resize
        image = self._maybe_resize(frame.data)

        # Step 2 — create a temporary frame-like object with the
        # (possibly resized) data so the landmarker always sees the
        # same resolution we work with internally.
        # We reuse the original CameraFrame for the landmarker so it can
        # access the full-resolution frame before any resize was applied —
        # more detail = better landmark accuracy.
        face_result: FaceDetectionResult = self._detect_face(frame)

        # Step 3 — (future) screen-facing estimation
        # screen_facing_state = self._estimate_screen_facing(face_result)

        # Step 4 — (future) person presence, posture, etc.

        return FrameResult(
            frame_index=frame.frame_index,
            processed_frame=image,
            face_detection=face_result,
            # Day 05: higher-level states not yet derived from face data.
            person_state=PersonState.UNKNOWN,
            screen_facing_state=ScreenFacingState.UNKNOWN,
            posture_state=PostureState.UNKNOWN,
        )

    def close(self) -> None:
        """Release MediaPipe model resources."""
        self._face_landmarker.close()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _detect_face(self, frame: Any) -> FaceDetectionResult:
        """
        Run MediaPipe face landmark detection on the current frame.

        Returns:
            :class:`~services.face_landmarker.FaceDetectionResult`.
            Always returns a valid object — never raises.
            Check ``result.detected`` before using landmark data.
        """
        return self._face_landmarker.detect(frame)

    def _maybe_resize(self, image: Any) -> Any:
        """
        Downscale the frame if ``FRAME_SCALE`` is less than 1.0.

        Resizing before running heavy CV algorithms reduces CPU load.
        At 1.0 (the default) this is a no-op.
        """
        if self._scale == 1.0:
            return image

        h, w = image.shape[:2]
        new_w = int(w * self._scale)
        new_h = int(h * self._scale)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        log.debug("Frame resized: %dx%d -> %dx%d.", w, h, new_w, new_h)
        return resized
