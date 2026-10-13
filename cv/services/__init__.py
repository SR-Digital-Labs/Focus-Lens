# FocusLens — cv/services package
from .camera_service import CameraService, CameraFrame, CameraError
from .frame_processor import FrameProcessor, FrameResult, PersonState, ScreenFacingState, PostureState
from .face_landmarker import (
    FaceLandmarkerService,
    FaceDetectionResult,
    FaceDetectionState,
    FaceLandmark,
)
from .pose_landmarker import (
    PoseLandmarkerService,
    PoseDetectionResult,
    PoseDetectionState,
    PoseLandmark,
)
from .posture_landmark_extractor import (
    PostureLandmarkExtractor,
    PostureLandmarks,
)
from .posture_classifier import PostureClassifier
from .posture_reliability import PostureReliabilityTracker
from .activity_signal_aggregator import ActivitySignalAggregator

__all__ = [
    # Camera
    "CameraService",
    "CameraFrame",
    "CameraError",
    # Frame processing
    "FrameProcessor",
    "FrameResult",
    "PersonState",
    "ScreenFacingState",
    "PostureState",
    # Face Landmarker (Day 05+)
    "FaceLandmarkerService",
    "FaceDetectionResult",
    "FaceDetectionState",
    "FaceLandmark",
    # Pose Landmarker (Day 05+)
    "PoseLandmarkerService",
    "PoseDetectionResult",
    "PoseDetectionState",
    "PoseLandmark",
    # Posture Landmark Extractor (Day 13)
    "PostureLandmarkExtractor",
    "PostureLandmarks",
    # Posture Classifier (Day 14)
    "PostureClassifier",
    # Posture Reliability (Day 15)
    "PostureReliabilityTracker",
    # Activity Signal Aggregator (Day 12 & Day 15)
    "ActivitySignalAggregator",
]
