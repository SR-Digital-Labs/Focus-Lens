"""
FocusLens — Posture Reliability Tracker
======================================
Day 15: Debounce posture classifications across consecutive frames.

Responsibility
--------------
Converts per-frame classifications (from PostureClassifier, Day 14) into a stable,
debounced application posture state (GOOD_POSTURE / SLOUCHED / UNKNOWN).

Key behaviors:
1. Prevents rapid flickering at decision boundaries by requiring consecutive frames
   (POSTURE_CONSECUTIVE_STATE_THRESHOLD) before switching states.
2. Tolerates temporary single-frame detection glitches or missing landmarks without
   prematurely resetting to UNKNOWN.
3. Transitions cleanly to UNKNOWN after sustained absence or ambiguous geometry
   (POSTURE_CONSECUTIVE_UNKNOWN_THRESHOLD frames).
4. Safely resets posture to UNKNOWN immediately when a person is detected AWAY.
5. Operates strictly locally — zero cloud data transfer.
"""

from __future__ import annotations

from typing import Optional

from config import (
    POSTURE_CONSECUTIVE_STATE_THRESHOLD,
    POSTURE_CONSECUTIVE_UNKNOWN_THRESHOLD,
)
from models.cv_results import PostureState, PersonState
from utils.logger import get_logger

log = get_logger(__name__)


class PostureReliabilityTracker:
    """
    Debounces raw posture classifications across consecutive frames to produce
    a stable, reliable application posture state.
    """

    def __init__(
        self,
        consecutive_state_threshold: int = POSTURE_CONSECUTIVE_STATE_THRESHOLD,
        consecutive_unknown_threshold: int = POSTURE_CONSECUTIVE_UNKNOWN_THRESHOLD,
    ) -> None:
        """
        Args:
            consecutive_state_threshold: Number of consecutive consistent frames
                required to switch between GOOD_POSTURE and SLOUCHED.
            consecutive_unknown_threshold: Number of consecutive uncertain/missing
                frames required before the stable state falls back to UNKNOWN.
        """
        self._consecutive_state_threshold = max(1, consecutive_state_threshold)
        self._consecutive_unknown_threshold = max(1, consecutive_unknown_threshold)

        self._stable_state: str = PostureState.UNKNOWN
        self._candidate_state: str = PostureState.UNKNOWN
        self._candidate_count: int = 0
        self._uncertain_count: int = 0

    @property
    def stable_state(self) -> str:
        """The current stable application posture state."""
        return self._stable_state

    @property
    def candidate_state(self) -> str:
        """Current candidate posture state being considered."""
        return self._candidate_state

    @property
    def candidate_count(self) -> int:
        """Number of consecutive frames observed for the current candidate."""
        return self._candidate_count

    @property
    def uncertain_count(self) -> int:
        """Number of consecutive uncertain/unknown frames observed."""
        return self._uncertain_count

    def reset(self) -> None:
        """Reset the tracker state back to initial UNKNOWN conditions."""
        self._stable_state = PostureState.UNKNOWN
        self._candidate_state = PostureState.UNKNOWN
        self._candidate_count = 0
        self._uncertain_count = 0
        log.debug("PostureReliabilityTracker reset to UNKNOWN.")

    def process(
        self,
        raw_state: str,
        person_state: Optional[str] = None,
    ) -> str:
        """
        Process a per-frame posture classification and return the stable state.

        Args:
            raw_state: The per-frame posture state from ``PostureClassifier.classify()``.
                Supports ``GOOD_POSTURE``, ``SLOUCHED``, ``SLOUCHED_POSTURE``, or ``UNKNOWN``.
            person_state: Optional person presence state (e.g. from ``PresenceReliabilityTracker``).
                If ``PersonState.AWAY``, posture is immediately forced to ``UNKNOWN``.

        Returns:
            The stable, debounced posture state (one of ``PostureState.GOOD_POSTURE``,
            ``PostureState.SLOUCHED_POSTURE``, or ``PostureState.UNKNOWN``).
        """
        # Guard: If person is confirmed AWAY, posture cannot be good or slouched.
        if person_state == PersonState.AWAY:
            self._candidate_state = PostureState.UNKNOWN
            self._candidate_count = 0
            self._uncertain_count = 0
            self._stable_state = PostureState.UNKNOWN
            log.debug("Person AWAY -> Posture reset to UNKNOWN immediately.")
            return self._stable_state

        normalized = PostureState.normalize(raw_state)

        # Handle UNKNOWN / uncertain detections
        if normalized == PostureState.UNKNOWN:
            self._candidate_state = PostureState.UNKNOWN
            self._candidate_count = 0
            self._uncertain_count += 1

            if self._uncertain_count >= self._consecutive_unknown_threshold:
                self._stable_state = PostureState.UNKNOWN

            log.debug(
                "Raw Posture: UNKNOWN | Uncertain streak: %d/%d | Stable: %s",
                self._uncertain_count,
                self._consecutive_unknown_threshold,
                self._stable_state,
            )
            return self._stable_state

        # Handle valid posture state (GOOD_POSTURE or SLOUCHED_POSTURE)
        self._uncertain_count = 0

        # If already in this stable state, cancel candidate tracking
        if normalized == self._stable_state:
            self._candidate_state = PostureState.UNKNOWN
            self._candidate_count = 0
            return self._stable_state

        # Track candidate state transitions
        if normalized == self._candidate_state:
            self._candidate_count += 1
        else:
            self._candidate_state = normalized
            self._candidate_count = 1

        if self._candidate_count >= self._consecutive_state_threshold:
            log.info(
                "Posture transition: %s -> %s (confirmed after %d frames)",
                self._stable_state,
                normalized,
                self._candidate_count,
            )
            self._stable_state = normalized
            self._candidate_state = PostureState.UNKNOWN
            self._candidate_count = 0

        log.debug(
            "Raw: %s | Candidate: %s (%d/%d) | Stable: %s",
            normalized,
            self._candidate_state,
            self._candidate_count,
            self._consecutive_state_threshold,
            self._stable_state,
        )
        return self._stable_state
