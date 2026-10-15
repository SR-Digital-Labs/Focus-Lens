"""Generate gentle reminders for sustained, reliable slouched posture."""

from __future__ import annotations

from math import isfinite
import time
from typing import Callable, Optional

from config import POSTURE_REMINDER_THRESHOLD_SECONDS, POSTURE_REMINDERS_ENABLED
from models.cv_results import PersonState, PostureState


class PostureReminderTracker:
    """Emit one reminder after a continuous interval of confirmed slouching."""

    def __init__(
        self,
        enabled: bool = POSTURE_REMINDERS_ENABLED,
        threshold_seconds: float = POSTURE_REMINDER_THRESHOLD_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not isfinite(threshold_seconds) or threshold_seconds <= 0:
            raise ValueError("Posture reminder threshold must be a finite positive number.")

        self._enabled = enabled
        self._threshold_seconds = threshold_seconds
        self._clock = clock
        self._slouched_since: Optional[float] = None
        self._reminded = False

    def process(
        self,
        posture_state: str,
        person_state: str,
        now: Optional[float] = None,
        *,
        posture_observation_reliable: bool = True,
        person_observation_reliable: bool = True,
    ) -> bool:
        """Return True once when reliable slouching reaches its configured duration."""
        if (
            not self._enabled
            or posture_state != PostureState.SLOUCHED_POSTURE
            or person_state != PersonState.PRESENT
            or not posture_observation_reliable
            or not person_observation_reliable
        ):
            self.reset()
            return False

        observed_at = self._clock() if now is None else now
        if not isfinite(observed_at):
            raise ValueError("Posture reminder time must be finite.")
        if self._slouched_since is None:
            self._slouched_since = observed_at
            return False
        if observed_at < self._slouched_since:
            raise ValueError("Posture reminder time must be monotonic.")

        if (
            not self._reminded
            and observed_at - self._slouched_since >= self._threshold_seconds
        ):
            self._reminded = True
            return True
        return False

    def reset(self) -> None:
        """Clear the active interval after recovery, uncertainty, or absence."""
        self._slouched_since = None
        self._reminded = False
