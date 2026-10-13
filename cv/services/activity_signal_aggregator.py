"""
FocusLens — Activity Signal Aggregator
=======================================
Day 12 & Day 15: Aggregates individual frame results into a stable application state.
Only emits updates when the overall state changes to avoid unnecessary noise.

Supports:
- Tracking person presence, screen facing, and posture states.
- Callback / listener registration for state transition events.
- Direct state queries for application components (like Focus Session Engine).
- Idempotent suppression of duplicate signals when state has not changed.
"""

from __future__ import annotations

from typing import Optional, Dict, Any, List, Callable
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
        self._current_person: str = PersonState.UNKNOWN
        self._current_facing: str = ScreenFacingState.UNKNOWN
        self._current_posture: str = PostureState.UNKNOWN
        self._last_signal_time: float = 0.0
        self._listeners: List[Callable[[Dict[str, Any]], None]] = []

    # ------------------------------------------------------------------
    # Properties & State Accessors
    # ------------------------------------------------------------------

    @property
    def current_person(self) -> str:
        """Current stable person presence state."""
        return self._current_person

    @property
    def current_facing(self) -> str:
        """Current stable screen-facing state."""
        return self._current_facing

    @property
    def current_posture(self) -> str:
        """Current stable posture state."""
        return self._current_posture

    @property
    def last_signal_time(self) -> float:
        """Timestamp of the most recent state change."""
        return self._last_signal_time

    def get_current_state(self) -> Dict[str, Any]:
        """
        Return a dictionary snapshot of the current application state.
        """
        return {
            "person_presence": self._current_person,
            "screen_facing": self._current_facing,
            "posture": self._current_posture,
            "timestamp": self._last_signal_time,
        }

    # ------------------------------------------------------------------
    # Listener Registration
    # ------------------------------------------------------------------

    def add_listener(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Register a callback to be notified when application state changes."""
        if callback not in self._listeners:
            self._listeners.append(callback)

    def remove_listener(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Unregister an existing callback."""
        if callback in self._listeners:
            self._listeners.remove(callback)

    def reset(self) -> None:
        """Reset internal application state to UNKNOWN."""
        self._current_person = PersonState.UNKNOWN
        self._current_facing = ScreenFacingState.UNKNOWN
        self._current_posture = PostureState.UNKNOWN
        self._last_signal_time = 0.0

    # ------------------------------------------------------------------
    # State Updates
    # ------------------------------------------------------------------

    def update(self, frame_result: FrameResult) -> Optional[Dict[str, Any]]:
        """
        Ingest a FrameResult and determine if the application state has changed.
        
        Args:
            frame_result: The processed frame result from the CV pipeline.
            
        Returns:
            A dictionary representing the ActivitySignal if the state changed,
            otherwise None.
        """
        person_state = getattr(frame_result, "person_state", PersonState.UNKNOWN)
        facing_state = getattr(frame_result, "screen_facing_state", ScreenFacingState.UNKNOWN)
        posture_state = getattr(frame_result, "posture_state", PostureState.UNKNOWN)
        facing_confidence = getattr(frame_result, "screen_facing_confidence", 0.0)

        return self.update_direct(
            person_state=person_state,
            facing_state=facing_state,
            posture_state=posture_state,
            confidence=facing_confidence,
        )

    def update_direct(
        self,
        person_state: str,
        facing_state: str,
        posture_state: str,
        confidence: float = 0.0,
    ) -> Optional[Dict[str, Any]]:
        """
        Directly update state components and emit signal if any state changed.
        """
        changed = False

        # Normalize posture state to avoid any string mismatches
        normalized_posture = PostureState.normalize(posture_state)

        # Check for state transitions
        if person_state != self._current_person:
            self._current_person = person_state
            changed = True

        if facing_state != self._current_facing:
            self._current_facing = facing_state
            changed = True

        if normalized_posture != self._current_posture:
            self._current_posture = normalized_posture
            changed = True

        # If any tracked state changed, construct a new signal
        if changed:
            self._last_signal_time = time.time()
            signal = {
                "person_presence": self._current_person,
                "screen_facing": self._current_facing,
                "posture": self._current_posture,
                "confidence": confidence,
                "timestamp": self._last_signal_time,
            }
            log.info(
                "Activity Signal Updated: Person=%s | Facing=%s | Posture=%s | Conf=%.2f",
                self._current_person,
                self._current_facing,
                self._current_posture,
                confidence,
            )

            # Notify listeners
            for listener in list(self._listeners):
                try:
                    listener(signal)
                except Exception as exc:  # pylint: disable=broad-except
                    log.error("Error in activity signal listener: %s", exc)

            return signal

        return None
