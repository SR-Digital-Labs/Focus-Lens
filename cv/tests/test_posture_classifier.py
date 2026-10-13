"""
FocusLens — Tests for PostureClassifier (Day 14)
=================================================
Covers all seven verification scenarios from the Day 14 task specification.

Run from the cv/ directory:
    python -m unittest tests.test_posture_classifier

Scenarios verified
------------------
1.  Person sitting relatively upright.
2.  Person leaning forward / appearing slouched.
3.  Person turning or tilting their body (shoulder tilt too large).
4.  Partially visible shoulders or ears (one ear missing).
5.  Missing pose landmarks (shoulders not valid).
6.  Low-confidence or unreliable landmark results.
7.  No detectable person / pose model unavailable.

Additional coverage
-------------------
* Dead-zone values between thresholds return UNKNOWN.
* Non-finite coordinates and ratios return UNKNOWN.
* Degenerate shoulder geometry (zero span, nearly-overlapping) returns UNKNOWN.
* Nose-as-ear-proxy path when both ears are absent.
* Custom threshold constructor arguments.
* Unexpected exceptions inside classify() return UNKNOWN (never raise).
"""

from __future__ import annotations

import sys
import os
import math
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
from services.posture_classifier import PostureClassifier

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _make_full_landmarks(visibility: float = 0.9) -> list:
    """Return a list of 33 high-visibility landmarks at neutral positions."""
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


def _make_upright_landmarks(
    shoulder_span: float = 0.3,
    ear_shoulder_ratio: float = 0.70,
    shoulder_y: float = 0.60,
    shoulder_tilt: float = 0.0,
) -> list:
    """
    Build a realistic landmark list for an upright person.

    The ear Y coordinate is computed so that the ear-to-shoulder ratio
    equals ``ear_shoulder_ratio`` given the shoulder span and midpoint Y.

    Args:
        shoulder_span:       Horizontal distance between left and right shoulder.
        ear_shoulder_ratio:  Desired (shoulder_mid_y - ear_y) / shoulder_span.
        shoulder_y:          Y coordinate for the right shoulder.
        shoulder_tilt:       Height difference added to the left shoulder Y
                             (positive = left shoulder higher / above right).
    """
    lms = _make_full_landmarks()

    half_span = shoulder_span / 2.0
    # Place shoulders symmetrically around x=0.5
    lms[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, x=0.5 - half_span, y=shoulder_y + shoulder_tilt)
    lms[IDX_RIGHT_SHOULDER] = _make_landmark(IDX_RIGHT_SHOULDER, x=0.5 + half_span, y=shoulder_y)

    shoulder_mid_y = (shoulder_y + shoulder_tilt + shoulder_y) / 2.0
    # ear_y such that (shoulder_mid_y - ear_y) / shoulder_span == ratio
    ear_y = shoulder_mid_y - ear_shoulder_ratio * shoulder_span

    lms[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, x=0.45, y=ear_y)
    lms[IDX_RIGHT_EAR] = _make_landmark(IDX_RIGHT_EAR, x=0.55, y=ear_y)
    # Nose is slightly below ear level
    lms[IDX_NOSE] = _make_landmark(IDX_NOSE, x=0.5, y=ear_y + 0.03)

    return lms


# ---------------------------------------------------------------------------
# Tests — Scenario 1: Person sitting upright
# ---------------------------------------------------------------------------


class TestPostureClassifierUpright(unittest.TestCase):
    """Scenario 1: Person sitting relatively upright → GOOD_POSTURE."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_upright_posture_classified_as_good(self) -> None:
        """High ear-shoulder ratio → GOOD_POSTURE."""
        # Use a ratio well above the 0.55 good threshold.
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.75)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.GOOD_POSTURE)

    def test_upright_at_exact_good_threshold(self) -> None:
        """Ratio exactly at good threshold → GOOD_POSTURE (boundary inclusive)."""
        # Default good threshold = 0.55
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.55)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.GOOD_POSTURE)


# ---------------------------------------------------------------------------
# Tests — Scenario 2: Person leaning forward / slouched
# ---------------------------------------------------------------------------


class TestPostureClassifierSlouchedPerson(unittest.TestCase):
    """Scenario 2: Person leaning forward → SLOUCHED."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_slouched_posture_classified_correctly(self) -> None:
        """Low ear-shoulder ratio → SLOUCHED."""
        # Use a ratio well below the 0.35 slouch threshold.
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.15)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.SLOUCHED_POSTURE)

    def test_slouched_at_boundary(self) -> None:
        """Ratio just below slouch threshold → SLOUCHED (boundary exclusive)."""
        # Default slouch threshold = 0.35; use 0.34 to be just below.
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.34)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.SLOUCHED_POSTURE)

    def test_head_very_low_gives_slouched(self) -> None:
        """Negative ratio (ear below shoulder level) → SLOUCHED."""
        lms = _make_upright_landmarks(ear_shoulder_ratio=-0.1)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.SLOUCHED_POSTURE)


