"""
FocusLens — Tests for PostureLandmarkExtractor (Day 13)
========================================================
Covers landmark extraction, visibility gating, and all safe-fallback paths.

Run from the cv/ directory:
    python -m unittest tests.test_posture_landmark_extractor
"""

import sys
import os
import unittest

# Add cv/ to the path so sibling packages can be imported without the cv. prefix.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models.cv_results import PostureState
from services.pose_landmarker import (
    PoseDetectionResult,
    PoseDetectionState,
    PoseLandmark,
)
from services.posture_landmark_extractor import (
    PostureLandmarkExtractor,
    PostureLandmarks,
    IDX_LEFT_SHOULDER,
    IDX_RIGHT_SHOULDER,
    IDX_LEFT_EAR,
    IDX_RIGHT_EAR,
    IDX_NOSE,
    IDX_LEFT_HIP,
    IDX_RIGHT_HIP,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Total number of MediaPipe pose landmarks (indices 0–32).
_NUM_LANDMARKS = 33


def _make_landmark(
    index: int,
    x: float = 0.5,
    y: float = 0.5,
    z: float = 0.0,
    visibility: float = 0.9,
) -> PoseLandmark:
    """Create a PoseLandmark with sensible defaults."""
    return PoseLandmark(
        index=index,
        name=f"LANDMARK_{index}",
        x=x,
        y=y,
        z=z,
        visibility=visibility,
    )


def _make_full_landmarks(
    visibility: float = 0.9,
) -> list:
    """Return a list of 33 high-visibility landmarks."""
    return [_make_landmark(i, visibility=visibility) for i in range(_NUM_LANDMARKS)]


def _detected_result(landmarks: list) -> PoseDetectionResult:
    """Wrap landmarks in a DETECTED PoseDetectionResult."""
    return PoseDetectionResult(
        detected=True,
        landmarks=landmarks,
        pose_count=1,
        available=True,
        state=PoseDetectionState.DETECTED,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPostureLandmarkExtractorUnavailable(unittest.TestCase):
    """Cases where pose detection was not available or returned no pose."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()

    def test_model_unavailable_returns_not_available(self) -> None:
        result = self.extractor.extract(
            PoseDetectionResult(available=False, state=PoseDetectionState.UNAVAILABLE)
        )
        self.assertFalse(result.available)
        self.assertFalse(result.shoulders_valid)
        self.assertIsNone(result.left_shoulder)

    def test_not_detected_returns_available_but_no_landmarks(self) -> None:
        result = self.extractor.extract(
            PoseDetectionResult(available=True, state=PoseDetectionState.NOT_DETECTED)
        )
        self.assertTrue(result.available)
        self.assertFalse(result.shoulders_valid)
        self.assertIsNone(result.left_shoulder)
        self.assertEqual(result.extraction_state, PostureState.UNKNOWN)

    def test_uncertain_state_returns_unknown(self) -> None:
        result = self.extractor.extract(
            PoseDetectionResult(available=True, state=PoseDetectionState.UNCERTAIN)
        )
        self.assertFalse(result.shoulders_valid)

    def test_empty_landmark_list_returns_unknown(self) -> None:
        result = self.extractor.extract(
            PoseDetectionResult(
                available=True,
                detected=True,
                state=PoseDetectionState.DETECTED,
                landmarks=[],
            )
        )
        self.assertTrue(result.available)
        self.assertFalse(result.shoulders_valid)

    def test_too_short_landmark_list_returns_unknown(self) -> None:
        # Only 5 landmarks — way fewer than needed
        short_list = [_make_landmark(i) for i in range(5)]
        result = self.extractor.extract(_detected_result(short_list))
        self.assertFalse(result.shoulders_valid)


class TestPostureLandmarkExtractorVisibilityGate(unittest.TestCase):
    """Visibility thresholds are applied correctly."""

    def test_high_visibility_landmarks_are_accepted(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.95)
        result = self.extractor.extract(_detected_result(landmarks))
        self.assertTrue(result.shoulders_valid)
        self.assertIsNotNone(result.left_shoulder)
        self.assertIsNotNone(result.right_shoulder)

    def test_landmarks_below_threshold_become_none(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        # Force both shoulders below the 0.5 threshold
        landmarks[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, visibility=0.3)
        landmarks[IDX_RIGHT_SHOULDER] = _make_landmark(IDX_RIGHT_SHOULDER, visibility=0.3)

        result = self.extractor.extract(_detected_result(landmarks))
        self.assertFalse(result.shoulders_valid)
        self.assertIsNone(result.left_shoulder)
        self.assertIsNone(result.right_shoulder)

    def test_one_shoulder_below_threshold_makes_shoulders_invalid(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        landmarks[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, visibility=0.1)

        result = self.extractor.extract(_detected_result(landmarks))
        self.assertFalse(result.shoulders_valid)
        self.assertIsNone(result.left_shoulder)
        # Right shoulder is still valid individually
        self.assertIsNotNone(result.right_shoulder)

    def test_none_visibility_is_treated_as_missing(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        # visibility=None simulates landmark without a score
        lm = _make_landmark(IDX_LEFT_SHOULDER, visibility=0.9)
        lm.visibility = None
        landmarks[IDX_LEFT_SHOULDER] = lm

        result = self.extractor.extract(_detected_result(landmarks))
        self.assertIsNone(result.left_shoulder)
        self.assertFalse(result.shoulders_valid)

    def test_non_finite_visibility_is_rejected(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        lm = _make_landmark(IDX_LEFT_EAR, visibility=float("nan"))
        landmarks[IDX_LEFT_EAR] = lm

        result = self.extractor.extract(_detected_result(landmarks))
        self.assertIsNone(result.left_ear)

    def test_non_finite_coordinate_is_rejected(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        lm = _make_landmark(IDX_NOSE, x=float("inf"), visibility=0.9)
        landmarks[IDX_NOSE] = lm

        result = self.extractor.extract(_detected_result(landmarks))
        self.assertIsNone(result.nose)

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()


class TestPostureLandmarkExtractorOptionalLandmarks(unittest.TestCase):
    """Ears and hips are optional — missing ones do not block valid shoulders."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()

    def test_shoulders_valid_even_when_ears_missing(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        # Make both ears invisible
        landmarks[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, visibility=0.1)
        landmarks[IDX_RIGHT_EAR] = _make_landmark(IDX_RIGHT_EAR, visibility=0.1)

        result = self.extractor.extract(_detected_result(landmarks))
        self.assertTrue(result.shoulders_valid)
        self.assertIsNone(result.left_ear)
        self.assertIsNone(result.right_ear)

    def test_shoulders_valid_even_when_hips_missing(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        landmarks[IDX_LEFT_HIP] = _make_landmark(IDX_LEFT_HIP, visibility=0.1)
        landmarks[IDX_RIGHT_HIP] = _make_landmark(IDX_RIGHT_HIP, visibility=0.1)

        result = self.extractor.extract(_detected_result(landmarks))
        self.assertTrue(result.shoulders_valid)
        self.assertIsNone(result.left_hip)
        self.assertIsNone(result.right_hip)


class TestPostureLandmarkExtractorState(unittest.TestCase):
    """extraction_state is always UNKNOWN until Day 14 adds a classifier."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()

    def test_extraction_state_is_always_unknown(self) -> None:
        landmarks = _make_full_landmarks(visibility=0.9)
        result = self.extractor.extract(_detected_result(landmarks))
        self.assertEqual(result.extraction_state, PostureState.UNKNOWN)

    def test_extraction_state_unknown_when_no_pose(self) -> None:
        result = self.extractor.extract(
            PoseDetectionResult(available=True, state=PoseDetectionState.NOT_DETECTED)
        )
        self.assertEqual(result.extraction_state, PostureState.UNKNOWN)


class TestPostureLandmarkExtractorCustomThreshold(unittest.TestCase):
    """Custom visibility thresholds behave as expected."""

    def test_strict_threshold_rejects_medium_visibility(self) -> None:
        extractor = PostureLandmarkExtractor(min_visibility=0.95)
        landmarks = _make_full_landmarks(visibility=0.8)
        result = extractor.extract(_detected_result(landmarks))
        # All landmarks are 0.8 < 0.95 threshold
        self.assertFalse(result.shoulders_valid)
        self.assertIsNone(result.left_shoulder)

    def test_lenient_threshold_accepts_low_visibility(self) -> None:
        extractor = PostureLandmarkExtractor(min_visibility=0.1)
        landmarks = _make_full_landmarks(visibility=0.2)
        result = extractor.extract(_detected_result(landmarks))
        self.assertTrue(result.shoulders_valid)


if __name__ == "__main__":
    unittest.main()
