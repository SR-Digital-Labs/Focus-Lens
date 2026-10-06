"""Application-friendly output structures for the CV processing pipeline."""

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
import time

class CVState:
    """Possible states for the overall CV pipeline or specific detectors."""
    DETECTED = "DETECTED"
    NOT_DETECTED = "NOT_DETECTED"
    UNAVAILABLE = "UNAVAILABLE"
    UNCERTAIN = "UNCERTAIN"
    UNKNOWN = "UNKNOWN"
    INVALID_FRAME = "INVALID_FRAME"


@dataclass
class PresenceResult:
    """
    Day 09: Person Presence Result
    """
    state: str
    timestamp: float = field(default_factory=time.time)
    detection_available: bool = False


@dataclass
class CVResult:
    """
    Stable per-frame CV data for application consumers.

    Detector services return their own result types. This model contains only
    plain values and coordinate dictionaries, so it can be JSON serialized
    without exposing MediaPipe objects.
    """
    timestamp: float = field(default_factory=time.time)
    status: str = CVState.UNKNOWN
    face_detected: Optional[bool] = None
    landmarks: Optional[List[Dict[str, Any]]] = None

    pose_detection_state: str = CVState.UNKNOWN
    pose_detected: Optional[bool] = None
    pose_landmarks: Optional[List[Dict[str, Any]]] = None

    person_presence: str = CVState.UNKNOWN
    screen_facing: str = CVState.UNKNOWN
    posture: str = CVState.UNKNOWN
    activity: Optional[str] = None
    confidence: Optional[float] = None
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Return a JSON-ready copy of the application result."""
        return asdict(self)
