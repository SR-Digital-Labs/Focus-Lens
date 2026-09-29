"""
FocusLens — MediaPipe Model Downloader
========================================
Downloads the MediaPipe Face Landmarker model bundle (.task file)
from the official Google/MediaPipe releases.

Run once before starting the CV pipeline:

    cd FocusLens/cv
    python models/download_model.py

The model is saved to:
    cv/models/face_landmarker.task

Privacy note
------------
This script downloads a pre-trained model ONLY.
No webcam data, images, or personal information is transmitted.
All subsequent face landmark inference runs entirely on your device.

Model details
-------------
Model:   face_landmarker.task (MediaPipe Face Landmarker)
Source:  https://storage.googleapis.com/mediapipe-models/
License: Apache 2.0
"""

import os
import sys
import urllib.request


# ---------------------------------------------------------------------------
# Model URL and local destination
# ---------------------------------------------------------------------------

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

# Destination: same directory as this script (cv/models/)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "face_landmarker.task")


# ---------------------------------------------------------------------------
# Download helper
# ---------------------------------------------------------------------------

def _progress_hook(block_num: int, block_size: int, total_size: int) -> None:
    """Print a simple progress indicator to stdout."""
    if total_size <= 0:
        print(f"\r  Downloaded {block_num * block_size:,} bytes...", end="", flush=True)
        return
    downloaded = min(block_num * block_size, total_size)
    percent = downloaded / total_size * 100
    bar_len = 40
    filled = int(bar_len * downloaded / total_size)
    bar = "#" * filled + "-" * (bar_len - filled)
    print(f"\r  [{bar}] {percent:5.1f}%  ({downloaded:,}/{total_size:,} bytes)",
          end="", flush=True)


def download_model() -> None:
    """Download the Face Landmarker model to cv/models/face_landmarker.task."""

    if os.path.exists(MODEL_PATH):
        size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)
        print(f"[OK] Model already exists: {MODEL_PATH} ({size_mb:.1f} MB)")
        print("     Delete the file and re-run this script to re-download.")
        return

    print("FocusLens — Downloading MediaPipe Face Landmarker model")
    print(f"  URL:  {MODEL_URL}")
    print(f"  Dest: {MODEL_PATH}")
    print()

    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH, reporthook=_progress_hook)
        print()  # newline after progress bar

        size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)
        print(f"\n[OK] Downloaded successfully ({size_mb:.1f} MB).")
        print(f"     Saved to: {MODEL_PATH}")
        print()
        print("You can now start the CV pipeline:")
        print("    cd FocusLens/cv")
        print("    python main.py")

    except Exception as exc:  # pylint: disable=broad-except
        # Clean up a partial download so the next run starts fresh.
        if os.path.exists(MODEL_PATH):
            os.remove(MODEL_PATH)
        print(f"\n[ERROR] Download failed: {exc}")
        print()
        print("Possible causes:")
        print("  * No internet connection.")
        print("  * Firewall blocking the request.")
        print()
        print("Manual download:")
        print(f"  1. Open in a browser: {MODEL_URL}")
        print(f"  2. Save the file as:  {MODEL_PATH}")
        sys.exit(1)


if __name__ == "__main__":
    download_model()
