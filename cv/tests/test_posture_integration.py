"""
FocusLens — Tests for Day 15 Posture Integration
=================================================
Validates the connection between posture detection and FocusLens application state,
covering all six verification scenarios specified in the Day 15 requirements:

1. A person sitting relatively upright.
2. A person leaning forward or appearing slouched.
3. A person turning or moving out of the camera frame.
4. Missing or unreliable pose landmarks.
5. No detectable pose / empty frame.
6. Changes between GOOD_POSTURE, SLOUCHED, and UNKNOWN (debouncing & deduplication).

Also verifies:
- PostureReliabilityTracker debounce logic.
- ActivitySignalAggregator state tracking and event listener subscription.
- Coexistence with person presence and screen facing estimation.
- Naming convention support (GOOD_POSTURE, SLOUCHED, SLOUCHED_POSTURE, UNKNOWN).
"""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from models.cv_results import (
    PostureState,
    PersonState,
    ScreenFacingState,
    PresenceResult,
    CVResult,
)
from services.posture_reliability import PostureReliabilityTracker
from services.activity_signal_aggregator import ActivitySignalAggregator
from services.posture_landmark_extractor import (
    PostureLandmarks,
    PostureLandmarkExtractor,
    IDX_NOSE,
    IDX_LEFT_SHOULDER,
    IDX_RIGHT_SHOULDER,
    IDX_LEFT_EAR,
    IDX_RIGHT_EAR,
)
from services.posture_classifier import PostureClassifier
from services.pose_landmarker import (
    PoseDetectionResult,
    PoseDetectionState,
    PoseLandmark,
)
from services.face_landmarker import (
    FaceDetectionResult,
    FaceDetectionState,
    FaceLandmark,
)
from services.frame_processor import FrameProcessor, FrameResult


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

def _make_landmark(
    index: int,
    x: float = 0.5,
    y: float = 0.5,
    z: float = 0.0,
    visibility: float = 0.9,
) -> PoseLandmark:
    return PoseLandmark(
        index=index,
        name=f"LANDMARK_{index}",
        x=x,
        y=y,
        z=z,
        visibility=visibility,
    )


def _make_pose_landmarks(
    shoulder_span: float = 0.25,
    ear_shoulder_ratio: float = 0.70,
    shoulder_tilt: float = 0.0,
    visibility: float = 0.9,
) -> list:
    """Build a synthetic 33-point pose landmark list."""
    lms = [_make_landmark(i, visibility=visibility) for i in range(33)]

    half_span = shoulder_span / 2.0
    lms[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, x=0.5 - half_span, y=0.60 + shoulder_tilt, visibility=visibility)
    lms[IDX_RIGHT_SHOULDER] = _make_landmark(IDX_RIGHT_SHOULDER, x=0.5 + half_span, y=0.60, visibility=visibility)

    shoulder_mid_y = (0.60 + shoulder_tilt + 0.60) / 2.0
    ear_y = shoulder_mid_y - ear_shoulder_ratio * shoulder_span

    lms[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, x=0.45, y=ear_y, visibility=visibility)
    lms[IDX_RIGHT_EAR] = _make_landmark(IDX_RIGHT_EAR, x=0.55, y=ear_y, visibility=visibility)
    lms[IDX_NOSE] = _make_landmark(IDX_NOSE, x=0.5, y=ear_y + 0.03, visibility=visibility)

    return lms


def _make_pose_result(
    detected: bool = True,
    landmarks: list | None = None,
    state: str = PoseDetectionState.DETECTED,
) -> PoseDetectionResult:
    return PoseDetectionResult(
        detected=detected,
        landmarks=landmarks or [],
        pose_count=1 if detected else 0,
        available=True,
        state=state,
    )


# ---------------------------------------------------------------------------
# 1. PostureReliabilityTracker Unit Tests
# ---------------------------------------------------------------------------

