"""Debounce screen-facing classifications across consecutive frames."""

from __future__ import annotations

from math import isfinite

from config import (
    SCREEN_FACING_CONSECUTIVE_STATE_THRESHOLD,
    SCREEN_FACING_CONSECUTIVE_UNKNOWN_THRESHOLD,
    SCREEN_FACING_MIN_CONFIDENCE,
)
from models.cv_results import ScreenFacingState
from utils.logger import get_logger

log = get_logger(__name__)


class ScreenFacingReliabilityTracker:
    """Convert per-frame classifications into stable screen-facing states."""

    def __init__(self) -> None:
        self._stable_state = ScreenFacingState.UNKNOWN
        self._candidate_state = ScreenFacingState.UNKNOWN
        self._candidate_count = 0
        self._uncertain_count = 0

    def process(self, state: str, confidence: float) -> str:
        """Return a debounced state, treating weak or invalid results as unknown."""
        if (
            state not in (
                ScreenFacingState.SCREEN_FACING,
                ScreenFacingState.LOOKING_AWAY,
            )
            or not isfinite(confidence)
            or not 0.0 <= confidence <= 1.0
            or confidence < SCREEN_FACING_MIN_CONFIDENCE
        ):
            self._candidate_state = ScreenFacingState.UNKNOWN
            self._candidate_count = 0
            self._uncertain_count += 1
            if (
                self._uncertain_count
                >= SCREEN_FACING_CONSECUTIVE_UNKNOWN_THRESHOLD
            ):
                self._stable_state = ScreenFacingState.UNKNOWN
            return self._stable_state

        self._uncertain_count = 0
        if state == self._stable_state:
            self._candidate_state = ScreenFacingState.UNKNOWN
            self._candidate_count = 0
            return self._stable_state

        if state == self._candidate_state:
            self._candidate_count += 1
        else:
            self._candidate_state = state
            self._candidate_count = 1

        if self._candidate_count >= SCREEN_FACING_CONSECUTIVE_STATE_THRESHOLD:
            self._stable_state = state
            self._candidate_state = ScreenFacingState.UNKNOWN
            self._candidate_count = 0

        log.debug(
            "Raw screen-facing state: %s | Confidence: %.2f | "
            "Candidate count: %d | Stable state: %s",
            state,
            confidence,
            self._candidate_count,
            self._stable_state,
        )
        return self._stable_state
