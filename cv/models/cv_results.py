"""
FocusLens — CV Results Structure
================================
Defines the output structure of the CV processing pipeline.
"""
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
import time

class CVState:
    """Possible states for the overall CV pipeline or specific detectors."""
    DETECTED = "DETECTED"
    NOT_DETECTED = "NOT_DETECTED"
    UNAVAILABLE = "UNAVAILABLE"
    UNCERTAIN = "UNCERTAIN"
    INVALID_FRAME = "INVALID_FRAME"


@dataclass
class CVResult:
    """
    Application-friendly Computer Vision Result.
    This structure is designed to be easily serialized to JSON and sent to the Tauri frontend.
    """
    timestamp: float = field(default_factory=time.time)
    status: str = CVState.UNAVAILABLE
    
    # Day 08 Fields
    face_detected: bool = False
    face_landmarks: Optional[List[Dict[str, float]]] = None
    
    # Future features (Day 09+)
    # person: Optional[str] = None
    # screen_facing: Optional[str] = None
    # posture: Optional[str] = None
    # activity: Optional[str] = None
    
    # Internal fields for debugging, not necessarily sent to frontend
    error_message: Optional[str] = None
