"""
FocusLens — Posture Classifier
================================
Day 14: Basic posture classification using validated upper-body landmarks.

Responsibility
--------------
Consumes a ``PostureLandmarks`` object produced by
``PostureLandmarkExtractor`` (Day 13) and returns one of three states:

    PostureState.GOOD_POSTURE   – The person appears to be sitting upright.
    PostureState.SLOUCHED       – The person appears to be leaning forward
                                  or hunching, based on geometric cues.
    PostureState.UNKNOWN        – Essential landmarks are missing, confidence
                                  is too low, or the geometry is ambiguous.

Classification heuristic — ear–shoulder drop ratio
----------------------------------------------------
The primary signal is the *vertical distance* from the visible ear(s) to
the midpoint of the two shoulders, expressed as a fraction of the
*horizontal shoulder span*:

    ear_y          — normalised Y coordinate of the best available ear
                     (average of both if both are visible, otherwise the
                     single visible ear).
    shoulder_mid_y — average Y of the left and right shoulder.
    shoulder_span  — horizontal distance |left_shoulder.x - right_shoulder.x|.

    ear_to_shoulder_ratio = (shoulder_mid_y - ear_y) / shoulder_span

In normalised MediaPipe coordinates **Y increases downward**, so
``shoulder_mid_y - ear_y`` is positive when the ear is *above* the
shoulder midpoint, which is the expected upright position.

Intuition for the ratio
-----------------------
Dividing by the shoulder span makes the metric *scale-invariant*: it does
not depend on how far the person is from the camera.

When a person sits upright the ear sits well above the shoulders, giving a
relatively *large positive* ratio.  When they hunch forward their head
drops toward the shoulders, compressing the gap, and the ratio becomes
smaller or even negative.

Thresholds (configurable via ``config/stability.py``)
------------------------------------------------------
    POSTURE_EAR_SHOULDER_GOOD_THRESHOLD
        Minimum ratio required to report GOOD_POSTURE.
        If the ratio >= this value, the person is considered upright.

    POSTURE_EAR_SHOULDER_SLOUCH_THRESHOLD
        Maximum ratio below which the person is considered SLOUCHED.
        If the ratio < this value, the person is considered to be slouching.

    Values between the two thresholds are classified as UNKNOWN to avoid
    boundary flickering — a small dead zone in the middle.

    Both thresholds and the dead zone can be widened or narrowed without
    touching the classification code.

Secondary check — shoulder symmetry
-------------------------------------
A large left-to-right shoulder height difference
(``|left_shoulder.y - right_shoulder.y| / shoulder_span``) suggests the
body is strongly rotated or tilted sideways.  In that case the
ear-shoulder metric is less reliable, so the result is UNKNOWN.

    POSTURE_MAX_SHOULDER_TILT_RATIO
        Maximum allowable shoulder height asymmetry ratio before the frame
        is considered too ambiguous to classify.

Fallback — nose as ear proxy
------------------------------
When *neither* ear is available (person turned sideways, etc.) the nose
landmark is used as an approximate head-height proxy.  The nose sits lower
than the ears, so its ratio is expected to be smaller than an ear-based
ratio.  The same thresholds are applied; the nose path is logged for
diagnostics.

Important limitations
---------------------
* The heuristic is based on a *single frame*; it is intentionally
  stateless.  Frame-to-frame smoothing / debouncing is the responsibility
  of a future reliability tracker (planned for Day 15).
* Normalised coordinates are sensitive to camera angle and distance.
  The thresholds are initial estimates and should be re-evaluated with
  real users.
* This is a *visual posture estimate*, not a medical or ergonomic
  assessment.
* Head visibility and body orientation affect all metrics.  No single
  landmark angle reliably identifies slouching in all conditions.

Privacy note
------------
No webcam frames or raw landmark data leave this device.
All processing is local.
"""

from __future__ import annotations

from math import isfinite
from typing import Optional, Tuple

from config import (
    POSTURE_EAR_SHOULDER_GOOD_THRESHOLD,
    POSTURE_EAR_SHOULDER_SLOUCH_THRESHOLD,
    POSTURE_MAX_SHOULDER_TILT_RATIO,
)
from models.cv_results import PostureState
from services.posture_landmark_extractor import PostureLandmarks
from services.pose_landmarker import PoseLandmark
from utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Minimum shoulder span below which geometry is considered degenerate.
# Guards against divide-by-zero when shoulders overlap in the image.
# ---------------------------------------------------------------------------
_MIN_SHOULDER_SPAN: float = 1e-3


