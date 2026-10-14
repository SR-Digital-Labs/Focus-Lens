"""Person-presence debounce and screen-facing integration scenarios."""

from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

from models.cv_results import PersonState, PostureState, ScreenFacingState
from services.activity_signal_aggregator import ActivitySignalAggregator
from services.face_landmarker import (
    FaceDetectionResult,
    FaceDetectionState,
    FaceLandmark,
)
from services.frame_processor import FrameProcessor, FrameResult
from services.pose_landmarker import PoseDetectionResult, PoseDetectionState
from services.presence_reliability import PresenceReliabilityTracker


class PresenceReliabilityTrackerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tracker = PresenceReliabilityTracker()

    def test_present_requires_consecutive_complete_face_detections(self) -> None:
        result = self._detected_face()
        self.assertEqual(self.tracker.process(result).state, PersonState.UNKNOWN)
        self.assertEqual(self.tracker.process(result).state, PersonState.UNKNOWN)
        self.assertEqual(self.tracker.process(result).state, PersonState.PRESENT)

    def test_leaving_view_becomes_away_after_consecutive_missing_faces(self) -> None:
        tracker = PresenceReliabilityTracker()
        for _ in range(3):
            tracker.process(self._detected_face())

        missing = FaceDetectionResult(
            available=True,
            state=FaceDetectionState.NOT_DETECTED,
        )
        for _ in range(4):
            self.assertEqual(tracker.process(missing).state, PersonState.PRESENT)
        self.assertEqual(tracker.process(missing).state, PersonState.AWAY)

    def test_uncertainty_preserves_briefly_then_returns_unknown(self) -> None:
        for _ in range(3):
            self.tracker.process(self._detected_face())
        uncertain = FaceDetectionResult(
            detected=True,
            face_count=1,
            available=True,
            state=FaceDetectionState.UNCERTAIN,
            landmarks_complete=False,
        )

        self.assertEqual(self.tracker.process(uncertain).state, PersonState.PRESENT)
        self.assertEqual(self.tracker.process(uncertain).state, PersonState.PRESENT)
        self.assertEqual(self.tracker.process(uncertain).state, PersonState.UNKNOWN)

    def test_unavailable_detection_immediately_returns_unknown_and_breaks_streak(self) -> None:
        detected = self._detected_face()
        self.tracker.process(detected)
        self.tracker.process(detected)

        unavailable = FaceDetectionResult(
            available=False,
            state=FaceDetectionState.UNAVAILABLE,
        )
        result = self.tracker.process(unavailable)
        self.assertEqual(result.state, PersonState.UNKNOWN)
        self.assertFalse(result.detection_available)

        self.assertEqual(self.tracker.process(detected).state, PersonState.UNKNOWN)
        self.assertEqual(self.tracker.process(detected).state, PersonState.UNKNOWN)
        self.assertEqual(self.tracker.process(detected).state, PersonState.PRESENT)

    def test_incomplete_landmarks_are_not_reliable_presence_evidence(self) -> None:
        incomplete = self._detected_face()
        incomplete.landmarks_complete = False

        self.assertEqual(self.tracker.process(incomplete).state, PersonState.UNKNOWN)

    @staticmethod
    def _detected_face() -> FaceDetectionResult:
        return FaceDetectionResult(
            detected=True,
            face_count=1,
            available=True,
            state=FaceDetectionState.DETECTED,
            landmarks_complete=True,
        )


class FrameProcessorDetectionIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        with patch("services.frame_processor.FaceLandmarkerService"), patch(
            "services.frame_processor.PoseLandmarkerService"
        ):
            self.processor = FrameProcessor()
        self.processor._face_landmarker = MagicMock()
        self.processor._pose_landmarker = MagicMock()
        self.processor._pose_landmarker.detect.return_value = PoseDetectionResult(
            available=True,
            state=PoseDetectionState.NOT_DETECTED,
        )
        self.aggregator = ActivitySignalAggregator()

    def tearDown(self) -> None:
        self.processor.close()

    def test_present_screen_facing_and_leave_view_are_integrated(self) -> None:
        for index in range(1, 4):
            result = self._process(index, self._detected_face())

        self.assertEqual(result.person_state, PersonState.PRESENT)
        self.assertEqual(result.screen_facing_state, ScreenFacingState.SCREEN_FACING)
        self.assertEqual(result.cv_result.person_presence, PersonState.PRESENT)
        signal = self.aggregator.update(result)
        self.assertIsNotNone(signal)
        self.assertEqual(signal["person_presence"], PersonState.PRESENT)
        self.assertEqual(signal["screen_facing"], ScreenFacingState.SCREEN_FACING)

        missing = FaceDetectionResult(
            available=True,
            state=FaceDetectionState.NOT_DETECTED,
        )
        for index in range(4, 9):
            result = self._process(index, missing)
            if index < 8:
                self.assertEqual(result.person_state, PersonState.PRESENT)
        self.assertEqual(result.person_state, PersonState.AWAY)
        self.assertEqual(result.screen_facing_state, ScreenFacingState.UNKNOWN)
        self.assertEqual(result.cv_result.person_presence, PersonState.AWAY)
        signal = self.aggregator.update(result)
        self.assertIsNotNone(signal)
        self.assertEqual(signal["person_presence"], PersonState.AWAY)
        self.assertEqual(signal["screen_facing"], ScreenFacingState.UNKNOWN)

    def test_uncertain_face_and_landmarks_propagate_unknown(self) -> None:
        detected = self._detected_face()
        self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.UNKNOWN,
        )
        for index in range(1, 4):
            self._process(index, detected)

        uncertain = FaceDetectionResult(
            detected=True,
            face_count=1,
            available=True,
            state=FaceDetectionState.UNCERTAIN,
            landmarks=[FaceLandmark(0.5, 0.5, 0.0)],
            landmarks_complete=False,
        )
        for index in range(4, 7):
            result = self._process(index, uncertain)

        self.assertEqual(result.person_state, PersonState.UNKNOWN)
        self.assertEqual(result.screen_facing_state, ScreenFacingState.UNKNOWN)
        self.assertEqual(result.cv_result.status, FaceDetectionState.UNCERTAIN)
        self.assertTrue(result.cv_result.face_detected)
        signal = self.aggregator.update(result)
        self.assertIsNotNone(signal)
        self.assertEqual(signal["person_presence"], PersonState.UNKNOWN)

    def test_invalid_frame_marks_presence_unavailable(self) -> None:
        for index in range(1, 4):
            self._process(index, self._detected_face())

        result = self.processor.process(None)

        self.assertEqual(result.person_state, PersonState.UNKNOWN)
        self.assertEqual(result.face_detection.state, FaceDetectionState.UNAVAILABLE)
        self.assertFalse(result.presence_result.detection_available)
        self.assertEqual(result.cv_result.person_presence, PersonState.UNKNOWN)

    def _process(
        self,
        index: int,
        face_result: FaceDetectionResult,
    ) -> FrameResult:
        self.processor._face_landmarker.detect.return_value = face_result
        frame = SimpleNamespace(
            data=np.zeros((480, 640, 3), dtype=np.uint8),
            frame_index=index,
        )
        return self.processor.process(frame)

    @staticmethod
    def _detected_face() -> FaceDetectionResult:
        landmarks = [FaceLandmark(0.5, 0.5, 0.0) for _ in range(478)]
        landmarks[1] = FaceLandmark(0.5, 0.5, 0.0)
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


if __name__ == "__main__":
    unittest.main()
