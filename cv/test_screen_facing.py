"""
FocusLens - Screen Facing Estimator Tests
"""

import sys
import os

# Add cv directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from services.screen_facing_estimator import ScreenFacingEstimator
from services.face_landmarker import FaceDetectionResult, FaceDetectionState, FaceLandmark
from models.cv_results import ScreenFacingState

def create_mock_result(detected, state, landmarks_list, complete=True):
    landmarks = []
    if landmarks_list:
        # Create a mock 478-point landmark array
        for idx in range(478):
            if idx in landmarks_list:
                landmarks.append(landmarks_list[idx])
            else:
                landmarks.append(FaceLandmark(0, 0, 0)) # filler
    return FaceDetectionResult(
        detected=detected,
        available=True,
        state=state,
        landmarks=landmarks,
        detection_confidence=1.0 if detected and complete else 0.0,
        landmarks_complete=complete,
    )

def main():
    estimator = ScreenFacingEstimator(max_yaw_ratio=0.5, min_nose_vertical_ratio=0.2, max_nose_vertical_ratio=0.8)

    print("Testing Screen Facing Estimator...\n")

    # Test 1: Facing screen perfectly
    # Nose (1) centered horizontally and vertically
    # Eyes (33, 263) equidistant
    # Mouth (61, 291) equidistant
    landmarks_facing = {
        1: FaceLandmark(0.5, 0.5, 0),
        33: FaceLandmark(0.3, 0.3, 0),
        263: FaceLandmark(0.7, 0.3, 0),
        61: FaceLandmark(0.4, 0.7, 0),
        291: FaceLandmark(0.6, 0.7, 0),
    }
    res_facing = create_mock_result(True, FaceDetectionState.DETECTED, landmarks_facing)
    print(f"Test 1 - Facing directly at screen: {estimator.estimate(res_facing)}")

    # Test 2: Looking Away (Turning Left - Yaw)
    # Nose x (0.35) is closer to left eye (0.3) than right eye (0.7). Eye midpoint is 0.5.
    # Yaw ratio = abs(0.35 - 0.5) / 0.4 = 0.15 / 0.4 = 0.375. Wait, 0.375 < 0.5 so that is SCREEN_FACING.
    # Let's turn further: Nose x = 0.25. Yaw ratio = abs(0.25 - 0.5) / 0.4 = 0.625 > 0.5 -> LOOKING_AWAY
    landmarks_away_yaw = {
        1: FaceLandmark(0.25, 0.5, 0),
        33: FaceLandmark(0.3, 0.3, 0),
        263: FaceLandmark(0.7, 0.3, 0),
        61: FaceLandmark(0.4, 0.7, 0),
        291: FaceLandmark(0.6, 0.7, 0),
    }
    res_away_yaw = create_mock_result(True, FaceDetectionState.DETECTED, landmarks_away_yaw)
    print(f"Test 2 - Looking away (turning head left): {estimator.estimate(res_away_yaw)}")

    # Test 3: No detectable face
    res_no_face = create_mock_result(False, FaceDetectionState.NOT_DETECTED, None, False)
    print(f"Test 3 - No detectable face: {estimator.estimate(res_no_face)}")

    # Test 4: Unreliable/missing landmarks
    landmarks_incomplete = {
        1: FaceLandmark(0.5, 0.5, 0),
        # missing other essential landmarks, landmarks_complete = False
    }
    res_incomplete = create_mock_result(True, FaceDetectionState.DETECTED, landmarks_incomplete, False)
    print(f"Test 4 - Unreliable or insufficient landmark data: {estimator.estimate(res_incomplete)}")

if __name__ == '__main__':
    main()