class PostureClassifier:
    """
    Classifies posture from validated upper-body pose landmarks.

    The classifier is **stateless across frames**: each ``classify()`` call
    is fully independent.  This makes it easy to test and reason about in
    isolation.  Cross-frame smoothing belongs in a separate reliability
    layer (planned for Day 15).

    Usage::

        classifier = PostureClassifier()
        state = classifier.classify(posture_landmarks)
        # state is one of PostureState.{GOOD_POSTURE, SLOUCHED, UNKNOWN}

    The classifier is safe to call on every frame.  It never raises an
    exception: any error or insufficient data results in UNKNOWN.

    Thresholds are configurable via the constructor or via
    ``cv/config/stability.py``.
    """

    def __init__(
        self,
        ear_shoulder_good_threshold: float = POSTURE_EAR_SHOULDER_GOOD_THRESHOLD,
        ear_shoulder_slouch_threshold: float = POSTURE_EAR_SHOULDER_SLOUCH_THRESHOLD,
        max_shoulder_tilt_ratio: float = POSTURE_MAX_SHOULDER_TILT_RATIO,
    ) -> None:
        """
        Args:
            ear_shoulder_good_threshold:
                Minimum ear-to-shoulder ratio for GOOD_POSTURE.
                Increase to require a more upright position.
            ear_shoulder_slouch_threshold:
                Maximum ear-to-shoulder ratio for SLOUCHED.
                Decrease to require a more extreme hunch before flagging.
            max_shoulder_tilt_ratio:
                Maximum tolerated shoulder height asymmetry (as a ratio of
                the shoulder span).  Frames exceeding this fall through to
                UNKNOWN.
        """
        self._good_threshold = ear_shoulder_good_threshold
        self._slouch_threshold = ear_shoulder_slouch_threshold
        self._max_shoulder_tilt = max_shoulder_tilt_ratio

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def classify(self, posture_landmarks: PostureLandmarks) -> str:
        """
        Classify posture from extracted and validated upper-body landmarks.

        Args:
            posture_landmarks:
                Output of ``PostureLandmarkExtractor.extract()``.

        Returns:
            One of ``PostureState.GOOD_POSTURE``, ``PostureState.SLOUCHED``,
            or ``PostureState.UNKNOWN``.  Never raises.
        """
        try:
            return self._classify_safe(posture_landmarks)
        except Exception as exc:  # pylint: disable=broad-except
            log.warning("Unexpected error during posture classification: %s", exc)
            return PostureState.UNKNOWN

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _classify_safe(self, lms: PostureLandmarks) -> str:
        """Inner classification logic wrapped by classify()."""

        # --- Guard: no usable data at all ---
        if not lms.available:
            log.debug("Posture classification skipped: pose not available.")
            return PostureState.UNKNOWN

        # --- Guard: shoulders are the minimum requirement ---
        if not lms.shoulders_valid:
            log.debug("Posture classification skipped: shoulders not valid.")
            return PostureState.UNKNOWN

        left_sh = lms.left_shoulder   # guaranteed non-None when shoulders_valid
        right_sh = lms.right_shoulder

        # ----------------------------------------------------------------
        # Step 1 — Validate shoulder geometry
        # ----------------------------------------------------------------
        shoulder_span, shoulder_tilt_ratio, shoulder_mid_y = (
            self._compute_shoulder_geometry(left_sh, right_sh)
        )

        if shoulder_span is None:
            # Degenerate geometry (overlapping or non-finite coordinates).
            return PostureState.UNKNOWN

        # A large tilt suggests the body is strongly rotated sideways;
        # the ear-shoulder metric is less reliable in that case.
        if shoulder_tilt_ratio > self._max_shoulder_tilt:
            log.debug(
                "Posture UNKNOWN: shoulder tilt too large (%.3f > %.3f).",
                shoulder_tilt_ratio,
                self._max_shoulder_tilt,
            )
            return PostureState.UNKNOWN

        # ----------------------------------------------------------------
        # Step 2 — Determine best available head-height reference
        # ----------------------------------------------------------------
        head_y, head_source = self._best_head_y(lms)

        if head_y is None:
            log.debug("Posture UNKNOWN: no usable head landmark (ears or nose).")
            return PostureState.UNKNOWN

        # ----------------------------------------------------------------
        # Step 3 — Compute the ear-to-shoulder ratio
        # ----------------------------------------------------------------
        # In normalised Y (downward = positive in MediaPipe coordinates):
        #   shoulder_mid_y > head_y  when the head is above the shoulders.
        #   The ratio is positive when the person is upright.
        ratio = (shoulder_mid_y - head_y) / shoulder_span

        if not isfinite(ratio):
            log.debug("Posture UNKNOWN: non-finite ratio.")
            return PostureState.UNKNOWN

        log.debug(
            "Posture: head_source=%s ratio=%.3f (good>=%.3f, slouch<%.3f)",
            head_source,
            ratio,
            self._good_threshold,
            self._slouch_threshold,
        )

        # ----------------------------------------------------------------
        # Step 4 — Threshold decision
        # ----------------------------------------------------------------
        return self._threshold_decision(
            ratio,
            good_threshold=self._good_threshold,
            slouch_threshold=self._slouch_threshold,
        )

    # ----------------------------------------------------------------
    # Geometry helpers
    # ----------------------------------------------------------------

    @staticmethod
    def _compute_shoulder_geometry(
        left_sh: PoseLandmark,
        right_sh: PoseLandmark,
    ) -> Tuple[Optional[float], float, float]:
        """
        Compute shoulder span, tilt ratio, and midpoint Y.

        Returns:
            (shoulder_span, tilt_ratio, shoulder_mid_y).
            ``shoulder_span`` is ``None`` when geometry is degenerate.
        """
        if not (
            isfinite(left_sh.x) and isfinite(left_sh.y)
            and isfinite(right_sh.x) and isfinite(right_sh.y)
        ):
            return None, 0.0, 0.0

        shoulder_span = abs(right_sh.x - left_sh.x)
        shoulder_mid_y = (left_sh.y + right_sh.y) / 2.0
        shoulder_height_diff = abs(left_sh.y - right_sh.y)

        if shoulder_span < _MIN_SHOULDER_SPAN:
            # Shoulders are almost overlapping in the image — geometry is
            # degenerate (person facing directly sideways).
            return None, 0.0, 0.0

        tilt_ratio = shoulder_height_diff / shoulder_span
        return shoulder_span, tilt_ratio, shoulder_mid_y

    @staticmethod
    def _best_head_y(lms: PostureLandmarks) -> Tuple[Optional[float], str]:
        """
        Return the best available vertical head-position estimate and its
        source label (``"both_ears"``, ``"single_ear"``, or ``"nose"``).

        Priority:
            1. Average of both ears — most stable when the person faces forward.
            2. Whichever single ear is available.
            3. Nose — proxy, lower accuracy; ears preferred when available.

        Returns ``(None, "")`` when no usable head landmark is available.
        """
        left_ear = lms.left_ear
        right_ear = lms.right_ear
        nose = lms.nose

        if left_ear is not None and right_ear is not None:
            ear_y = (left_ear.y + right_ear.y) / 2.0
            if isfinite(ear_y):
                return ear_y, "both_ears"

        if left_ear is not None and isfinite(left_ear.y):
            return left_ear.y, "single_ear"

        if right_ear is not None and isfinite(right_ear.y):
            return right_ear.y, "single_ear"

        # Fall back to nose when ears are unavailable.
        if nose is not None and isfinite(nose.y):
            return nose.y, "nose"

        return None, ""

    @staticmethod
    def _threshold_decision(
        ratio: float,
        good_threshold: float,
        slouch_threshold: float,
    ) -> str:
        """
        Apply threshold logic and return a PostureState string.

        Dead zone: values in [slouch_threshold, good_threshold) are classified
        as UNKNOWN to avoid boundary flickering.  Frame-to-frame smoothing is
        the responsibility of a future reliability layer.
        """
        if ratio >= good_threshold:
            return PostureState.GOOD_POSTURE
        if ratio < slouch_threshold:
            return PostureState.SLOUCHED_POSTURE
        # Dead zone — too ambiguous to commit to a classification.
        return PostureState.UNKNOWN
