"""
FocusLens — Screen Facing Estimator
====================================
Day 10: Screen-facing estimation functionality.

Responsibility
--------------
Estimates whether the user is facing the screen based on 2D facial landmarks.
"""

from math import isfinite
from config import (
    SCREEN_FACING_MAX_YAW_RATIO,
    SCREEN_FACING_MIN_NOSE_VERTICAL_RATIO,
    SCREEN_FACING_MAX_NOSE_VERTICAL_RATIO,
)
from services.face_landmarker import FaceDetectionResult, FaceDetectionState
from models.cv_results import ScreenFacingState
from utils.logger import get_logger

log = get_logger(__name__)

class ScreenFacingEstimator:
    """
    Estimates if the user is facing the screen using basic facial landmarks.
    This separates the orientation heuristic from frame processing.
    """
    def __init__(
        self,
        max_yaw_ratio: float = SCREEN_FACING_MAX_YAW_RATIO,
        min_nose_vertical_ratio: float = SCREEN_FACING_MIN_NOSE_VERTICAL_RATIO,
        max_nose_vertical_ratio: float = SCREEN_FACING_MAX_NOSE_VERTICAL_RATIO
    ):
        # Configurable thresholds to allow easy tuning during testing
        self.max_yaw_ratio = max_yaw_ratio
        self.min_nose_vertical_ratio = min_nose_vertical_ratio
        self.max_nose_vertical_ratio = max_nose_vertical_ratio

    def estimate(self, face_result: FaceDetectionResult) -> str:
        """
        Estimate frontal orientation from normalized face landmarks.
        Returns ScreenFacingState.SCREEN_FACING, LOOKING_AWAY, or UNKNOWN.
        
        This relies on a simple heuristic:
        - Calculates the midpoint between the eyes.
        - Checks the horizontal distance of the nose from this midpoint.
        - Checks the vertical position of the nose relative to the eyes and mouth.
        """
        # Ensure we have the necessary landmarks before calculating
        required_indices = (1, 33, 61, 263, 291)
        if (
            not face_result.available
            or face_result.state != FaceDetectionState.DETECTED
            or not face_result.landmarks_complete
            or len(face_result.landmarks) <= max(required_indices)
        ):
            return ScreenFacingState.UNKNOWN

        # Selected landmarks for basic orientation
        # 1: Nose tip
        # 33: Left eye (approx)
        # 61: Left mouth corner
        # 263: Right eye (approx)
        # 291: Right mouth corner
        nose = face_result.landmarks[1]
        left_eye = face_result.landmarks[33]
        right_eye = face_result.landmarks[263]
        left_mouth = face_result.landmarks[61]
        right_mouth = face_result.landmarks[291]
        
        points = (nose, left_eye, right_eye, left_mouth, right_mouth)
        if not all(isfinite(point.x) and isfinite(point.y) for point in points):
            return ScreenFacingState.UNKNOWN

        eye_span = abs(right_eye.x - left_eye.x)
        eye_line_y = (left_eye.y + right_eye.y) / 2
        mouth_line_y = (left_mouth.y + right_mouth.y) / 2
        vertical_span = mouth_line_y - eye_line_y
        
        if eye_span <= 1e-6 or vertical_span <= 1e-6:
            return ScreenFacingState.UNKNOWN

        # Calculate ratios for horizontal (yaw) and vertical (pitch) estimation
        eye_midpoint_x = (left_eye.x + right_eye.x) / 2
        yaw_ratio = abs(nose.x - eye_midpoint_x) / eye_span
        nose_vertical_ratio = (nose.y - eye_line_y) / vertical_span
        
        if not isfinite(yaw_ratio) or not isfinite(nose_vertical_ratio):
            return ScreenFacingState.UNKNOWN

        # Check thresholds
        if (
            yaw_ratio > self.max_yaw_ratio
            or nose_vertical_ratio < self.min_nose_vertical_ratio
            or nose_vertical_ratio > self.max_nose_vertical_ratio
        ):
            return ScreenFacingState.LOOKING_AWAY

        return ScreenFacingState.SCREEN_FACING
