"""
FocusLens — Face Landmarker Service
=====================================
Day 05: MediaPipe Face Landmarker Foundation

Responsibility
--------------
This module owns the entire MediaPipe Face Landmarker lifecycle:

    initialise  →  convert frame  →  detect  →  return result  →  close

It is the ONLY place in the codebase that imports or calls MediaPipe.
All other modules receive a plain ``FaceDetectionResult`` dataclass, so
they have no dependency on MediaPipe internals.

Pipeline position
-----------------
::

    OpenCV CameraFrame
          ↓
    FaceLandmarkerService.detect(frame)
          ↓
    FaceDetectionResult
          ↓
    FrameProcessor  →  FrameResult

Privacy guarantee
-----------------
* All inference runs on-device using a local .task model bundle.
* No webcam frames are stored, uploaded, or transmitted.
* The raw NumPy frame is converted to the format MediaPipe expects,
  processed, and then discarded at the end of each call.

Future use (Day 10+)
--------------------
``FaceDetectionResult.landmarks`` will be consumed by a
``HeadOrientationAnalyser`` to estimate whether the user is screen-facing.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import List

from utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------


@dataclass
class FaceLandmark:
    """
    A single 3-D facial landmark point.

    Attributes:
        x:          Normalised x-coordinate (0.0 - 1.0, left to right).
        y:          Normalised y-coordinate (0.0 - 1.0, top to bottom).
        z:          Relative depth — negative values are closer to the camera.
                    Scale is the same as x (relative to image width).
        visibility: How likely the landmark is visible in the image (0-1).
                    Not all models populate this field; defaults to 1.0.
    """

    x: float
    y: float
    z: float
    visibility: float = 1.0


@dataclass
class FaceDetectionResult:
    """
    Structured output of one Face Landmarker inference pass.

    This is the public surface of ``FaceLandmarkerService``.
    All downstream modules (FrameProcessor, DevPreview, future analysers)
    should depend only on this dataclass, not on MediaPipe types.

    Attributes:
        detected:             True when at least one face was found with
                              sufficient confidence; False otherwise.
        landmarks:            478 normalised ``FaceLandmark`` points when
                              ``detected`` is True; empty list otherwise.
                              Index layout follows the MediaPipe Face Mesh
                              canonical face model.
        face_count:           Number of faces the model returned (0 or 1 for
                              FocusLens because MAX_FACES = 1).
        detection_confidence: Confidence score returned for the primary face
                              (0.0 - 1.0). 0.0 when no face was found.
        timestamp_ms:         Wall-clock timestamp (ms since epoch) at the
                              moment this result was produced.
        available:            True when the model is loaded and inference
                              completed without error. False if MediaPipe is
                              unavailable or threw an exception.
    """

    detected: bool = False
    landmarks: List[FaceLandmark] = field(default_factory=list)
    face_count: int = 0
    detection_confidence: float = 0.0
    timestamp_ms: float = field(default_factory=lambda: time.time() * 1_000)
    available: bool = True  # set to False if the model failed to load


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class FaceLandmarkerService:
    """
    Wraps the MediaPipe Face Landmarker Task API.

    The service initialises the model once and then processes frames
    one at a time via ``detect()``.

    Usage::

        service = FaceLandmarkerService(model_path="models/face_landmarker.task")
        service.initialise()

        result = service.detect(camera_frame)  # FaceDetectionResult

        service.close()

    The service is designed to be held by ``FrameProcessor`` and shared
    across the lifetime of the pipeline. It is NOT thread-safe by default;
    call ``detect()`` from the same thread that called ``initialise()``.
    """

    def __init__(
        self,
        model_path: str,
        min_detection_confidence: float = 0.5,
        min_presence_confidence: float = 0.5,
        max_faces: int = 1,
    ) -> None:
        self._model_path = model_path
        self._min_detection_confidence = min_detection_confidence
        self._min_presence_confidence = min_presence_confidence
        self._max_faces = max_faces

        self._landmarker = None   # MediaPipe FaceLandmarker instance
        self._available = False   # False until initialise() succeeds

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def initialise(self) -> bool:
        """
        Load the MediaPipe Face Landmarker model.

        Returns:
            True  — model loaded successfully; ``detect()`` is ready.
            False — model could not be loaded (missing file, wrong path,
                    MediaPipe not installed). The service will return
                    empty ``FaceDetectionResult(available=False)`` objects.

        Logs a clear, actionable error message when loading fails so the
        developer knows what step to take next.
        """
        try:
            import mediapipe as mp
            from mediapipe.tasks.python import vision as mp_vision
            from mediapipe.tasks.python.core import base_options as mp_base

            options = mp_vision.FaceLandmarkerOptions(
                base_options=mp_base.BaseOptions(model_asset_path=self._model_path),
                running_mode=mp_vision.RunningMode.IMAGE,
                num_faces=self._max_faces,
                min_face_detection_confidence=self._min_detection_confidence,
                min_face_presence_confidence=self._min_presence_confidence,
                output_face_blendshapes=False,              # not needed for Day 05
                output_facial_transformation_matrixes=False,  # reserved for Day 10+
            )

            self._landmarker = mp_vision.FaceLandmarker.create_from_options(options)
            self._available = True
            log.info(
                "FaceLandmarkerService ready. "
                "Model: %s | Max faces: %d | "
                "Detection conf: %.2f | Presence conf: %.2f",
                self._model_path,
                self._max_faces,
                self._min_detection_confidence,
                self._min_presence_confidence,
            )
            return True

        except FileNotFoundError:
            log.error(
                "Face Landmarker model not found: %s\n"
                "  -> Run the download script:  python cv/models/download_model.py",
                self._model_path,
            )
            self._available = False
            return False

        except ImportError:
            log.error(
                "MediaPipe is not installed.\n"
                "  -> Install it:  pip install -r cv/requirements.txt"
            )
            self._available = False
            return False

        except Exception as exc:  # pylint: disable=broad-except
            log.error("FaceLandmarkerService failed to initialise: %s", exc)
            self._available = False
            return False

    def detect(self, camera_frame: object) -> FaceDetectionResult:
        """
        Run face landmark detection on one webcam frame.

        Args:
            camera_frame: A :class:`~services.camera_service.CameraFrame`
                          instance (``data`` attribute is a BGR NumPy array).

        Returns:
            :class:`FaceDetectionResult` — always returns a valid object.
            When no face is detected, or when the service is unavailable,
            ``detected`` will be ``False`` and ``landmarks`` will be empty.

        The caller must NEVER assume a face is present without checking
        ``result.detected``. The pipeline handles the no-face state
        gracefully by treating it as an uncertain / unknown signal.
        """
        timestamp_ms = time.time() * 1_000

        # Guard: service not ready
        if not self._available or self._landmarker is None:
            return FaceDetectionResult(
                detected=False,
                available=False,
                timestamp_ms=timestamp_ms,
            )

        try:
            mp_image = self._to_mediapipe_image(camera_frame)
            raw_result = self._landmarker.detect(mp_image)
            return self._parse_result(raw_result, timestamp_ms)

        except Exception as exc:  # pylint: disable=broad-except
            # Log the error but do NOT crash the pipeline — one bad frame
            # should not kill the session.
            log.warning("Face detection error (returning empty result): %s", exc)
            return FaceDetectionResult(
                detected=False,
                available=True,  # service is still up; this was a one-frame blip
                timestamp_ms=timestamp_ms,
            )

    def close(self) -> None:
        """Release the MediaPipe landmarker and free model resources."""
        if self._landmarker is not None:
            try:
                self._landmarker.close()
            except Exception:  # pylint: disable=broad-except
                pass
            self._landmarker = None
            self._available = False
            log.info("FaceLandmarkerService closed.")

    @property
    def is_available(self) -> bool:
        """Return True if the model loaded successfully and is ready."""
        return self._available

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_mediapipe_image(camera_frame: object) -> object:
        """
        Convert an OpenCV BGR ``CameraFrame`` to a MediaPipe ``Image``.

        MediaPipe's Task API expects RGB format, so we flip the channel
        order here. This is the only place in the pipeline where the
        BGR to RGB difference is handled.

        Args:
            camera_frame: A :class:`~services.camera_service.CameraFrame`.

        Returns:
            A ``mediapipe.Image`` in ``IMAGE_FORMAT_SRGB`` format.
        """
        import cv2
        import mediapipe as mp

        bgr_frame = camera_frame.data  # type: ignore[attr-defined]
        rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        return mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    @staticmethod
    def _parse_result(raw_result: object, timestamp_ms: float) -> FaceDetectionResult:
        """
        Convert a raw MediaPipe ``FaceLandmarkerResult`` to our internal
        ``FaceDetectionResult`` dataclass.

        Args:
            raw_result:    The object returned by ``FaceLandmarker.detect()``.
            timestamp_ms:  The timestamp to attach to the result.

        Returns:
            :class:`FaceDetectionResult` populated from the raw result.
        """
        # ``face_landmarks`` is a list of lists — one inner list per face,
        # each containing 478 NormalizedLandmark objects.
        face_landmarks_list = getattr(raw_result, "face_landmarks", [])
        face_count = len(face_landmarks_list)

        if face_count == 0:
            return FaceDetectionResult(
                detected=False,
                face_count=0,
                detection_confidence=0.0,
                timestamp_ms=timestamp_ms,
                available=True,
            )

        # Track the primary face (index 0).
        primary_face_landmarks = face_landmarks_list[0]

        # Convert MediaPipe NormalizedLandmark -> our FaceLandmark dataclass.
        landmarks: List[FaceLandmark] = [
            FaceLandmark(
                x=lm.x,
                y=lm.y,
                z=lm.z,
                visibility=getattr(lm, "visibility", 1.0),
            )
            for lm in primary_face_landmarks
        ]

        # MediaPipe IMAGE mode does not expose a per-face confidence score
        # directly on the result object, so landmark presence is used as
        # the confidence signal (1.0 = confident detection).
        # Day 10 will use transformation matrices for orientation analysis.
        confidence = 1.0 if landmarks else 0.0

        return FaceDetectionResult(
            detected=True,
            landmarks=landmarks,
            face_count=face_count,
            detection_confidence=confidence,
            timestamp_ms=timestamp_ms,
            available=True,
        )
