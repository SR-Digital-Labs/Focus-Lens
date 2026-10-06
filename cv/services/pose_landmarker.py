"""
FocusLens - Pose Landmarker Service
===================================
Runs MediaPipe Pose Landmarker locally and converts its output into
MediaPipe-independent result dataclasses.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, List, Optional

from utils.logger import get_logger

log = get_logger(__name__)

POSE_LANDMARK_NAMES = (
    "NOSE",
    "LEFT_EYE_INNER",
    "LEFT_EYE",
    "LEFT_EYE_OUTER",
    "RIGHT_EYE_INNER",
    "RIGHT_EYE",
    "RIGHT_EYE_OUTER",
    "LEFT_EAR",
    "RIGHT_EAR",
    "MOUTH_LEFT",
    "MOUTH_RIGHT",
    "LEFT_SHOULDER",
    "RIGHT_SHOULDER",
    "LEFT_ELBOW",
    "RIGHT_ELBOW",
    "LEFT_WRIST",
    "RIGHT_WRIST",
    "LEFT_PINKY",
    "RIGHT_PINKY",
    "LEFT_INDEX",
    "RIGHT_INDEX",
    "LEFT_THUMB",
    "RIGHT_THUMB",
    "LEFT_HIP",
    "RIGHT_HIP",
    "LEFT_KNEE",
    "RIGHT_KNEE",
    "LEFT_ANKLE",
    "RIGHT_ANKLE",
    "LEFT_HEEL",
    "RIGHT_HEEL",
    "LEFT_FOOT_INDEX",
    "RIGHT_FOOT_INDEX",
)


class PoseDetectionState:
    """States describing pose landmark detection, not posture quality."""

    DETECTED = "DETECTED"
    NOT_DETECTED = "NOT_DETECTED"
    UNAVAILABLE = "UNAVAILABLE"
    UNCERTAIN = "UNCERTAIN"
    UNKNOWN = "UNKNOWN"


@dataclass
class PoseLandmark:
    """One named MediaPipe pose landmark in normalized image coordinates."""

    index: int
    name: str
    x: float
    y: float
    z: float
    visibility: Optional[float] = None
    presence: Optional[float] = None

    def as_dict(self) -> dict[str, Any]:
        """Return a stable, JSON-friendly representation."""
        return {
            "index": self.index,
            "name": self.name,
            "x": self.x,
            "y": self.y,
            "z": self.z,
            "visibility": self.visibility,
            "presence": self.presence,
        }


@dataclass
class PoseDetectionResult:
    """Output from one inference pass; landmarks describe the primary pose.

    MediaPipe returns ``pose_landmarks`` as a list of poses, each containing
    33 landmarks in its canonical landmark-index order. Coordinates are
    normalized to the input image; z is relative depth. ``visibility`` and
    ``presence`` may be absent from a landmark and are then represented as
    ``None``.
    """

    detected: bool = False
    landmarks: List[PoseLandmark] = field(default_factory=list)
    pose_count: int = 0
    timestamp_ms: float = field(default_factory=lambda: time.time() * 1_000)
    available: bool = False
    state: str = PoseDetectionState.UNKNOWN


class PoseLandmarkerService:
    """Owns the local MediaPipe Pose Landmarker model lifecycle."""

    def __init__(
        self,
        model_path: str,
        min_detection_confidence: float = 0.5,
        min_presence_confidence: float = 0.5,
        max_poses: int = 1,
    ) -> None:
        self._model_path = model_path
        self._min_detection_confidence = min_detection_confidence
        self._min_presence_confidence = min_presence_confidence
        self._max_poses = max_poses
        self._landmarker = None
        self._available = False

    def initialise(self) -> bool:
        """Load the local .task model, returning False when unavailable."""
        try:
            import mediapipe as mp
            from mediapipe.tasks.python import vision as mp_vision
            from mediapipe.tasks.python.core import base_options as mp_base

            options = mp_vision.PoseLandmarkerOptions(
                base_options=mp_base.BaseOptions(model_asset_path=self._model_path),
                running_mode=mp_vision.RunningMode.IMAGE,
                num_poses=self._max_poses,
                min_pose_detection_confidence=self._min_detection_confidence,
                min_pose_presence_confidence=self._min_presence_confidence,
            )
            self._landmarker = mp_vision.PoseLandmarker.create_from_options(options)
            self._available = True
            log.info("PoseLandmarkerService ready. Model: %s", self._model_path)
            return True
        except ImportError:
            log.error("MediaPipe is not installed. Install cv/requirements.txt dependencies.")
        except Exception as exc:  # pylint: disable=broad-except
            log.error("PoseLandmarkerService failed to initialise: %s", exc)

        self._available = False
        return False

    def detect(self, camera_frame: object) -> PoseDetectionResult:
        """Detect pose landmarks in one OpenCV BGR camera frame."""
        timestamp_ms = time.time() * 1_000
        if not self._available or self._landmarker is None:
            return PoseDetectionResult(
                timestamp_ms=timestamp_ms,
                available=False,
                state=PoseDetectionState.UNAVAILABLE,
            )

        try:
            raw_result = self._landmarker.detect(self._to_mediapipe_image(camera_frame))
            return self._parse_result(raw_result, timestamp_ms)
        except Exception as exc:  # pylint: disable=broad-except
            log.warning("Pose detection error (result is uncertain): %s", exc)
            return PoseDetectionResult(
                timestamp_ms=timestamp_ms,
                available=True,
                state=PoseDetectionState.UNCERTAIN,
            )

    def close(self) -> None:
        """Release MediaPipe model resources."""
        if self._landmarker is not None:
            try:
                self._landmarker.close()
            except Exception:  # pylint: disable=broad-except
                pass
            self._landmarker = None
        self._available = False

    @property
    def is_available(self) -> bool:
        """Whether the model initialized successfully and is ready."""
        return self._available

    @staticmethod
    def _to_mediapipe_image(camera_frame: object) -> Any:
        """Convert a CameraFrame's BGR array to MediaPipe SRGB image data."""
        import cv2
        import mediapipe as mp

        bgr_frame = camera_frame.data  # type: ignore[attr-defined]
        rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        return mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    @staticmethod
    def _parse_result(raw_result: object, timestamp_ms: float) -> PoseDetectionResult:
        """Flatten the primary pose's 33 points into our stable data shape."""
        poses = getattr(raw_result, "pose_landmarks", [])
        pose_count = len(poses)
        if pose_count == 0:
            return PoseDetectionResult(
                timestamp_ms=timestamp_ms,
                available=True,
                state=PoseDetectionState.NOT_DETECTED,
            )

        landmarks = [
            PoseLandmark(
                index=index,
                name=(
                    POSE_LANDMARK_NAMES[index]
                    if index < len(POSE_LANDMARK_NAMES)
                    else f"LANDMARK_{index}"
                ),
                x=float(landmark.x),
                y=float(landmark.y),
                z=float(landmark.z),
                visibility=(
                    float(landmark.visibility)
                    if getattr(landmark, "visibility", None) is not None
                    else None
                ),
                presence=(
                    float(landmark.presence)
                    if getattr(landmark, "presence", None) is not None
                    else None
                ),
            )
            for index, landmark in enumerate(poses[0])
        ]
        return PoseDetectionResult(
            detected=bool(landmarks),
            landmarks=landmarks,
            pose_count=pose_count,
            timestamp_ms=timestamp_ms,
            available=True,
            state=(
                PoseDetectionState.DETECTED
                if landmarks
                else PoseDetectionState.UNCERTAIN
            ),
        )