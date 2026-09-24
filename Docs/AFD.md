# FocusLens — App Flow Document

**Version:** 1.0
**Project:** FocusLens
**Application Type:** Desktop Application
**Primary Domain:** Computer Vision + Productivity
**Development Approach:** Privacy-First / Local-First

---

# 1. Document Purpose

This document defines the user flow and application navigation structure of FocusLens.

It describes:

* How users enter the application
* How users start a focus session
* How camera permission is handled
* How computer vision operates during a session
* How activity signals are displayed
* How sessions are completed
* How session metrics are stored
* How users review session history
* How users view analytics
* How privacy and application settings are accessed

The flow follows the project's MVP requirements and expected final product flow.

---

# 2. Overall Application Flow

The primary FocusLens flow is:

```text
Open FocusLens
      ↓
Dashboard
      ↓
Start Focus Session
      ↓
Select Session Duration
      ↓
Camera Permission
      ↓
Camera Preview
      ↓
Start Session
      ↓
Local Computer Vision Processing
      ↓
Activity Monitoring
      ↓
Focus Session Running
      ↓
End Session
      ↓
Process Session Metrics
      ↓
Save Metrics Locally
      ↓
Session Summary
      ↓
Session History
      ↓
Analytics
```

This reflects the proposal's expected final product workflow.

---

# 3. Application Navigation

The main application should provide access to the core sections:

```text
┌─────────────────────────┐
│       FocusLens         │
├─────────────────────────┤
│                         │
│  Dashboard              │
│  Focus Session          │
│  Session History        │
│  Analytics              │
│  Settings               │
│                         │
└─────────────────────────┘
```

The exact navigation style will be finalized during the UI/UX design stage.

---

# 4. App Entry Flow

## 4.1 Open Application

When the user launches FocusLens:

```text
Launch Application
       ↓
Initialize Application
       ↓
Load Local Settings
       ↓
Load Session Data
       ↓
Open Dashboard
```

The application should not automatically activate the webcam.

---

# 5. Dashboard Flow

The Dashboard is the main starting point.

Possible information:

* Today's focus time
* Number of sessions
* Recent sessions
* Current session status
* Quick start button
* Analytics shortcut
* Privacy/camera status

Example:

```text
Dashboard
│
├── Today's Focus Time
├── Sessions Today
├── Recent Session
├── Start Focus Session
├── View History
└── View Analytics
```

The dashboard should provide a simple overview rather than overwhelming the user with detailed analytics.

---

# 6. Start Focus Session Flow

When the user selects:

**Start Focus Session**

the application moves to session configuration.

```text
Dashboard
    ↓
Start Focus Session
    ↓
Session Setup
```

---

# 7. Session Setup

The user should be able to select a session duration.

Available options:

```text
25 Minutes
45 Minutes
60 Minutes
Custom
```

These durations are based on the proposal's Focus Sessions feature.

Possible flow:

```text
Select Duration
      ↓
Choose Camera Mode
      ↓
Continue
```

---

# 8. Camera Mode

The user should be able to decide whether webcam-based monitoring is enabled.

Possible states:

```text
Camera Enabled
Camera Disabled
```

The application must clearly explain that the webcam is used for local computer-vision processing.

The proposal states that users can enable or disable the webcam for a focus session and that the application should clearly communicate when the camera is active.

---

# 9. Camera Permission Flow

If the camera is enabled:

```text
Camera Enabled
      ↓
Check Camera Permission
      ↓
Permission Available?
   /           \
 YES            NO
 ↓               ↓
Camera Preview   Request Permission
                   ↓
             User Decision
              /        \
           Allow       Deny
             ↓           ↓
       Camera Preview  Camera Disabled
```

---

# 10. Camera Permission Granted

When permission is granted:

```text
Permission Granted
       ↓
Initialize Webcam
       ↓
Display Camera Preview
       ↓
Initialize CV Processing
       ↓
Ready to Start
```

The camera should clearly show an active state.

---

# 11. Camera Permission Denied

If permission is denied:

```text
Permission Denied
       ↓
Explain Camera Requirement
       ↓
Offer Options
```

Possible options:

```text
Try Again
Continue Without Camera
Cancel Session
```

The exact behavior will be finalized during implementation.

---

# 12. Camera Unavailable Flow

