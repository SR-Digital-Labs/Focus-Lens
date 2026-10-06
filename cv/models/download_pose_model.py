"""Download the MediaPipe Pose Landmarker Lite model bundle."""

from pathlib import Path
from urllib.request import urlretrieve


MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
MODEL_PATH = Path(__file__).with_name("pose_landmarker_lite.task")


def download_model() -> None:
    """Download the model once; inference itself runs fully offline."""
    if MODEL_PATH.exists():
        print(f"Pose Landmarker model already exists: {MODEL_PATH}")
        return

    print(f"Downloading Pose Landmarker model from {MODEL_URL}")
    urlretrieve(MODEL_URL, MODEL_PATH)
    print(f"Saved Pose Landmarker model to {MODEL_PATH}")


if __name__ == "__main__":
    download_model()