# ---------------------------------------------------------------------------
# Tests — Scenario 3: Body turned or tilted
# ---------------------------------------------------------------------------


class TestPostureClassifierBodyTilt(unittest.TestCase):
    """Scenario 3: Large shoulder tilt (body rotated/tilted) → UNKNOWN."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_large_shoulder_tilt_returns_unknown(self) -> None:
        """Shoulder tilt ratio > 0.25 → UNKNOWN (geometry too ambiguous)."""
        # shoulder_span = 0.3; shoulder_tilt = 0.3 * 0.4 = 0.12 → tilt_ratio = 0.4 > 0.25.
        lms = _make_upright_landmarks(
            shoulder_span=0.3,
            ear_shoulder_ratio=0.70,
            shoulder_tilt=0.12,  # tilt_ratio = 0.12 / 0.3 = 0.40 > threshold
        )
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_small_tilt_still_classifies(self) -> None:
        """Small shoulder tilt (below threshold) should still produce a state."""
        lms = _make_upright_landmarks(
            shoulder_span=0.3,
            ear_shoulder_ratio=0.70,
            shoulder_tilt=0.04,  # tilt_ratio = 0.04 / 0.3 ≈ 0.13 < threshold
        )
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        # Should be GOOD_POSTURE since the ear-shoulder ratio is high
        self.assertEqual(result, PostureState.GOOD_POSTURE)

    def test_shoulders_overlapping_returns_unknown(self) -> None:
        """Shoulders at almost the same X position → degenerate span → UNKNOWN."""
        lms = _make_full_landmarks()
        # Force nearly identical X values so span ≈ 0 (degenerate geometry)
        lms[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, x=0.500001, y=0.60)
        lms[IDX_RIGHT_SHOULDER] = _make_landmark(IDX_RIGHT_SHOULDER, x=0.5, y=0.60)
        # Also set ears at a reasonable position
        lms[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, x=0.5, y=0.40)
        lms[IDX_RIGHT_EAR] = _make_landmark(IDX_RIGHT_EAR, x=0.5, y=0.40)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)


# ---------------------------------------------------------------------------
# Tests — Scenario 4: Partially visible ears / nose fallback
# ---------------------------------------------------------------------------


class TestPostureClassifierPartialLandmarks(unittest.TestCase):
    """Scenario 4: Partial landmark visibility."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_single_ear_visible_classifies_correctly(self) -> None:
        """One ear below visibility threshold but the other ear is used."""
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.70)
        # Remove the left ear from visibility
        lms[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, visibility=0.1)
        posture_lms = self.extractor.extract(_detected_result(lms))
        # right_ear should be used as single_ear
        self.assertIsNone(posture_lms.left_ear)
        self.assertIsNotNone(posture_lms.right_ear)
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.GOOD_POSTURE)

    def test_nose_fallback_when_no_ears(self) -> None:
        """Both ears below threshold; nose used as fallback head proxy."""
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.70)
        lms[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, visibility=0.1)
        lms[IDX_RIGHT_EAR] = _make_landmark(IDX_RIGHT_EAR, visibility=0.1)
        # Nose is positioned well above shoulders (ratio > good threshold)
        # ear_shoulder_ratio=0.70 → ear_y = shoulder_mid_y - 0.70*span
        # nose is set to ear_y + 0.03 by _make_upright_landmarks → ratio slightly smaller
        posture_lms = self.extractor.extract(_detected_result(lms))
        self.assertIsNone(posture_lms.left_ear)
        self.assertIsNone(posture_lms.right_ear)
        self.assertIsNotNone(posture_lms.nose)
        # Should still return a definitive state (depends on exact nose ratio)
        result = self.classifier.classify(posture_lms)
        # Nose ratio ≈ 0.70 - 0.03/span.  With span=0.3: ≈ 0.70 - 0.10 = 0.60 > 0.55
        self.assertEqual(result, PostureState.GOOD_POSTURE)

    def test_no_head_landmark_at_all_returns_unknown(self) -> None:
        """No ears, no nose → UNKNOWN."""
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.70)
        lms[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, visibility=0.1)
        lms[IDX_RIGHT_EAR] = _make_landmark(IDX_RIGHT_EAR, visibility=0.1)
        lms[IDX_NOSE] = _make_landmark(IDX_NOSE, visibility=0.1)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)


# ---------------------------------------------------------------------------
# Tests — Scenario 5: Missing / insufficient pose landmarks
# ---------------------------------------------------------------------------


