"""
FocusLens — CV Entry Point
===========================
Day 04: Python + OpenCV Computer Vision Foundation

Run this file to start the local webcam-processing pipeline:

    cd FocusLens/cv
    python main.py

What it does
------------
1. Imports the CVPipeline from app/pipeline.py.
2. Starts the capture loop.
3. Opens a development preview window (close with Q or the window X button).
4. Processes frames locally — nothing is uploaded or recorded.
5. Releases all resources cleanly when the session ends.

Privacy
-------
FocusLens processes ALL webcam data locally on your machine.
No frames, images, or video are sent to any external service.

Configuration
-------------
Adjust camera index, resolution, FPS, and other settings in:
    cv/config/settings.py

Extending the pipeline
----------------------
Future CV stages (MediaPipe, detection algorithms) are added to:
    cv/services/frame_processor.py   ← add new detectors here
    cv/app/pipeline.py               ← orchestration (rarely needs changing)
"""

import sys
import os

# ---------------------------------------------------------------------------
# Make the cv/ directory the Python path root so sibling packages
# (config, services, utils, app) can be imported without the "cv." prefix.
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.pipeline import CVPipeline


def main() -> None:
    """Start the FocusLens CV pipeline."""
    pipeline = CVPipeline()
    pipeline.run()


if __name__ == "__main__":
    main()
