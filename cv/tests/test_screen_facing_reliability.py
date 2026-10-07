"""Tests for screen-facing confidence filtering and debounce behavior."""

import unittest

from models.cv_results import ScreenFacingState
from services.face_landmarker import (
    FaceDetectionResult,
    FaceDetectionState,
    FaceLandmark,
)
from services.presence_reliability import PresenceReliabilityTracker
from services.screen_facing_estimator import ScreenFacingEstimator
from services.screen_facing_reliability import ScreenFacingReliabilityTracker


class ScreenFacingReliabilityTrackerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tracker = ScreenFacingReliabilityTracker()

    def test_requires_consecutive_confident_results_to_change_state(self) -> None:
        self.assertEqual(
            self.tracker.process(ScreenFacingState.SCREEN_FACING, 0.8),
            ScreenFacingState.UNKNOWN,
        )
        self.assertEqual(
            self.tracker.process(ScreenFacingState.SCREEN_FACING, 0.8),
            ScreenFacingState.UNKNOWN,
        )
        self.assertEqual(
            self.tracker.process(ScreenFacingState.SCREEN_FACING, 0.8),
            ScreenFacingState.SCREEN_FACING,
        )

    def test_transient_state_change_does_not_change_stable_state(self) -> None:
        self._set_state(ScreenFacingState.SCREEN_FACING)
        self.assertEqual(
            self.tracker.process(ScreenFacingState.LOOKING_AWAY, 0.8),
            ScreenFacingState.SCREEN_FACING,
        )
        self.assertEqual(
            self.tracker.process(ScreenFacingState.SCREEN_FACING, 0.8),
            ScreenFacingState.SCREEN_FACING,
        )

    def test_brief_uncertainty_preserves_state_then_resets_to_unknown(self) -> None:
        self._set_state(ScreenFacingState.SCREEN_FACING)
        self.assertEqual(
            self.tracker.process(ScreenFacingState.UNKNOWN, 0.0),
            ScreenFacingState.SCREEN_FACING,
        )
        self.assertEqual(
            self.tracker.process(ScreenFacingState.UNKNOWN, 0.0),
            ScreenFacingState.SCREEN_FACING,
        )
        self.assertEqual(
            self.tracker.process(ScreenFacingState.UNKNOWN, 0.0),
            ScreenFacingState.UNKNOWN,
        )

    def test_low_or_invalid_confidence_is_treated_as_uncertain(self) -> None:
        self.assertEqual(
            self.tracker.process(ScreenFacingState.SCREEN_FACING, 0.1),
            ScreenFacingState.UNKNOWN,
        )
        self.assertEqual(
            self.tracker.process(ScreenFacingState.SCREEN_FACING, float("nan")),
            ScreenFacingState.UNKNOWN,
        )

    def _set_state(self, state: str) -> None:
        for _ in range(3):
            result = self.tracker.process(state, 0.8)
        self.assertEqual(result, state)


class ScreenFacingConfidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.estimator = ScreenFacingEstimator()

    def test_frontal_geometry_has_high_confidence(self) -> None:
        state, confidence = self.estimator.estimate_with_confidence(
            self._face_result(nose_x=0.5)
        )
        self.assertEqual(state, ScreenFacingState.SCREEN_FACING)
        self.assertAlmostEqual(confidence, 1.0)

    def test_geometry_near_a_decision_boundary_has_low_confidence(self) -> None:
        state, confidence = self.estimator.estimate_with_confidence(
            self._face_result(nose_x=0.538)
        )
        self.assertEqual(state, ScreenFacingState.SCREEN_FACING)
        self.assertLess(confidence, 0.15)

    def test_clear_head_turn_has_confident_looking_away_result(self) -> None:
        state, confidence = self.estimator.estimate_with_confidence(
            self._face_result(nose_x=0.56)
        )
        self.assertEqual(state, ScreenFacingState.LOOKING_AWAY)
        self.assertGreaterEqual(confidence, 0.15)

    def test_non_finite_or_incomplete_geometry_returns_unknown(self) -> None:
        incomplete = self._face_result(nose_x=0.5)
        incomplete.landmarks_complete = False
        self.assertEqual(
            self.estimator.estimate_with_confidence(incomplete),
            (ScreenFacingState.UNKNOWN, 0.0),
        )

        invalid = self._face_result(nose_x=float("nan"))
        self.assertEqual(
            self.estimator.estimate_with_confidence(invalid),
            (ScreenFacingState.UNKNOWN, 0.0),
        )

    @staticmethod
    def _face_result(nose_x: float) -> FaceDetectionResult:
        landmarks = [FaceLandmark(0.5, 0.5, 0.0) for _ in range(478)]
        landmarks[1] = FaceLandmark(nose_x, 0.5, 0.0)
        landmarks[33] = FaceLandmark(0.4, 0.4, 0.0)
        landmarks[263] = FaceLandmark(0.6, 0.4, 0.0)
        landmarks[61] = FaceLandmark(0.42, 0.6, 0.0)
        landmarks[291] = FaceLandmark(0.58, 0.6, 0.0)
        return FaceDetectionResult(
            detected=True,
            landmarks=landmarks,
            face_count=1,
            detection_confidence=1.0,
            available=True,
            state=FaceDetectionState.DETECTED,
            landmarks_complete=True,
        )


class PresenceReliabilityTests(unittest.TestCase):
    def test_uncertain_detected_face_does_not_count_as_present(self) -> None:
        tracker = PresenceReliabilityTracker()
        result = tracker.process(
            FaceDetectionResult(
                detected=True,
                available=True,
                state=FaceDetectionState.UNCERTAIN,
            )
        )
        self.assertEqual(result.state, "UNKNOWN")


if __name__ == "__main__":
    unittest.main()
