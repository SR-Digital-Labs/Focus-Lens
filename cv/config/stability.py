"""Confidence and debounce thresholds for CV state tracking."""

PRESENCE_CONSECUTIVE_DETECTION_THRESHOLD: int = 3
PRESENCE_CONSECUTIVE_MISSING_THRESHOLD: int = 5

SCREEN_FACING_MIN_CONFIDENCE: float = 0.15
SCREEN_FACING_CONSECUTIVE_STATE_THRESHOLD: int = 3
SCREEN_FACING_CONSECUTIVE_UNKNOWN_THRESHOLD: int = 3

# Day 13 — Posture landmark extraction
# Minimum MediaPipe visibility score (0.0–1.0) for a pose landmark to be
# considered reliable enough for posture analysis.  Landmarks below this
# threshold are treated as missing and the posture state falls back to UNKNOWN.
# Lower = accept more uncertain landmarks; higher = stricter quality gate.
POSTURE_MIN_LANDMARK_VISIBILITY: float = 0.5
