"""Confidence and debounce thresholds for CV state tracking."""

# Presence changes only after consecutive reliable observations; prolonged
# uncertainty ages the stable state to UNKNOWN rather than treating it as AWAY.
PRESENCE_CONSECUTIVE_DETECTION_THRESHOLD: int = 3
PRESENCE_CONSECUTIVE_MISSING_THRESHOLD: int = 5
PRESENCE_CONSECUTIVE_UNKNOWN_THRESHOLD: int = 3

SCREEN_FACING_MIN_CONFIDENCE: float = 0.15
SCREEN_FACING_CONSECUTIVE_STATE_THRESHOLD: int = 3
SCREEN_FACING_CONSECUTIVE_UNKNOWN_THRESHOLD: int = 3

# Day 13 — Posture landmark extraction
# Minimum MediaPipe visibility score (0.0–1.0) for a pose landmark to be
# considered reliable enough for posture analysis.  Landmarks below this
# threshold are treated as missing and the posture state falls back to UNKNOWN.
# Lower = accept more uncertain landmarks; higher = stricter quality gate.
POSTURE_MIN_LANDMARK_VISIBILITY: float = 0.5

# Day 14 — Posture classification (ear-to-shoulder drop ratio)
#
# The classifier computes:
#   ratio = (shoulder_midpoint_y - ear_y) / shoulder_span
#
# In normalised MediaPipe coordinates Y increases downward, so a larger
# positive ratio means the ear is well above the shoulders (upright posture).
# Dividing by the shoulder span makes the ratio scale-invariant with respect
# to the person's distance from the camera.
#
# POSTURE_EAR_SHOULDER_GOOD_THRESHOLD
#   Ratio >= this value → GOOD_POSTURE.
#   Typical range for an upright seated person in a standard webcam setup:
#   0.5 – 0.9.  Start at 0.55 and adjust based on user feedback.
POSTURE_EAR_SHOULDER_GOOD_THRESHOLD: float = 0.55

# POSTURE_EAR_SHOULDER_SLOUCH_THRESHOLD
#   Ratio < this value → SLOUCHED.
#   Must be strictly less than POSTURE_EAR_SHOULDER_GOOD_THRESHOLD to
#   preserve a dead zone between the two thresholds that returns UNKNOWN
#   (prevents boundary flickering).
POSTURE_EAR_SHOULDER_SLOUCH_THRESHOLD: float = 0.35

# POSTURE_MAX_SHOULDER_TILT_RATIO
#   Maximum tolerated shoulder height asymmetry as a fraction of the shoulder
#   span before the frame is considered too ambiguous to classify.
#   A value of 0.25 means the higher shoulder can be at most 25 % of the
#   shoulder-span distance above the lower one before we give up.
POSTURE_MAX_SHOULDER_TILT_RATIO: float = 0.25

# Day 15 — Posture state stability and debouncing
# Consecutive frames of a candidate posture state (GOOD_POSTURE or SLOUCHED)
# required before updating the stable application posture state.
POSTURE_CONSECUTIVE_STATE_THRESHOLD: int = 3

# Consecutive frames of missing landmarks, detection failure, or ambiguous geometry
# required before falling back to UNKNOWN. Temporary glitches (< threshold)
# do not flip a stable posture state to UNKNOWN.
POSTURE_CONSECUTIVE_UNKNOWN_THRESHOLD: int = 3

# A posture reminder is emitted once per continuous, reliable slouched interval.
# The user-preference store may override these defaults when integrated.
POSTURE_REMINDERS_ENABLED: bool = True
POSTURE_REMINDER_THRESHOLD_SECONDS: float = 60.0
