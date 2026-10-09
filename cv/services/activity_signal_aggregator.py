"""
FocusLens — Activity Signal Aggregator
=======================================
Day 12: Aggregates individual frame results into a stable application state.
Only emits updates when the overall state changes to avoid unnecessary noise.
"""

from typing import Optional, Dict, Any
import time

from models.cv_results import PersonState, ScreenFacingState, PostureState
from services.frame_processor import FrameResult
from utils.logger import get_logger

log = get_logger(__name__)


class ActivitySignalAggregator:
    """
    Tracks application-level state across multiple frames.
    Produces an updated signal only when the underlying CV state changes.
    """

    def __init__(self) -> None:
        self._current_person = PersonState.UNKNOWN
        self._current_facing = ScreenFacingState.UNKNOWN
        self._current_posture = PostureState.UNKNOWN
        self._last_signal_time = 0.0

    def update(self, frame_result: FrameResult) -> Optional[Dict[str, Any]]:
        """
        Ingest a FrameResult and determine if the application state has changed.
        
        Args:
            frame_result: The processed frame result from the CV pipeline.
            
        Returns:
            A dictionary representing the ActivitySignal if the state changed,
            otherwise None.
        """
        changed = False

        # Extract states, safely falling back to UNKNOWN if not present
        person_state = getattr(frame_result, "person_state", PersonState.UNKNOWN)
        facing_state = getattr(frame_result, "screen_facing_state", ScreenFacingState.UNKNOWN)
        posture_state = getattr(frame_result, "posture_state", PostureState.UNKNOWN)
        facing_confidence = getattr(frame_result, "screen_facing_confidence", 0.0)

        # Check for state transitions
        if person_state != self._current_person:
            self._current_person = person_state
            changed = True

        if facing_state != self._current_facing:
            self._current_facing = facing_state
            changed = True

        if posture_state != self._current_posture:
            self._current_posture = posture_state
            changed = True

        # If any tracked state changed, construct a new signal
        if changed:
            self._last_signal_time = time.time()
            signal = {
                "person_presence": self._current_person,
                "screen_facing": self._current_facing,
                "posture": self._current_posture,
                "confidence": facing_confidence,
                "timestamp": self._last_signal_time,
            }
            log.info(
                "Activity Signal Updated: Person=%s | Facing=%s | Posture=%s | Conf=%.2f",
                self._current_person,
                self._current_facing,
                self._current_posture,
                facing_confidence,
            )
            return signal

        return None