class TestPostureReliabilityTracker(unittest.TestCase):
    """Direct tests for the PostureReliabilityTracker debounce logic."""

    def setUp(self) -> None:
        self.tracker = PostureReliabilityTracker(
            consecutive_state_threshold=3,
            consecutive_unknown_threshold=3,
        )

    def test_initial_state_is_unknown(self) -> None:
        self.assertEqual(self.tracker.stable_state, PostureState.UNKNOWN)

    def test_scenario_1_upright_person_becomes_good_posture_after_threshold(self) -> None:
        # Frame 1: Candidate = GOOD_POSTURE, Count = 1 -> Stable = UNKNOWN
        self.assertEqual(self.tracker.process(PostureState.GOOD_POSTURE), PostureState.UNKNOWN)
        # Frame 2: Candidate = GOOD_POSTURE, Count = 2 -> Stable = UNKNOWN
        self.assertEqual(self.tracker.process(PostureState.GOOD_POSTURE), PostureState.UNKNOWN)
        # Frame 3: Candidate = GOOD_POSTURE, Count = 3 -> Stable = GOOD_POSTURE
        self.assertEqual(self.tracker.process(PostureState.GOOD_POSTURE), PostureState.GOOD_POSTURE)
        # Subsequent frame: remains GOOD_POSTURE
        self.assertEqual(self.tracker.process(PostureState.GOOD_POSTURE), PostureState.GOOD_POSTURE)

    def test_scenario_2_slouched_person_becomes_slouched_after_threshold(self) -> None:
        # Accepts PostureState.SLOUCHED_POSTURE
        self.assertEqual(self.tracker.process(PostureState.SLOUCHED_POSTURE), PostureState.UNKNOWN)
        self.assertEqual(self.tracker.process(PostureState.SLOUCHED_POSTURE), PostureState.UNKNOWN)
        self.assertEqual(self.tracker.process(PostureState.SLOUCHED_POSTURE), PostureState.SLOUCHED_POSTURE)

    def test_supports_slouched_alias(self) -> None:
        # Supports "SLOUCHED" alias directly
        self.assertEqual(self.tracker.process("SLOUCHED"), PostureState.UNKNOWN)
        self.assertEqual(self.tracker.process(PostureState.SLOUCHED), PostureState.UNKNOWN)
        self.assertEqual(self.tracker.process("SLOUCHED"), PostureState.SLOUCHED_POSTURE)

    def test_transient_glitch_does_not_break_stable_state(self) -> None:
        # Establish stable GOOD_POSTURE
        for _ in range(3):
            self.tracker.process(PostureState.GOOD_POSTURE)
        self.assertEqual(self.tracker.stable_state, PostureState.GOOD_POSTURE)

        # 1 single glitch frame of UNKNOWN
        result = self.tracker.process(PostureState.UNKNOWN)
        self.assertEqual(result, PostureState.GOOD_POSTURE)

        # 1 single opposite state frame (SLOUCHED)
        result = self.tracker.process(PostureState.SLOUCHED_POSTURE)
        self.assertEqual(result, PostureState.GOOD_POSTURE)

        # Resuming GOOD_POSTURE retains stable state
        result = self.tracker.process(PostureState.GOOD_POSTURE)
        self.assertEqual(result, PostureState.GOOD_POSTURE)

    def test_scenario_3_person_away_immediately_forces_unknown(self) -> None:
        # Establish stable GOOD_POSTURE
        for _ in range(3):
            self.tracker.process(PostureState.GOOD_POSTURE)
        self.assertEqual(self.tracker.stable_state, PostureState.GOOD_POSTURE)

        # Person detected AWAY -> immediately forces UNKNOWN without waiting 3 frames
        result = self.tracker.process(PostureState.GOOD_POSTURE, person_state=PersonState.AWAY)
        self.assertEqual(result, PostureState.UNKNOWN)
        self.assertEqual(self.tracker.stable_state, PostureState.UNKNOWN)

    def test_scenario_4_missing_landmarks_sustained_transitions_to_unknown(self) -> None:
        # Establish stable GOOD_POSTURE
        for _ in range(3):
            self.tracker.process(PostureState.GOOD_POSTURE)
        self.assertEqual(self.tracker.stable_state, PostureState.GOOD_POSTURE)

        # Sustained missing landmarks (UNKNOWN) for 3 frames
        self.assertEqual(self.tracker.process(PostureState.UNKNOWN), PostureState.GOOD_POSTURE)
        self.assertEqual(self.tracker.process(PostureState.UNKNOWN), PostureState.GOOD_POSTURE)
        self.assertEqual(self.tracker.process(PostureState.UNKNOWN), PostureState.UNKNOWN)

    def test_scenario_6_state_transitions_between_good_slouched_unknown(self) -> None:
        # 1. Transition to GOOD_POSTURE
        for _ in range(3):
            res = self.tracker.process(PostureState.GOOD_POSTURE)
        self.assertEqual(res, PostureState.GOOD_POSTURE)

        # 2. Transition to SLOUCHED
        for _ in range(3):
            res = self.tracker.process(PostureState.SLOUCHED_POSTURE)
        self.assertEqual(res, PostureState.SLOUCHED_POSTURE)

        # 3. Transition to UNKNOWN
        for _ in range(3):
            res = self.tracker.process(PostureState.UNKNOWN)
        self.assertEqual(res, PostureState.UNKNOWN)

        # 4. Transition back to GOOD_POSTURE
        for _ in range(3):
            res = self.tracker.process(PostureState.GOOD_POSTURE)
        self.assertEqual(res, PostureState.GOOD_POSTURE)

    def test_reset_clears_state(self) -> None:
        for _ in range(3):
            self.tracker.process(PostureState.GOOD_POSTURE)
        self.assertEqual(self.tracker.stable_state, PostureState.GOOD_POSTURE)

        self.tracker.reset()
        self.assertEqual(self.tracker.stable_state, PostureState.UNKNOWN)
        self.assertEqual(self.tracker.candidate_count, 0)
        self.assertEqual(self.tracker.uncertain_count, 0)


