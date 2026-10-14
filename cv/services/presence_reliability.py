"""
FocusLens — Presence Reliability Tracker
======================================
Adds stability to raw face detections across consecutive frames to prevent
rapid presence state switching.
"""

from __future__ import annotations

from config import (
    PRESENCE_CONSECUTIVE_DETECTION_THRESHOLD,
    PRESENCE_CONSECUTIVE_MISSING_THRESHOLD,
    PRESENCE_CONSECUTIVE_UNKNOWN_THRESHOLD,
)
from services.face_landmarker import FaceDetectionResult, FaceDetectionState
from models.cv_results import PresenceResult, PersonState
from utils.logger import get_logger

log = get_logger(__name__)


class PresenceReliabilityTracker:
    """
    Tracks face detection across consecutive frames to produce a stable
    presence state (PRESENT / AWAY / UNKNOWN).
    """

    def __init__(self) -> None:
        self._consecutive_detections = 0
        self._consecutive_missing = 0
        self._consecutive_unknown = 0
        self._stable_state = PersonState.UNKNOWN

    def process(self, face_result: FaceDetectionResult) -> PresenceResult:
        """
        Process a new raw face detection and return the stable presence state.
        """
        # Determine the raw state for this specific frame
        raw_state = PersonState.UNKNOWN
        if face_result.available:
            if (
                face_result.state == FaceDetectionState.DETECTED
                and face_result.detected
                and face_result.landmarks_complete
            ):
                raw_state = PersonState.PRESENT
            elif (
                face_result.state == FaceDetectionState.NOT_DETECTED
                and not face_result.detected
                and face_result.face_count == 0
            ):
                raw_state = PersonState.AWAY

        # Update consecutive counts based on raw state
        if raw_state == PersonState.PRESENT:
            self._consecutive_detections += 1
            self._consecutive_missing = 0
            self._consecutive_unknown = 0
        elif raw_state == PersonState.AWAY:
            self._consecutive_missing += 1
            self._consecutive_detections = 0
            self._consecutive_unknown = 0
        else:
            # Uncertain frames break consecutive evidence without counting as
            # proof that the person is away.
            self._consecutive_detections = 0
            self._consecutive_missing = 0
            if face_result.available:
                self._consecutive_unknown += 1
                if (
                    self._consecutive_unknown
                    >= PRESENCE_CONSECUTIVE_UNKNOWN_THRESHOLD
                ):
                    self._stable_state = PersonState.UNKNOWN
            else:
                self._consecutive_unknown = 0
                self._stable_state = PersonState.UNKNOWN

        # Update stable state based on thresholds
        if self._consecutive_detections >= PRESENCE_CONSECUTIVE_DETECTION_THRESHOLD:
            self._stable_state = PersonState.PRESENT
        elif self._consecutive_missing >= PRESENCE_CONSECUTIVE_MISSING_THRESHOLD:
            self._stable_state = PersonState.AWAY

        # Development output
        log.debug(
            "Raw Detection: %s | Detection Count: %d | Missing Count: %d | Stable State: %s",
            raw_state,
            self._consecutive_detections,
            self._consecutive_missing,
            self._stable_state,
        )

        return PresenceResult(
            state=self._stable_state,
            detection_available=face_result.available
        )
