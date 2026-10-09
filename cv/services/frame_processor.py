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
    POSE_LANDMARKER_MODEL_PATH,
    POSE_DETECTION_CONFIDENCE,
    POSE_PRESENCE_CONFIDENCE,
    MAX_POSES,
)
from services.face_landmarker import (
    FaceDetectionResult,
    FaceDetectionState,
    FaceLandmarkerService,
)
from services.pose_landmarker import (
    PoseDetectionResult,
    PoseDetectionState,
    PoseLandmarkerService,
)
from services.screen_facing_estimator import ScreenFacingEstimator
from services.posture_landmark_extractor import PostureLandmarkExtractor
from utils.logger import get_logger
from models.cv_results import (
    CVResult,
    CVState,
    PresenceResult,
    PersonState,
    ScreenFacingState,
    PostureState,
)
from services.presence_reliability import PresenceReliabilityTracker
from services.screen_facing_reliability import ScreenFacingReliabilityTracker

log = get_logger(__name__)


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
        pose_detection:    Raw MediaPipe pose result. Its normalized points
                    are detector output, not a posture classification.
        cv_result:          Plain application-facing data, separate from the
                    detector-specific result objects.
        person_state:       Person-presence detection result (Day 9).
        screen_facing_state: Screen-facing estimation result (Day 10).
        posture_state:      Posture classification result (Day 13+).
        extra:              Open-ended dict for future signals.
    """

    frame_index: int
    processed_frame: Any  # numpy.ndarray
    face_detection: Optional[FaceDetectionResult] = None
    pose_detection: Optional[PoseDetectionResult] = None
    cv_result: Optional[CVResult] = None
    person_state: str = PersonState.UNKNOWN
    presence_result: Optional[PresenceResult] = None
    screen_facing_state: str = ScreenFacingState.UNKNOWN
    screen_facing_confidence: float = 0.0
    posture_state: str = PostureState.UNKNOWN
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Processor
# ---------------------------------------------------------------------------


class FrameProcessor:
    """
    Applies CV operations to a single :class:`~services.camera_service.CameraFrame`.

    Holds and drives local face and pose landmark services.

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

        self._pose_landmarker = PoseLandmarkerService(
            model_path=POSE_LANDMARKER_MODEL_PATH,
            min_detection_confidence=POSE_DETECTION_CONFIDENCE,
            min_presence_confidence=POSE_PRESENCE_CONFIDENCE,
            max_poses=MAX_POSES,
        )
        if not self._pose_landmarker.initialise():
            log.warning(
                "PoseLandmarkerService did not initialise. "
                "Pose detection will be unavailable until the model is downloaded. "
                "Run: python cv/models/download_pose_model.py"
            )

        self._reliability_tracker = PresenceReliabilityTracker()
        self._screen_facing_tracker = ScreenFacingReliabilityTracker()
        self._screen_facing_estimator = ScreenFacingEstimator()
        # Day 13: extracts and validates upper-body landmarks for posture.
        # Classification is added in Day 14; until then posture_state stays UNKNOWN.
        self._posture_extractor = PostureLandmarkExtractor()

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
            :class:`FrameResult` with raw face and pose landmark results.
            Posture remains UNKNOWN until a posture estimator is implemented.
        """
        # Error handling: Invalid or empty frame
        if frame is None or frame.data is None or frame.data.size == 0:
            log.error("Invalid or empty frame received.")
            cv_res = CVResult(
                status=CVState.INVALID_FRAME,
                error_message="Frame is empty or invalid"
            )
            return FrameResult(
                frame_index=getattr(frame, "frame_index", -1) if frame else -1,
                processed_frame=frame.data if frame and hasattr(frame, "data") else None,
                cv_result=cv_res,
                person_state=PersonState.UNKNOWN,
                presence_result=PresenceResult(state=PersonState.UNKNOWN, detection_available=False)
            )

        # Step 1 — optional resize
        image = self._maybe_resize(frame.data)

        # Step 2 — create a temporary frame-like object with the
        # (possibly resized) data so the landmarker always sees the
        # same resolution we work with internally.
        # We reuse the original CameraFrame for the landmarker so it can
        # access the full-resolution frame before any resize was applied —
        # more detail = better landmark accuracy.
        try:
            face_result: FaceDetectionResult = self._detect_face(frame)
        except Exception as e:
            log.error("Error during face detection: %s", e)
            face_result = FaceDetectionResult(
                detected=False,
                available=False,
                state=FaceDetectionState.UNCERTAIN,
            )

        try:
            pose_result: PoseDetectionResult = self._pose_landmarker.detect(frame)
        except Exception as e:
            log.error("Error during pose detection: %s", e)
            pose_result = PoseDetectionResult(
                available=True,
                state=PoseDetectionState.UNCERTAIN,
            )

        raw_screen_facing_state, screen_facing_confidence = (
            self._screen_facing_estimator.estimate_with_confidence(face_result)
        )
        screen_facing_state = self._screen_facing_tracker.process(
            raw_screen_facing_state,
            screen_facing_confidence,
        )

        # Step 4 — person presence
        presence_result = self._reliability_tracker.process(face_result)

        # Step 5 — Day 13: extract upper-body pose landmarks for posture.
        # The extractor validates landmarks and returns availability info.
        # Actual posture classification (GOOD / SLOUCHED) is added in Day 14;
        # until then posture_state remains UNKNOWN.
        posture_landmarks = self._posture_extractor.extract(pose_result)
        posture_state = posture_landmarks.extraction_state  # UNKNOWN for now

        cv_res = self._build_cv_result(
            face_result,
            pose_result,
            presence_result,
            screen_facing_state,
            screen_facing_confidence,
            posture_state,
        )
        log.info(
            "Person Presence: %s | Screen Facing: %s | Posture shoulders_valid: %s",
            presence_result.state,
            screen_facing_state,
            posture_landmarks.shoulders_valid,
        )

        return FrameResult(
            frame_index=frame.frame_index,
            processed_frame=image,
            face_detection=face_result,
            pose_detection=pose_result,
            cv_result=cv_res,
            person_state=presence_result.state,
            presence_result=presence_result,
            screen_facing_state=screen_facing_state,
            screen_facing_confidence=screen_facing_confidence,
            posture_state=posture_state,
        )

    def close(self) -> None:
        """Release MediaPipe model resources."""
        self._face_landmarker.close()
        self._pose_landmarker.close()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_cv_result(
        face_result: FaceDetectionResult,
        pose_result: PoseDetectionResult,
        presence_result: PresenceResult,
        screen_facing_state: str = ScreenFacingState.UNKNOWN,
        screen_facing_confidence: float = 0.0,
        posture_state: str = PostureState.UNKNOWN,
    ) -> CVResult:
        """Adapt detector-specific outputs to the application data contract."""
        face_detected: Optional[bool] = None
        if face_result.state in (
            FaceDetectionState.DETECTED,
            FaceDetectionState.NOT_DETECTED,
        ):
            face_detected = face_result.detected
        elif face_result.face_count > 0:
            face_detected = True

        landmarks = None
        if face_result.landmarks:
            landmarks = [
                {
                    "index": index,
                    "x": landmark.x,
                    "y": landmark.y,
                    "z": landmark.z,
                    "visibility": landmark.visibility,
                }
                for index, landmark in enumerate(face_result.landmarks)
            ]

        pose_detected: Optional[bool] = None
        if pose_result.state in (
            PoseDetectionState.DETECTED,
            PoseDetectionState.NOT_DETECTED,
        ):
            pose_detected = pose_result.detected

        error_messages = []
        if face_result.state == FaceDetectionState.UNAVAILABLE:
            error_messages.append("Face Landmarker unavailable")
        elif face_result.state == FaceDetectionState.UNCERTAIN:
            error_messages.append("Face detection or landmark output is uncertain")
        if pose_result.state == PoseDetectionState.UNAVAILABLE:
            error_messages.append("Pose Landmarker unavailable")
        elif pose_result.state == PoseDetectionState.UNCERTAIN:
            error_messages.append("Pose detection is uncertain")

        return CVResult(
            timestamp=face_result.timestamp_ms / 1_000,
            status=face_result.state,
            face_detected=face_detected,
            landmarks=landmarks,
            pose_detection_state=pose_result.state,
            pose_detected=pose_detected,
            pose_landmarks=(
                [landmark.as_dict() for landmark in pose_result.landmarks]
                if pose_detected
                else None
            ),
            person_presence=presence_result.state,
            screen_facing=screen_facing_state,
            confidence=screen_facing_confidence,
            posture=posture_state,
            error_message="; ".join(error_messages) or None,
        )

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