class TestPostureClassifierMissingLandmarks(unittest.TestCase):
    """Scenario 5: Missing pose landmarks → UNKNOWN."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_shoulders_below_visibility_threshold(self) -> None:
        """Shoulders below visibility threshold → shoulders_valid=False → UNKNOWN."""
        lms = _make_full_landmarks(visibility=0.9)
        lms[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, visibility=0.1)
        lms[IDX_RIGHT_SHOULDER] = _make_landmark(IDX_RIGHT_SHOULDER, visibility=0.1)
        posture_lms = self.extractor.extract(_detected_result(lms))
        self.assertFalse(posture_lms.shoulders_valid)
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_one_shoulder_missing_returns_unknown(self) -> None:
        """One shoulder below threshold → shoulders_valid=False → UNKNOWN."""
        lms = _make_full_landmarks(visibility=0.9)
        lms[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, visibility=0.1)
        posture_lms = self.extractor.extract(_detected_result(lms))
        self.assertFalse(posture_lms.shoulders_valid)
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_too_few_landmarks_returns_unknown(self) -> None:
        """Landmark list too short → UNKNOWN."""
        short_lms = [_make_landmark(i) for i in range(5)]
        posture_lms = self.extractor.extract(_detected_result(short_lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_empty_landmark_list_returns_unknown(self) -> None:
        """Empty landmark list → UNKNOWN."""
        posture_lms = self.extractor.extract(_detected_result([]))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)


# ---------------------------------------------------------------------------
# Tests — Scenario 6: Low-confidence / unreliable landmark results
# ---------------------------------------------------------------------------


class TestPostureClassifierLowConfidence(unittest.TestCase):
    """Scenario 6: Low visibility / unreliable results."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_none_visibility_on_shoulder_returns_unknown(self) -> None:
        """visibility=None (no score available) → shoulder gated out → UNKNOWN."""
        lms = _make_full_landmarks(visibility=0.9)
        lm = _make_landmark(IDX_LEFT_SHOULDER)
        lm.visibility = None
        lms[IDX_LEFT_SHOULDER] = lm
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_nan_visibility_on_shoulder_returns_unknown(self) -> None:
        """visibility=NaN → gated out → UNKNOWN."""
        lms = _make_full_landmarks(visibility=0.9)
        lms[IDX_LEFT_SHOULDER] = _make_landmark(IDX_LEFT_SHOULDER, visibility=float("nan"))
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_non_finite_coordinate_on_shoulder_returns_unknown(self) -> None:
        """Infinite X on a shoulder → gated out → UNKNOWN."""
        lms = _make_full_landmarks(visibility=0.9)
        lms[IDX_RIGHT_SHOULDER] = _make_landmark(
            IDX_RIGHT_SHOULDER, x=float("inf"), visibility=0.9
        )
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_non_finite_coordinate_on_ear_falls_back_to_other_ear(self) -> None:
        """Inf coordinate on left ear: extractor gates it out, right ear used."""
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.70)
        lms[IDX_LEFT_EAR] = _make_landmark(IDX_LEFT_EAR, x=float("inf"), visibility=0.9)
        posture_lms = self.extractor.extract(_detected_result(lms))
        self.assertIsNone(posture_lms.left_ear)
        self.assertIsNotNone(posture_lms.right_ear)
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.GOOD_POSTURE)

    def test_strict_custom_threshold_makes_upright_unknown(self) -> None:
        """With a very strict good_threshold the same ratio lands in UNKNOWN."""
        classifier = PostureClassifier(
            ear_shoulder_good_threshold=0.99,   # almost unreachable
            ear_shoulder_slouch_threshold=0.35,
        )
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.70)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = classifier.classify(posture_lms)
        # 0.70 < 0.99 good threshold and >= 0.35 slouch threshold → dead zone → UNKNOWN
        self.assertEqual(result, PostureState.UNKNOWN)


# ---------------------------------------------------------------------------
# Tests — Scenario 7: No detectable person / pose model unavailable
# ---------------------------------------------------------------------------