# ---------------------------------------------------------------------------
# 2. ActivitySignalAggregator Integration Tests
# ---------------------------------------------------------------------------

class TestActivitySignalAggregator(unittest.TestCase):
    """Tests for application-level state tracking and notification."""

    def setUp(self) -> None:
        self.aggregator = ActivitySignalAggregator()

    def test_initial_state(self) -> None:
        state = self.aggregator.get_current_state()
        self.assertEqual(state["person_presence"], PersonState.UNKNOWN)
        self.assertEqual(state["screen_facing"], ScreenFacingState.UNKNOWN)
        self.assertEqual(state["posture"], PostureState.UNKNOWN)

    def test_emits_signal_on_posture_change(self) -> None:
        signal = self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.GOOD_POSTURE,
            confidence=0.95,
        )
        self.assertIsNotNone(signal)
        self.assertEqual(signal["posture"], PostureState.GOOD_POSTURE)
        self.assertEqual(signal["person_presence"], PersonState.PRESENT)
        self.assertEqual(signal["screen_facing"], ScreenFacingState.SCREEN_FACING)

    def test_suppresses_duplicate_signals_when_state_unchanged(self) -> None:
        # First update: changes from UNKNOWN -> returns signal
        s1 = self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.GOOD_POSTURE,
        )
        self.assertIsNotNone(s1)

        # Second update with same states -> returns None (no noise)
        s2 = self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.GOOD_POSTURE,
        )
        self.assertIsNone(s2)

    def test_emits_when_posture_changes_to_slouched(self) -> None:
        self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.GOOD_POSTURE,
        )

        s2 = self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.SLOUCHED_POSTURE,
        )
        self.assertIsNotNone(s2)
        self.assertEqual(s2["posture"], PostureState.SLOUCHED_POSTURE)

    def test_listener_invoked_on_state_change(self) -> None:
        received = []
        callback = lambda sig: received.append(sig)
        self.aggregator.add_listener(callback)

        # Update state
        self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.GOOD_POSTURE,
        )
        self.assertEqual(len(received), 1)
        self.assertEqual(received[0]["posture"], PostureState.GOOD_POSTURE)

        # Unchanged state does not invoke listener
        self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.GOOD_POSTURE,
        )
        self.assertEqual(len(received), 1)

        # Remove listener
        self.aggregator.remove_listener(callback)
        self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.SCREEN_FACING,
            posture_state=PostureState.SLOUCHED_POSTURE,
        )
        self.assertEqual(len(received), 1)  # not called after removal

    def test_properties_match_current_state(self) -> None:
        self.aggregator.update_direct(
            person_state=PersonState.PRESENT,
            facing_state=ScreenFacingState.LOOKING_AWAY,
            posture_state=PostureState.GOOD_POSTURE,
        )
        self.assertEqual(self.aggregator.current_person, PersonState.PRESENT)
        self.assertEqual(self.aggregator.current_facing, ScreenFacingState.LOOKING_AWAY)
        self.assertEqual(self.aggregator.current_posture, PostureState.GOOD_POSTURE)


# ---------------------------------------------------------------------------
# 3. Pipeline / FrameProcessor Integration Tests
# ---------------------------------------------------------------------------

