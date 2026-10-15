"""Tests for reliable, configurable posture reminder behavior."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np

from models.cv_results import PersonState, PostureState
from services.activity_signal_aggregator import ActivitySignalAggregator
from services.face_landmarker import (
    FaceDetectionResult,
    FaceDetectionState,
    FaceLandmark,
)
from services.frame_processor import FrameProcessor, FrameResult
from services.posture_reminder import PostureReminderTracker
from services.pose_landmarker import (
    PoseDetectionResult,
    PoseDetectionState,
    PoseLandmark,
)


class PostureReminderTrackerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tracker = PostureReminderTracker(threshold_seconds=60.0)

    def test_reminds_only_after_continuous_reliable_slouch(self) -> None:
        self.assertFalse(self._process(10.0))
        self.assertFalse(self._process(69.99))
        self.assertTrue(self._process(70.0))
        self.assertFalse(self._process(100.0))

    def test_good_or_unknown_posture_resets_the_slouch_interval(self) -> None:
        self.assertFalse(self._process(10.0))
        self.assertFalse(
            self.tracker.process(PostureState.UNKNOWN, PersonState.PRESENT, now=50.0)
        )
        self.assertFalse(self._process(70.0))
        self.assertTrue(self._process(130.0))

        self.assertFalse(
            self.tracker.process(PostureState.GOOD_POSTURE, PersonState.PRESENT, now=140.0)
        )
        self.assertFalse(self._process(200.0))

    def test_unknown_or_away_person_never_receives_a_reminder(self) -> None:
        self.assertFalse(
            self.tracker.process(
                PostureState.SLOUCHED_POSTURE,
                PersonState.UNKNOWN,
                now=0.0,
            )
        )
        self.assertFalse(
            self.tracker.process(
                PostureState.SLOUCHED_POSTURE,
                PersonState.AWAY,
                now=100.0,
            )
        )
        self.assertFalse(self._process(120.0))

    def test_unreliable_current_observation_resets_the_interval(self) -> None:
        self.assertFalse(self._process(0.0))
        self.assertFalse(
            self.tracker.process(
                PostureState.SLOUCHED_POSTURE,
                PersonState.PRESENT,
                now=30.0,
                posture_observation_reliable=False,
            )
        )
        self.assertFalse(self._process(60.0))
        self.assertTrue(self._process(120.0))

    def test_reminders_can_be_disabled(self) -> None:
        tracker = PostureReminderTracker(enabled=False, threshold_seconds=1.0)
        self.assertFalse(
            tracker.process(
                PostureState.SLOUCHED_POSTURE,
                PersonState.PRESENT,
                now=0.0,
            )
        )
        self.assertFalse(
            tracker.process(
                PostureState.SLOUCHED_POSTURE,
                PersonState.PRESENT,
                now=10.0,
            )
        )

    def test_rejects_invalid_threshold_and_non_monotonic_time(self) -> None:
        for threshold in (0.0, -1.0, float("inf"), float("nan")):
            with self.subTest(threshold=threshold), self.assertRaises(ValueError):
                PostureReminderTracker(threshold_seconds=threshold)

        self._process(10.0)
        with self.assertRaises(ValueError):
            self._process(9.0)

    def _process(self, now: float) -> bool:
        return self.tracker.process(
            PostureState.SLOUCHED_POSTURE,
            PersonState.PRESENT,
            now=now,
            posture_observation_reliable=True,
            person_observation_reliable=True,
        )


class PostureReminderPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        with patch("services.frame_processor.FaceLandmarkerService"), patch(
            "services.frame_processor.PoseLandmarkerService"
        ):
            self.processor = FrameProcessor(
                posture_reminders_enabled=True,
                posture_reminder_threshold_seconds=5.0,
            )
        self.processor._face_landmarker = MagicMock()
        self.processor._face_landmarker.detect.return_value = self._face()
        self.processor._pose_landmarker = MagicMock()
        self.processor._pose_landmarker.detect.return_value = self._slouched_pose()

        timestamps = iter((0.0, 5.0, 6.0))
        self.processor._posture_reminder_tracker._clock = timestamps.__next__
        self.aggregator = ActivitySignalAggregator()

    def tearDown(self) -> None:
        self.processor.close()

    def test_reminder_flows_from_stable_posture_to_application_event_once(self) -> None:
        results = [self._process(index) for index in range(1, 6)]

        self.assertEqual(results[2].person_state, PersonState.PRESENT)
        self.assertEqual(results[2].posture_state, PostureState.SLOUCHED_POSTURE)
        self.assertFalse(results[2].cv_result.posture_reminder)
        self.assertTrue(results[3].posture_reminder)
        self.assertTrue(results[3].cv_result.posture_reminder)
        self.assertFalse(results[4].posture_reminder)

        self.aggregator.update(results[2])
        reminder_signal = self.aggregator.update(results[3])
        self.assertIsNotNone(reminder_signal)
        self.assertTrue(reminder_signal["posture_reminder"])
        self.assertIsNone(self.aggregator.update(results[4]))

    def _process(self, index: int) -> FrameResult:
        frame = SimpleNamespace(
            data=np.zeros((480, 640, 3), dtype=np.uint8),
            frame_index=index,
        )
        return self.processor.process(frame)

    @staticmethod
    def _face() -> FaceDetectionResult:
        landmarks = [FaceLandmark(0.5, 0.5, 0.0) for _ in range(478)]
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

    @staticmethod
    def _slouched_pose() -> PoseDetectionResult:
        landmarks = [
            PoseLandmark(index=index, name=f"LANDMARK_{index}", x=0.5, y=0.5, z=0.0, visibility=0.9)
            for index in range(33)
        ]
        landmarks[7] = PoseLandmark(7, "LEFT_EAR", 0.45, 0.55, 0.0, 0.9)
        landmarks[8] = PoseLandmark(8, "RIGHT_EAR", 0.55, 0.55, 0.0, 0.9)
        landmarks[11] = PoseLandmark(11, "LEFT_SHOULDER", 0.375, 0.6, 0.0, 0.9)
        landmarks[12] = PoseLandmark(12, "RIGHT_SHOULDER", 0.625, 0.6, 0.0, 0.9)
        return PoseDetectionResult(
            detected=True,
            landmarks=landmarks,
            pose_count=1,
            available=True,
            state=PoseDetectionState.DETECTED,
        )


if __name__ == "__main__":
    unittest.main()