class TestPostureClassifierNoPerson(unittest.TestCase):
    """Scenario 7: No person detected or pose model unavailable."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_model_unavailable_returns_unknown(self) -> None:
        """Pose model not loaded → UNKNOWN, no crash."""
        result_obj = PoseDetectionResult(
            available=False, state=PoseDetectionState.UNAVAILABLE
        )
        posture_lms = self.extractor.extract(result_obj)
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_not_detected_returns_unknown(self) -> None:
        """No person in frame → UNKNOWN."""
        result_obj = PoseDetectionResult(
            available=True, state=PoseDetectionState.NOT_DETECTED
        )
        posture_lms = self.extractor.extract(result_obj)
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_uncertain_state_returns_unknown(self) -> None:
        """UNCERTAIN pose state → UNKNOWN."""
        result_obj = PoseDetectionResult(
            available=True, state=PoseDetectionState.UNCERTAIN
        )
        posture_lms = self.extractor.extract(result_obj)
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)


# ---------------------------------------------------------------------------
# Tests — Additional: dead zone, geometry edge cases, nose fallback
# ---------------------------------------------------------------------------


class TestPostureClassifierDeadZone(unittest.TestCase):
    """Values between thresholds are classified as UNKNOWN (no boundary flicker)."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()
        self.classifier = PostureClassifier()

    def test_dead_zone_returns_unknown(self) -> None:
        """Ratio between slouch_threshold and good_threshold → UNKNOWN."""
        # Default: slouch=0.35, good=0.55 → dead zone is [0.35, 0.55)
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.45)  # in dead zone
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_just_below_good_threshold_is_unknown(self) -> None:
        """Ratio just below the good threshold lands in the dead zone."""
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.54)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_exact_slouch_threshold_is_unknown(self) -> None:
        """Ratio exactly at the slouch threshold is NOT SLOUCHED (exclusive boundary)."""
        # Use exact power-of-two span (0.25) to avoid IEEE 754 floating-point inaccuracy
        lms = _make_upright_landmarks(shoulder_span=0.25, ear_shoulder_ratio=0.35)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = self.classifier.classify(posture_lms)
        # 0.35 is NOT < 0.35, so it falls in the dead zone → UNKNOWN
        self.assertEqual(result, PostureState.UNKNOWN)


class TestPostureClassifierNeverRaises(unittest.TestCase):
    """
    The classifier must never raise — it should always return a string state.
    """

    def setUp(self) -> None:
        self.classifier = PostureClassifier()

    def test_classify_on_empty_posture_landmarks_returns_unknown(self) -> None:
        """Default PostureLandmarks (available=False) → UNKNOWN, no crash."""
        result = self.classifier.classify(PostureLandmarks())
        self.assertEqual(result, PostureState.UNKNOWN)
        self.assertIsInstance(result, str)

    def test_classify_never_raises_on_shoulder_only(self) -> None:
        """PostureLandmarks with valid shoulders but no head landmarks → UNKNOWN."""
        lm = PoseLandmark(index=0, name="T", x=0.5, y=0.5, z=0.0, visibility=0.9)
        posture_lms = PostureLandmarks(
            available=True,
            shoulders_valid=True,
            left_shoulder=PoseLandmark(
                index=11, name="LEFT_SHOULDER", x=0.35, y=0.6, z=0.0, visibility=0.9
            ),
            right_shoulder=PoseLandmark(
                index=12, name="RIGHT_SHOULDER", x=0.65, y=0.6, z=0.0, visibility=0.9
            ),
            # No ears, no nose
            left_ear=None,
            right_ear=None,
            nose=None,
        )
        result = self.classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.UNKNOWN)
        self.assertIsInstance(result, str)


class TestPostureClassifierCustomThresholds(unittest.TestCase):
    """Constructor thresholds override the defaults correctly."""

    def setUp(self) -> None:
        self.extractor = PostureLandmarkExtractor()

    def test_lenient_good_threshold_promotes_marginal_posture(self) -> None:
        """Lower good threshold means less upright posture still counts as good."""
        classifier = PostureClassifier(
            ear_shoulder_good_threshold=0.30,
            ear_shoulder_slouch_threshold=0.10,
        )
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.32)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = classifier.classify(posture_lms)
        self.assertEqual(result, PostureState.GOOD_POSTURE)

    def test_strict_slouch_threshold_does_not_flag_marginal_hunch(self) -> None:
        """Higher slouch threshold means smaller hunches are NOT flagged."""
        classifier = PostureClassifier(
            ear_shoulder_good_threshold=0.60,
            ear_shoulder_slouch_threshold=0.10,  # very lenient slouch threshold
        )
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.30)  # quite hunched
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = classifier.classify(posture_lms)
        # 0.30 >= 0.10 and 0.30 < 0.60 → dead zone → UNKNOWN
        self.assertEqual(result, PostureState.UNKNOWN)

    def test_very_strict_slouch_threshold_flags_even_marginal_cases(self) -> None:
        """Raising the slouch threshold means even moderate ratios are SLOUCHED."""
        classifier = PostureClassifier(
            ear_shoulder_good_threshold=0.80,
            ear_shoulder_slouch_threshold=0.60,  # very high threshold
        )
        lms = _make_upright_landmarks(ear_shoulder_ratio=0.55)
        posture_lms = self.extractor.extract(_detected_result(lms))
        result = classifier.classify(posture_lms)
        # 0.55 < 0.60 → SLOUCHED
        self.assertEqual(result, PostureState.SLOUCHED_POSTURE)


if __name__ == "__main__":
    unittest.main()