If the camera cannot be accessed:

```text
Camera Initialization
       ↓
Camera Available?
   /          \
 YES           NO
 ↓              ↓
Continue       Show Camera Error
                  ↓
             Retry / Continue
             Without Camera
```

The application should avoid crashing if the webcam is unavailable.

---

# 13. Session Ready State

Once the session is configured:

```text
┌─────────────────────────────┐
│       Session Ready         │
│                             │
│       45:00                 │
│                             │
│   Camera: Active            │
│   Detection: Ready          │
│                             │
│       [ Start ]             │
└─────────────────────────────┘
```

The user must explicitly start the session.

---

# 14. Focus Session Flow

After the user presses **Start**:

```text
Start Session
      ↓
Session Timer Starts
      ↓
Camera Processing Starts
      ↓
Activity Monitoring Starts
      ↓
Session Running
```

---

# 15. Active Session Screen

During an active session, the application should display important information without creating unnecessary distractions.

Possible information:

```text
Session Timer
Camera Status
Person Status
Screen-Facing Status
Posture Status
Focus Indicator
Pause / End Controls
```

Example:

```text
┌──────────────────────────────┐
│       Focus Session          │
│                              │
│          37:24               │
│                              │
│  ● Camera Active             │
│  ● Person Present            │
│  ● Screen Facing             │
│  ● Good Posture              │
│                              │
│       Focus Indicator        │
│            86%               │
│                              │
│     [ Pause ]  [ End ]       │
└──────────────────────────────┘
```

The exact visual layout belongs to the UI/UX Design Brief.

---

# 16. Computer Vision Flow

During an active session:

```text
Webcam
   ↓
Capture Frame
   ↓
Local Processing
   ↓
Person Detection
   ↓
Face / Landmark Detection
   ↓
Screen-Facing Estimation
   ↓
Pose Detection
   ↓
Posture Analysis
   ↓
Activity State
   ↓
Session Metrics
```

The proposal specifies this general local-processing approach.

---

# 17. Person Detection Flow

```text
Camera Frame
      ↓
Person Detection
      ↓
Person Found?
   /        \
 YES         NO
 ↓            ↓
Present      Away Candidate
```

A temporary detection failure should not immediately be treated as the user leaving.

A configurable threshold can be used before recording an away period.

---

# 18. Away Detection Flow

Example:

```text
Person Present
      ↓
Person No Longer Detected
      ↓
Away Timer Starts
      ↓
Threshold Reached?
   /          \
 NO            YES
 ↓              ↓
Continue       Record Away
Monitoring     Period
                   ↓
             User Detected
                   ↓
             Record Return
```

The proposal describes away periods as a configurable detection feature.

---

# 19. Screen-Facing Flow

During the session:

```text
Face Detected
      ↓
Analyze Facial Landmarks
      ↓
Estimate Head Orientation
      ↓
Determine State
```

Possible states:

```text
Screen Facing
Looking Away
Unknown
```

The system should communicate that this is an **approximate visual signal**, not a measurement of the user's actual attention.

---

# 20. Posture Flow

```text
Pose Detected
      ↓
Analyze Body Landmarks
      ↓
Determine Posture
```

Possible states:

```text
Good Posture
Slouched Posture
Unknown
```

If poor posture continues for the configured threshold:

```text
Slouched Posture
      ↓
Threshold Reached
      ↓
Optional Reminder
```

The proposal allows a configurable posture reminder.

---

# 21. Focus Indicator Flow

FocusLens can combine session signals:

```text
Person Presence
       +
Screen-Facing
       +
Activity
       +
Away Periods
       ↓
Focus Indicator
```

The result should be presented as an application-generated indicator.

Example:

```text
Focus Indicator: 84%
```

It must not be presented as proof of actual productivity.

---

# 22. Pause Session Flow

If pause functionality is implemented:

```text
Active Session
      ↓
Pause
      ↓
Session Paused
      ↓
Resume
      ↓
Session Running
```

The exact pause behavior and its effect on metrics will be finalized during implementation.

---

# 23. End Session Flow

When the user selects **End Session**:

```text
Active Session
      ↓
End Session
      ↓
Confirm?
   /       \
 NO         YES
 ↓           ↓
Continue    Stop Monitoring
               ↓
          Stop Timer
               ↓
          Calculate Metrics
               ↓
          Save Session
```

