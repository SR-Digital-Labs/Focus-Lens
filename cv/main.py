"""
FocusLens — CV Entry Point
===========================
Day 05: MediaPipe Face and Pose Landmarkers

Run this file to start the local webcam-processing pipeline:

    cd FocusLens/cv
    python main.py

Before running for the first time, download both MediaPipe models:

    python models/download_model.py
    python models/download_pose_model.py

What it does
------------
1. Imports the CVPipeline from app/pipeline.py.
2. Starts the capture loop.
3. Opens a development preview window (close with Q or the window X button).
4. Passes each frame to MediaPipe Face and Pose Landmarkers locally.
5. Displays face and pose detection status in the preview window.
6. Releases all resources cleanly when the session ends.

Privacy
-------
FocusLens processes ALL webcam data locally on your machine.
No frames, images, or video are sent to any external service.
The MediaPipe model runs entirely on-device.

Configuration
-------------
Adjust camera index, resolution, FPS, and other settings in:
    cv/config/settings.py

Toggle landmark visualisation in the dev preview:
    SHOW_LANDMARK_OVERLAY = True / False   (in cv/config/settings.py)

Extending the pipeline
----------------------
Future CV stages are added to:
    cv/services/face_landmarker.py  <- Face Landmarker service
    cv/services/pose_landmarker.py  <- Pose Landmarker service
    cv/services/frame_processor.py  <- detector integration
    cv/app/pipeline.py              <- orchestration (rarely needs changing)
"""

import sys
import os
import argparse

# ---------------------------------------------------------------------------
# Make the cv/ directory the Python path root so sibling packages
# (config, services, utils, app) can be imported without the "cv." prefix.
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.pipeline import CVPipeline


def main() -> None:
    """
    Start the FocusLens CV pipeline.

    CLI flags
    ---------
    --headless
        Run without an OpenCV preview window and emit detection signals as
        newline-delimited JSON to stdout.  Used by the Tauri desktop app to
        receive activity signals from the Python CV process.
    """
    parser = argparse.ArgumentParser(
        description="FocusLens CV pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        default=False,
        help=(
            "Run without the OpenCV preview window. "
            "Emits ActivitySignal JSON lines to stdout for Tauri integration."
        ),
    )
    args = parser.parse_args()

    # headless=True forces headless regardless of the SHOW_DEV_PREVIEW setting.
    # headless=False means the config file decides (default dev behaviour).
    pipeline = CVPipeline(headless=args.headless if args.headless else None)
    pipeline.run()


if __name__ == "__main__":
    main()