class TestFrameProcessorPostureIntegration(unittest.TestCase):
    """Tests posture debouncing and state integration within FrameProcessor."""

    def setUp(self) -> None:
        with unittest.mock.patch("services.frame_processor.FaceLandmarkerService"), \
             unittest.mock.patch("services.frame_processor.PoseLandmarkerService"):
            self.processor = FrameProcessor()
        # Mock landmarker services so we can feed controlled synthetic frames
        self.processor._face_landmarker = MagicMock()
        self.processor._pose_landmarker = MagicMock()

    def tearDown(self) -> None:
        self.processor.close()

    def _mock_frame(self, frame_index: int = 1):
        import numpy as np
        frame = MagicMock()
        frame.data = np.zeros((480, 640, 3), dtype=np.uint8)
        frame.frame_index = frame_index
        return frame

    def _setup_mock_detections(
        self,
        ear_shoulder_ratio: float = 0.70,
        pose_detected: bool = True,
        face_detected: bool = True,
        visibility: float = 0.9,
    ) -> None:
        # Mock face
        face_lms = [FaceLandmark(0.5, 0.5, 0.0) for _ in range(478)]
        face_lms[1] = FaceLandmark(0.5, 0.5, 0.0)      # Nose tip
        face_lms[33] = FaceLandmark(0.4, 0.4, 0.0)     # Left eye outer
        face_lms[263] = FaceLandmark(0.6, 0.4, 0.0)    # Right eye outer
        face_lms[61] = FaceLandmark(0.42, 0.6, 0.0)    # Mouth left
        face_lms[291] = FaceLandmark(0.58, 0.6, 0.0)   # Mouth right
        self.processor._face_landmarker.detect.return_value = FaceDetectionResult(
            detected=face_detected,
            landmarks=face_lms if face_detected else [],
            face_count=1 if face_detected else 0,
            detection_confidence=0.95,
            available=True,
            state=FaceDetectionState.DETECTED if face_detected else FaceDetectionState.NOT_DETECTED,
            landmarks_complete=True,
        )

        # Mock pose
        if pose_detected:
            pose_lms = _make_pose_landmarks(
                shoulder_span=0.25,
                ear_shoulder_ratio=ear_shoulder_ratio,
                visibility=visibility,
            )
            self.processor._pose_landmarker.detect.return_value = _make_pose_result(
                detected=True,
                landmarks=pose_lms,
                state=PoseDetectionState.DETECTED,
            )
        else:
            self.processor._pose_landmarker.detect.return_value = _make_pose_result(
                detected=False,
                landmarks=[],
                state=PoseDetectionState.NOT_DETECTED,
            )

    def test_scenario_1_upright_person_pipeline(self) -> None:
        """Upright posture debounces to GOOD_POSTURE over 3 frames."""
        self._setup_mock_detections(ear_shoulder_ratio=0.70)

        # Frame 1
        res1 = self.processor.process(self._mock_frame(1))
        self.assertEqual(res1.raw_posture_state, PostureState.GOOD_POSTURE)
        self.assertEqual(res1.posture_state, PostureState.UNKNOWN)

        # Frame 2
        res2 = self.processor.process(self._mock_frame(2))
        self.assertEqual(res2.posture_state, PostureState.UNKNOWN)

        # Frame 3 -> debounced to GOOD_POSTURE
        res3 = self.processor.process(self._mock_frame(3))
        self.assertEqual(res3.posture_state, PostureState.GOOD_POSTURE)
        self.assertEqual(res3.cv_result.posture, PostureState.GOOD_POSTURE)

    def test_scenario_2_slouched_person_pipeline(self) -> None:
        """Leaning forward / slouching debounces to SLOUCHED_POSTURE."""
        self._setup_mock_detections(ear_shoulder_ratio=0.20)

        for i in range(1, 4):
            res = self.processor.process(self._mock_frame(i))
            self.assertEqual(res.raw_posture_state, PostureState.SLOUCHED_POSTURE)

        self.assertEqual(res.posture_state, PostureState.SLOUCHED_POSTURE)
        self.assertEqual(res.cv_result.posture, PostureState.SLOUCHED_POSTURE)

    def test_scenario_4_unreliable_landmarks_pipeline(self) -> None:
        """Low landmark visibility (<0.5) results in UNKNOWN."""
        self._setup_mock_detections(ear_shoulder_ratio=0.70, visibility=0.3)

        for i in range(1, 4):
            res = self.processor.process(self._mock_frame(i))
            self.assertEqual(res.raw_posture_state, PostureState.UNKNOWN)

        self.assertEqual(res.posture_state, PostureState.UNKNOWN)

    def test_scenario_5_no_detectable_pose_pipeline(self) -> None:
        """No detectable pose yields UNKNOWN without crashing."""
        self._setup_mock_detections(pose_detected=False)

        res = self.processor.process(self._mock_frame(1))
        self.assertEqual(res.raw_posture_state, PostureState.UNKNOWN)
        self.assertEqual(res.posture_state, PostureState.UNKNOWN)

    def test_coexistence_with_presence_and_screen_facing(self) -> None:
        """Person presence and screen facing continue to work simultaneously."""
        self._setup_mock_detections(ear_shoulder_ratio=0.70, face_detected=True, pose_detected=True)

        for i in range(1, 4):
            res = self.processor.process(self._mock_frame(i))

        # All three systems produce stable states simultaneously
        self.assertEqual(res.person_state, PersonState.PRESENT)
        self.assertEqual(res.screen_facing_state, ScreenFacingState.SCREEN_FACING)
        self.assertEqual(res.posture_state, PostureState.GOOD_POSTURE)


if __name__ == "__main__":
    unittest.main()
