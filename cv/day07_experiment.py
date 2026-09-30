"""
Day 07: Face Landmarker Output Experiment
-----------------------------------------

Observations during experiment:
- Face straight on: The X and Y coordinates center normally. Nose depth (Z) is typically negative (closest to the camera).
- Head left/right (Yaw): The X coordinates shift. One eye's Z coordinate becomes less negative, while the other becomes more negative as one side of the face moves closer to the camera.
- Head up/down (Pitch): The Y coordinates shift up or down. The chin's Z coordinate gets closer to the camera when looking up.
- Moving closer / farther: Z coordinates become more heavily negative as you get closer. The distance between points also increases in pixel space.
- Face not visible / Partial face: The Landmarker stops returning a result (`face_result.detected` = False). 
  We must handle this gracefully because "no result" doesn't strictly mean "away" — it could just be a temporary occlusion or bad angle.

This experiment proves the landmarks provide rich positional data that we can use for Head Orientation Analysis later.
"""

import sys
import os
import cv2

# Ensure we can import from the 'cv' directory root if run directly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.camera_service import CameraService, CameraError
from services.frame_processor import FrameProcessor

def main():
    print("=====================================================")
    print(" Day 07: Face Landmarker Output Experiment           ")
    print("=====================================================")
    print("Instructions:")
    print(" - Look straight toward the camera.")
    print(" - Move your head left, right, up, down.")
    print(" - Move closer and farther.")
    print(" - Partially leave the camera view.")
    print(" - Press 'q' in the video window to quit.")
    print("=====================================================\n")

    # 1. Reuse existing CV foundation
    camera = CameraService()
    processor = FrameProcessor()

    try:
        camera.open()
    except CameraError as e:
        print(f"Error opening camera: {e}")
        return

    # Select a small number of useful landmarks for experimentation
    # 1: Nose tip, 33: Left eye inner corner, 263: Right eye inner corner, 199: Chin
    selected_indices = {
        1: ("Nose Tip", (0, 255, 0)),
        33: ("Left Eye (Inner)", (255, 0, 0)),
        263: ("Right Eye (Inner)", (0, 0, 255)),
        199: ("Chin", (0, 255, 255))
    }

    while True:
        try:
            # 2. Process Face Landmarks locally
            camera_frame = camera.read_frame()
            result = processor.process(camera_frame)
            
            image = result.processed_frame.copy()
            face_result = result.face_detection

            # 7. Prepare Understandable Output structure
            output_data = {
                "detected": False,
                "landmark_count": 0,
                "selected_landmark_coords": {},
                "detection_availability": face_result.available if face_result else False
            }

            # 6. Experiment With Detection States (Face visible)
            if face_result and face_result.detected:
                landmarks = face_result.landmarks
                output_data["detected"] = True
                output_data["landmark_count"] = len(landmarks)

                h, w = image.shape[:2]

                # 3. Experiment With Landmark Coordinates
                for idx, (label, color) in selected_indices.items():
                    if idx < len(landmarks):
                        lm = landmarks[idx]
                        
                        # Store standard info
                        output_data["selected_landmark_coords"][label] = {
                            "x": round(lm.x, 3),
                            "y": round(lm.y, 3),
                            "z": round(lm.z, 3)
                        }

                        # 4. Visualize the Landmarks (Development only)
                        px_x = int(lm.x * w)
                        px_y = int(lm.y * h)
                        
                        cv2.circle(image, (px_x, px_y), 5, color, -1)
                        cv2.putText(image, label, (px_x + 10, px_y), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

            # Print current state efficiently (Face visible vs Not visible)
            if output_data["detected"]:
                nose_data = output_data["selected_landmark_coords"].get("Nose Tip", {})
                print(f"State: Face visible | Nose Z: {nose_data.get('z', 0.0)} | X: {nose_data.get('x', 0.0)}        ", end="\r")
            else:
                if output_data["detection_availability"]:
                    # 6. Detection States (Face not visible)
                    print("State: Face not visible | No landmark result                                ", end="\r")
                else:
                    print("State: Detection unavailable | Model loading failed                             ", end="\r")

            cv2.imshow("Day 07 Face Landmarker Experiment", image)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        except CameraError as e:
            print(f"Camera error: {e}")
            break

    print("\n\nExperiment ended. Cleaning up resources...")
    processor.close()
    camera.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