---

# 24. Automatic Session Completion

If the timer reaches zero:

```text
Timer
  ↓
00:00
  ↓
Stop Session
  ↓
Stop CV Processing
  ↓
Calculate Metrics
  ↓
Save Session
  ↓
Session Summary
```

The session should not continue processing after completion unless the user explicitly starts another session.

---

# 25. Session Metric Calculation

At the end of the session, the application processes collected activity information.

Possible metrics include:

```text
Session Duration
Person Present Duration
Away Duration
Screen-Facing Duration
Posture Events
Focus Indicator
```

These correspond to the metrics described in the proposal.

---

# 26. Local Storage Flow

After the session ends:

```text
Session Completed
       ↓
Generate Session Metrics
       ↓
Save Locally
       ↓
SQLite / Local Storage
       ↓
Session Available in History
```

The application should store relevant metrics rather than raw webcam footage.

---

# 27. Session Summary Flow

After saving:

```text
Session Saved
      ↓
Session Summary
```

Possible summary:

```text
Session Duration       60 min
Person Present         54 min
Screen Facing          48 min
Away Time               6 min
Posture Events         12
Focus Indicator        84%
```

The summary provides a quick understanding of the completed session.

---

# 28. Session History Flow

The user can navigate to:

**Session History**

```text
Session History
│
├── Today's Sessions
├── Previous Sessions
└── Session Details
```

Example:

```text
Today's Sessions

09:00 — 45 min
11:30 — 60 min
14:00 — 30 min
19:00 — 90 min
```

The proposal specifically describes previous sessions in this format.

---

# 29. Session Detail Flow

When a user selects a session:

```text
Session History
      ↓
Select Session
      ↓
Session Details
```

Possible information:

* Date
* Start time
* Duration
* Person-present duration
* Away duration
* Screen-facing duration
* Posture events
* Focus Indicator

---

# 30. Analytics Flow

From the navigation:

```text
Analytics
    ↓
Load Local Session Data
    ↓
Aggregate Metrics
    ↓
Generate Charts
    ↓
Display Trends
```

The analytics section may include:

```text
Total Focus Time
Number of Sessions
Average Session Length
Away Time
Screen-Facing Duration
Posture Events
Focus Indicators
Daily Trends
Weekly Trends
```

These analytics requirements are defined in the proposal.

---

# 31. Analytics Navigation

Possible structure:

```text
Analytics
│
├── Overview
│
├── Daily
│
├── Weekly
│
└── Trends
```

The exact visualization structure will be defined in the UI/UX document.

---

# 32. Settings Flow

The user can open:

**Settings**

Possible categories:

```text
Settings
│
├── Session Settings
├── Break Reminders
├── Posture Reminder
├── Notifications
├── Camera / Privacy
└── Data Management
```

---

# 33. Privacy Settings Flow

The privacy section should provide control over:

```text
Camera Access
Session Tracking
Notifications
Data Storage
Delete Session History
```

These controls are specifically identified in the proposal.

---

# 34. Delete Session History Flow

When the user chooses to delete history:

```text
Settings
    ↓
Data Management
    ↓
Delete Session History
    ↓
Confirmation
    ↓
User Confirms
    ↓
Delete Local Session Data
    ↓
Refresh History
    ↓
Refresh Analytics
```

A confirmation step should be used to prevent accidental deletion.

---

# 35. Camera Disable Flow

The user should be able to disable camera processing.

```text
Settings
    ↓
Camera / Privacy
    ↓
Disable Camera
    ↓
Camera Processing Disabled
```

When disabled, the application should not attempt to access the webcam.

---

# 36. Break Reminder Flow

During an extended session:

```text
Session Running
      ↓
Configured Time Reached
      ↓
Break Reminder
```

Example:

```text
You've been working for 50 minutes.
Consider taking a short break.
```

The user should be able to configure or disable reminders.

---

# 37. Notification Flow

Possible notification states:

```text
Session Started
Break Reminder
Posture Reminder
Session Completed
```

Notifications should be controlled through settings.

---

# 38. Error / Recovery Flow

## Camera Error

```text
Camera Error
    ↓
Show Explanation
    ↓
Retry
    ↓
Continue Without Camera
    ↓
Cancel
```

## CV Error

