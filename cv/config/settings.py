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
# Keeping it at 1.0 for Day 04 — no heavy algorithms yet.
FRAME_SCALE: float = 1.0

# Colour space used internally (BGR is OpenCV's default).
# Future pipeline steps may convert to RGB for MediaPipe.
INTERNAL_COLOR_SPACE: str = "BGR"

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
