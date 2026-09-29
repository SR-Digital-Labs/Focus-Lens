"""
FocusLens — CV Configuration
=============================
Central configuration for the Computer Vision layer.

All tunable values live here. No magic numbers are scattered
throughout the codebase.

Privacy notice
--------------
FocusLens processes all webcam frames locally on the user's device.
No frames, images, or video are uploaded to any external service.
"""

# ---------------------------------------------------------------------------
# Camera settings
# ---------------------------------------------------------------------------

# Index of the camera device to open.
# 0 = default / built-in webcam.
# Increase if you have multiple cameras (1, 2, …).
CAMERA_INDEX: int = 0

# Resolution requested from the webcam.
# OpenCV may choose the nearest resolution the device supports.
CAMERA_WIDTH: int = 640
CAMERA_HEIGHT: int = 480

# Target frame-processing rate (frames per second).
# The capture loop will aim for this rate; it is not guaranteed.
TARGET_FPS: int = 30

# ---------------------------------------------------------------------------
# Frame processing
# ---------------------------------------------------------------------------

# Scale factor applied before running CV algorithms.
# 1.0 = full resolution; 0.5 = half size (faster but less detail).
FRAME_SCALE: float = 1.0

# Colour space used internally (BGR is OpenCV's default).
INTERNAL_COLOR_SPACE: str = "BGR"

# ---------------------------------------------------------------------------
# MediaPipe Face Landmarker  (Day 05+)
# ---------------------------------------------------------------------------

# Path to the MediaPipe Face Landmarker .task model bundle.
# The model is downloaded once and stored in cv/models/.
# All inference runs locally — no network access after download.
import os as _os
MEDIAPIPE_MODEL_PATH: str = _os.path.join(
    _os.path.dirname(__file__),  # cv/config/
    "..",                         # cv/
    "models",
    "face_landmarker.task",
)

# Minimum confidence for a detection to be accepted.
# Range: 0.0 – 1.0.  Lower = more sensitive but more false positives.
FACE_DETECTION_CONFIDENCE: float = 0.5

# Minimum confidence for landmark tracking to be accepted.
FACE_PRESENCE_CONFIDENCE: float = 0.5

# Maximum number of faces to detect per frame.
# FocusLens tracks the primary user only, so 1 is correct.
MAX_FACES: int = 1

# ---------------------------------------------------------------------------
# Development / debug settings
# ---------------------------------------------------------------------------

# Show a live preview window during development.
# Set to False to run headless (no window), e.g. when integrated
# with Tauri in a later phase.
SHOW_DEV_PREVIEW: bool = True

# Title bar text for the development preview window.
DEV_PREVIEW_WINDOW_TITLE: str = "FocusLens — CV Dev Preview (press Q to quit)"

# Overlay basic diagnostic info (FPS, frame counter) on the preview.
SHOW_OVERLAY_INFO: bool = True

# Draw detected facial landmarks on the dev preview frame.
# This is a development-only debug feature — easy to disable here.
# Has no effect when SHOW_DEV_PREVIEW is False.
SHOW_LANDMARK_OVERLAY: bool = True

# Overlay text colour: BGR tuple (OpenCV convention).
OVERLAY_TEXT_COLOR: tuple[int, int, int] = (0, 255, 120)  # mint green
OVERLAY_TEXT_SCALE: float = 0.55
OVERLAY_TEXT_THICKNESS: int = 1

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

# Log level for the CV layer.
# Options: "DEBUG", "INFO", "WARNING", "ERROR"
LOG_LEVEL: str = "INFO"