```text
CV Processing Error
    ↓
Show Status
    ↓
Attempt Recovery
    ↓
Continue / End Session
```

## Storage Error

```text
Storage Error
    ↓
Notify User
    ↓
Attempt Save Again
    ↓
Show Result
```

The application should fail gracefully instead of crashing.

---

# 39. Unknown Detection Flow

Because computer vision can produce uncertain results:

```text
Detection
    ↓
Confidence / Valid Result?
   /          \
 YES           NO
 ↓              ↓
Normal State   UNKNOWN
```

Example:

```text
Person: Unknown
Screen Facing: Unknown
Posture: Unknown
```

This prevents the application from presenting unreliable detection as fact.

The proposal explicitly recognizes false detection and environmental factors as limitations.

---

# 40. Complete User Journey

The complete MVP user journey is:

```text
                    ┌───────────────┐
                    │ Open FocusLens│
                    └───────┬───────┘
                            ↓
                    ┌───────────────┐
                    │   Dashboard   │
                    └───────┬───────┘
                            ↓
                 ┌──────────────────────┐
                 │ Start Focus Session  │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Select Duration      │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Camera Permission    │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Webcam Preview       │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Start Session        │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Local CV Processing  │
                 └──────────┬───────────┘
                            ↓
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
        Person          Screen          Posture
        Presence        Facing          Detection
             │              │              │
             └──────────────┼──────────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Activity Metrics     │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Focus Session        │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ End / Complete       │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Calculate Metrics     │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Save Locally         │
                 └──────────┬───────────┘
                            ↓
                 ┌──────────────────────┐
                 │ Session Summary       │
                 └──────────┬───────────┘
                            ↓
             ┌──────────────┴──────────────┐
             ↓                             ↓
      Session History                 Analytics
```

---

# 41. Navigation Flow

The overall navigation can be represented as:

```text
                    Dashboard
                   /    |     \
                  /     |      \
                 ↓      ↓       ↓
            Sessions  Analytics Settings
               ↓                  ↓
        Session Details     Privacy / Data
                                  ↓
                           Delete History
```

The Focus Session is launched primarily from the Dashboard.

---

# 42. MVP User Flow Summary

The minimum successful user flow is:

```text
Open App
   ↓
Dashboard
   ↓
Start Session
   ↓
Choose Duration
   ↓
Grant Camera Permission
   ↓
Start Session
   ↓
CV Monitoring
   ↓
Activity Metrics
   ↓
End Session
   ↓
Save Metrics
   ↓
View Summary
   ↓
View History / Analytics
```

---

# 43. Future Flow Extensions

The following flows are intentionally outside the MVP:

```text
AI Session Summary
       ↓
AI Pattern Explanation
       ↓
Personalized Suggestions
```

Other possible future flows include:

```text
Multiple Profiles
Data Export
Optional Cloud Sync
Mobile Companion
Advanced Analytics
```

These are identified as future possibilities in the proposal and should not complicate the initial MVP flow.

---

# 44. App Flow Principles

The FocusLens user flow should follow these principles:

### Simple

Users should be able to start a session quickly.

### Transparent

Camera usage and privacy behavior should always be clear.

### Local-First

Sensitive camera processing should remain local.

### Non-Intrusive

The monitoring interface should not distract from the user's work.

### Understandable

Detection states and metrics should use simple language.

### Honest

The application should not claim to know whether a person is truly productive or mentally focused.

### Recoverable

Camera, detection, and storage failures should have clear recovery paths.

---

# 45. Final App Flow Definition

FocusLens begins at the Dashboard and guides the user through a simple focus-session workflow.

The user selects a session duration, chooses whether to use the webcam, grants permission when necessary, and starts the session. During the session, FocusLens locally processes visual information to generate basic activity signals such as person presence, screen-facing state, posture state, and away periods.

At the end of the session, the application calculates session metrics and stores them locally. The user can then view a session summary, browse previous sessions, and review aggregated analytics.

The application maintains a clear separation between **observable visual activity signals** and claims about actual productivity or mental concentration.

The overall philosophy is:

```text
Start
 ↓
Work
 ↓
Observe
 ↓
Measure
 ↓
Store Locally
 ↓
Review
 ↓
Improve
```

FocusLens should feel like a practical desktop productivity application rather than a computer-vision demonstration.
