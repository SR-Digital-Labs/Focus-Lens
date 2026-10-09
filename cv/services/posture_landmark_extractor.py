"""
FocusLens — Posture Landmark Extractor
=======================================
Day 13: Foundation for posture detection.

Responsibility
--------------
Extracts and validates the upper-body pose landmarks that are relevant for
basic posture analysis from a ``PoseDetectionResult``.

This module is intentionally *only* about landmark extraction and validation.
Posture classification (GOOD_POSTURE / SLOUCHED / UNKNOWN) is a separate
concern and will be implemented in Day 14.

Selected landmarks
------------------
MediaPipe Pose Landmarker returns 33 landmarks (indices 0-32).
The following upper-body points are relevant to initial posture analysis:

    Index  Name              Why it matters
    -----  ----------------  -----------------------------------------------
    0      NOSE              Useful head-position proxy when ears are occluded
    7      LEFT_EAR          Ear height relative to shoulders indicates lean
    8      RIGHT_EAR         Same as left ear
    11     LEFT_SHOULDER     Primary shoulder reference point
    12     RIGHT_SHOULDER    Primary shoulder reference point
    23     LEFT_HIP          Enables shoulder-to-hip ratio for torso tilt
    24     RIGHT_HIP         Same as left hip

Shoulder landmarks (11, 12) are the most reliable upper-body landmarks in a
typical webcam setup and should always be available when a pose is detected.
Ear landmarks (7, 8) are visible when the person faces roughly forward but may
disappear when they turn to the side.  Hip landmarks (23, 24) are optional and
may be cut off if only the upper torso is in frame.

Privacy note
------------
Landmark coordinates are normalized pixel positions extracted locally.
No webcam frames or raw landmark data leave this device.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Optional

from config import POSTURE_MIN_LANDMARK_VISIBILITY
from models.cv_results import PostureState
from services.pose_landmarker import PoseDetectionResult, PoseDetectionState, PoseLandmark
from utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Landmark index constants (MediaPipe Pose canonical order)
# ---------------------------------------------------------------------------

# Head
IDX_NOSE = 0

# Ears — useful for forward-lean estimation; may be absent when turned
IDX_LEFT_EAR = 7
IDX_RIGHT_EAR = 8

# Shoulders — most reliable upper-body landmarks in webcam scenarios
IDX_LEFT_SHOULDER = 11
IDX_RIGHT_SHOULDER = 12

# Hips — may be out of frame; treated as optional
IDX_LEFT_HIP = 23
IDX_RIGHT_HIP = 24

# The maximum index we ever access; used to bounds-check the landmark list.
_MAX_REQUIRED_INDEX = max(
    IDX_NOSE,
    IDX_LEFT_EAR, IDX_RIGHT_EAR,
    IDX_LEFT_SHOULDER, IDX_RIGHT_SHOULDER,
    IDX_LEFT_HIP, IDX_RIGHT_HIP,
)


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class PostureLandmarks:
    """
    Validated upper-body landmarks extracted from one pose detection frame.

    Only landmarks that passed the visibility threshold are populated;
    the rest are ``None``.  Consumers must check each field before use.

    Attributes:
        available:        True when pose detection ran successfully.
        shoulders_valid:  True when *both* shoulder landmarks met the
                          visibility threshold.  Shoulders are the minimum
                          requirement for any posture estimate.
        nose:             Nose landmark (index 0), or None.
        left_ear:         Left-ear landmark (index 7), or None.
        right_ear:        Right-ear landmark (index 8), or None.
        left_shoulder:    Left-shoulder landmark (index 11), or None.
        right_shoulder:   Right-shoulder landmark (index 12), or None.
        left_hip:         Left-hip landmark (index 23), or None.
        right_hip:        Right-hip landmark (index 24), or None.
        extraction_state: The upstream posture state string.  Always UNKNOWN
                          at this stage — classification is reserved for Day 14.
    """

    available: bool = False
    shoulders_valid: bool = False

    nose: Optional[PoseLandmark] = None
    left_ear: Optional[PoseLandmark] = None
    right_ear: Optional[PoseLandmark] = None
    left_shoulder: Optional[PoseLandmark] = None
    right_shoulder: Optional[PoseLandmark] = None
    left_hip: Optional[PoseLandmark] = None
    right_hip: Optional[PoseLandmark] = None

    # Always PostureState.UNKNOWN for now; Day 14 will classify from these fields.
    extraction_state: str = PostureState.UNKNOWN


# ---------------------------------------------------------------------------
# Extractor
# ---------------------------------------------------------------------------


class PostureLandmarkExtractor:
    """
    Extracts upper-body landmarks from a ``PoseDetectionResult`` and returns
    a ``PostureLandmarks`` object ready for downstream posture analysis.

    Usage::

        extractor = PostureLandmarkExtractor()
        posture_lms = extractor.extract(pose_result)

        if posture_lms.shoulders_valid:
            # Both shoulders visible — posture analysis is possible
            ...

    The extractor is stateless across frames and safe to call every frame.
    """

    def __init__(
        self,
        min_visibility: float = POSTURE_MIN_LANDMARK_VISIBILITY,
    ) -> None:
        """
        Args:
            min_visibility: Minimum MediaPipe landmark visibility score
                            (0.0–1.0) required to treat a landmark as valid.
                            Configurable via ``POSTURE_MIN_LANDMARK_VISIBILITY``
                            in ``cv/config/stability.py``.
        """
        self._min_visibility = min_visibility

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract(self, pose_result: PoseDetectionResult) -> PostureLandmarks:
        """
        Extract and validate upper-body landmarks from one pose detection result.

        Returns a ``PostureLandmarks`` with only the landmarks that are
        available and above the visibility threshold populated.  Every other
        field remains ``None``.

        Args:
            pose_result: The ``PoseDetectionResult`` from ``PoseLandmarkerService``.

        Returns:
            ``PostureLandmarks``.  Never raises; any error or insufficient data
            results in a result where ``shoulders_valid`` is False and all
            landmark fields are ``None``.
        """
        # --- Guard: model unavailable ---
        if not pose_result.available:
            log.debug("Pose model unavailable — posture extraction skipped.")
            return PostureLandmarks(available=False, extraction_state=PostureState.UNKNOWN)

        # --- Guard: pose-level states that mean no usable data ---
        if pose_result.state == PoseDetectionState.UNAVAILABLE:
            return PostureLandmarks(available=False, extraction_state=PostureState.UNKNOWN)

        if pose_result.state in (
            PoseDetectionState.NOT_DETECTED,
            PoseDetectionState.UNCERTAIN,
        ):
            log.debug("No pose detected (state=%s) — returning UNKNOWN.", pose_result.state)
            return PostureLandmarks(available=True, extraction_state=PostureState.UNKNOWN)

        if not pose_result.landmarks:
            log.debug("Pose detected but landmark list is empty.")
            return PostureLandmarks(available=True, extraction_state=PostureState.UNKNOWN)

        if len(pose_result.landmarks) <= _MAX_REQUIRED_INDEX:
            log.debug(
                "Landmark list shorter than expected (%d). Need at least %d.",
                len(pose_result.landmarks),
                _MAX_REQUIRED_INDEX + 1,
            )
            return PostureLandmarks(available=True, extraction_state=PostureState.UNKNOWN)

        # --- Extract each landmark, gating on visibility and finite coords ---
        try:
            nose = self._gate(pose_result.landmarks[IDX_NOSE])
            left_ear = self._gate(pose_result.landmarks[IDX_LEFT_EAR])
            right_ear = self._gate(pose_result.landmarks[IDX_RIGHT_EAR])
            left_shoulder = self._gate(pose_result.landmarks[IDX_LEFT_SHOULDER])
            right_shoulder = self._gate(pose_result.landmarks[IDX_RIGHT_SHOULDER])
            left_hip = self._gate(pose_result.landmarks[IDX_LEFT_HIP])
            right_hip = self._gate(pose_result.landmarks[IDX_RIGHT_HIP])
        except Exception as exc:  # pylint: disable=broad-except
            log.warning("Unexpected error during posture landmark extraction: %s", exc)
            return PostureLandmarks(available=True, extraction_state=PostureState.UNKNOWN)

        # Shoulders are the minimum requirement for any posture estimate.
        # If either shoulder is missing we cannot form a reliable reference line.
        shoulders_valid = left_shoulder is not None and right_shoulder is not None

        result = PostureLandmarks(
            available=True,
            shoulders_valid=shoulders_valid,
            nose=nose,
            left_ear=left_ear,
            right_ear=right_ear,
            left_shoulder=left_shoulder,
            right_shoulder=right_shoulder,
            left_hip=left_hip,
            right_hip=right_hip,
            # Classification is reserved for Day 14.
            extraction_state=PostureState.UNKNOWN,
        )

        log.debug(
            "PostureLandmarks extracted | shoulders_valid=%s | "
            "ears=%s/%s | hips=%s/%s",
            shoulders_valid,
            "Y" if left_ear else "N",
            "Y" if right_ear else "N",
            "Y" if left_hip else "N",
            "Y" if right_hip else "N",
        )

        return result

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _gate(self, landmark: PoseLandmark) -> Optional[PoseLandmark]:
        """
        Return ``landmark`` if its visibility meets the threshold and its
        coordinates are finite numbers; otherwise return ``None``.

        MediaPipe may report ``visibility=None`` when the score is not
        available — this is treated as failing the gate.
        """
        # No visibility score available — treat as unreliable.
        if landmark.visibility is None:
            return None

        if not isfinite(landmark.visibility):
            return None

        if landmark.visibility < self._min_visibility:
            return None

        # Also reject landmarks whose coordinates are not finite numbers.
        if not (isfinite(landmark.x) and isfinite(landmark.y) and isfinite(landmark.z)):
            return None

        return landmark
