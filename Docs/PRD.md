📋 FocusLens — Project Requirement Document (PRD)

Version: 1.0
Project: FocusLens
Project Type: Desktop Application
Domain: Computer Vision + Productivity
Development Approach: Privacy-First / Local-First
Target Platform: Desktop
Primary Interface: React-based desktop UI
Development Duration: 35 Days
Team: Shavi & Ragavi

1. Project Overview

FocusLens is a privacy-focused desktop productivity application that uses computer vision to help users understand and improve their study and work sessions.

The application uses a computer's webcam to detect basic visual signals such as:

Person presence
Approximate screen-facing direction
Body/posture landmarks
Workspace presence
Activity state

The system processes webcam data locally and stores only relevant activity information and session statistics.

FocusLens is not intended to determine a user's mental state or objectively measure productivity. Instead, it provides visual activity indicators that help users understand their work habits and manage focused work sessions.

2. Problem Statement

Students, developers, and remote workers can spend long periods working at a computer without being aware of their working patterns.

Common problems include:

Working for long periods without taking breaks
Leaving the computer while a focus timer is running
Frequently looking away from the screen
Maintaining poor sitting posture for extended periods
Difficulty understanding daily study/work patterns
Using multiple disconnected productivity tools

Traditional productivity applications mainly depend on timers and manually entered information.

FocusLens aims to combine computer vision, productivity tracking, session management, and analytics into one desktop application.

3. Proposed Solution

FocusLens will provide a desktop environment where users can start a focused work or study session and optionally enable their webcam.

During an active session, the application locally analyzes camera frames and extracts limited information such as:

Person presence
Screen-facing direction
Body/posture landmarks
Workspace presence
Activity state

These signals are converted into session metrics that users can review after their sessions.

Example:

Metric	Example
Session Duration	60 min
Person Present	54 min
Screen Facing	48 min
Away Time	6 min
Posture Events	12
Focus Indicator	84%

The system stores the resulting metrics rather than raw webcam footage.

4. Project Vision

The vision of FocusLens is to create a privacy-first desktop productivity assistant that uses computer vision responsibly to provide users with useful information about their work and study sessions.

The application should feel like a real desktop productivity product, rather than simply a computer-vision demonstration.

5. Main Objectives

FocusLens aims to:

Build a functional desktop productivity application.
Introduce computer vision into a practical software application.
Process webcam data locally wherever technically possible.
Detect basic face/body-related visual signals.
Create a focus-session tracking system.
Store and visualize activity metrics.
Provide useful productivity insights.
Demonstrate responsible camera and personal-data handling.
Develop practical experience with software architecture beyond traditional web applications.
Create a portfolio project demonstrating computer vision and software engineering skills.
6. Target Users
6.1 Students

FocusLens can support:

Study sessions
Online learning
Assignment work
Programming practice
Exam preparation
6.2 Developers

Potential use cases include:

Coding sessions
Project development
Research
Documentation work
6.3 Remote Workers

Remote workers can use FocusLens to understand their personal work-session patterns.

FocusLens is intended primarily as a personal productivity tool, rather than an employee-monitoring system.

7. Core Features
7.1 Focus Sessions

Users can create focused sessions using predefined or custom durations.

Example durations:

25 minutes
45 minutes
60 minutes
Custom duration

The session records relevant activity metrics while running.

7.2 Webcam Integration

Users can:

Enable the webcam
Disable the webcam
See when the camera is active
Use the webcam for computer-vision processing

The camera should only be used for visual processing and should not silently record or upload footage.

7.3 Person Detection

The application determines whether a person is visible within the camera frame.

Possible states:

Present
Away

This helps identify periods when the user leaves their workspace.

7.4 Screen-Facing Detection

Using facial landmarks and head orientation, FocusLens estimates whether the user is approximately facing the screen.

Possible states:

Screen-facing
Looking away
Unknown

This is an approximate visual signal and must not be presented as proof of actual attention.

7.5 Posture Detection

The application uses body landmarks to identify basic posture patterns.

Possible states:

Good posture
Forward / Slouched posture
Unknown

The system can optionally provide a gentle reminder after a configurable period.

7.6 Away Detection

If a person is no longer detected for a configurable period, the system records an away period.

Example:

10:32 — User left
10:37 — User returned

Away Duration: 5 minutes

7.7 Focus Indicator

FocusLens combines available session signals into an application-generated Focus Indicator.

Possible signals include:

Person present
Screen-facing
Consistent activity
Break/away periods

The indicator must be presented as an application-generated metric, not an objective measurement of human productivity.

7.8 Session History

Users can view previous sessions.

Example:

Today's Sessions

09:00 — 45 min
11:30 — 60 min
14:00 — 30 min
19:00 — 90 min

Each session can contain summarized metrics.

7.9 Analytics Dashboard

The dashboard can display:

Total focus time
Number of sessions
Average session length
Away time
Screen-facing duration
Posture events
Focus indicators
Daily trends
Weekly trends

Charts will help users understand patterns over time.

7.10 Break Reminders

FocusLens can remind users to take breaks after extended sessions.

Example:

"You've been working for 50 minutes. Consider taking a short break."

Users should be able to configure or disable reminders.

8. Privacy Requirements

Privacy is a core requirement, not an optional feature.

Preferred pipeline
Webcam
   ↓
Local Computer Vision Processing
   ↓
Extract Activity Metrics
   ↓
Discard Camera Frame
   ↓
Store Metrics

FocusLens should avoid:

Webcam
   ↓
Upload Video
   ↓
Cloud Server

Raw webcam footage should not be stored unless a future feature explicitly requires it and the user enables that feature.

Users should control:
Camera access
Session tracking
Notifications
Data storage
Deletion of session history
9. MVP Scope

The first version of FocusLens will focus on a manageable Minimum Viable Product.

Required for MVP
Desktop application
Webcam permission
Webcam preview
Person detection
Basic screen-facing detection
Basic posture detection
Focus-session timer
Away detection
Session metrics
Local storage
Session history
Basic analytics
Privacy controls
10. Features Outside MVP

The following will not be part of the first version:

AI assistant
Cloud synchronization
Mobile application
User accounts
Social features
Cloud video processing
Advanced machine learning

These may be considered as future extensions after the MVP is stable.

11. Future Features

Possible future versions may include:

AI Insights
Session summaries
Productivity pattern explanations
Personalized suggestions
Personalization
Custom break intervals
Reminder sensitivity
Focus-session duration
Posture reminder threshold
Advanced Analytics
Weekly patterns
Monthly patterns
Session comparisons
Productivity trends
Other Extensions
Multiple profiles
Statistics export
Optional privacy-controlled cloud synchronization
Mobile companion application
12. Functional Requirements
FR-01 — Session Management

The system shall allow users to start, pause/end, and complete focus sessions.

FR-02 — Webcam Permission

The system shall request and manage webcam access.

FR-03 — Webcam Preview

The system shall provide a webcam preview when the camera is enabled.

FR-04 — Person Detection

The system shall detect whether a person is present.

FR-05 — Screen-Facing Detection

The system shall estimate whether the person is approximately facing the screen.

FR-06 — Posture Detection

The system shall identify basic posture states.

FR-07 — Away Detection

The system shall detect and record periods where the user is absent.

FR-08 — Activity Metrics

The system shall convert detection results into session metrics.

FR-09 — Focus Indicator

The system shall generate an application-defined Focus Indicator from available session signals.

FR-10 — Local Storage

The system shall store session information locally.

FR-11 — Session History

The system shall allow users to view previous sessions.

FR-12 — Analytics

The system shall display summarized activity metrics and trends.

FR-13 — Break Reminders

The system shall provide configurable break reminders.

FR-14 — Privacy Controls

The system shall provide controls for camera access, tracking, notifications, storage, and history deletion.

13. Non-Functional Requirements
Privacy

Camera frames should be processed locally wherever technically possible.

Performance

Real-time CV processing should not make the desktop interface feel unresponsive.

Reliability

The system should handle uncertain or failed detection states.

Usability

Users should clearly understand:

When the camera is active
What is being detected
What metrics mean
When a session is running
Maintainability

The application should use separated components for:

UI
Session management
Computer vision
Metrics
Storage
Analytics
Resource Efficiency

Continuous webcam processing should be designed with CPU/GPU resource usage in mind.

Compatibility

Desktop behavior should be considered across supported operating systems, with the initial target being the intended desktop environment.

14. Project Limitations

FocusLens will not determine:

Whether someone is genuinely concentrating
Whether someone is emotionally focused
Whether someone is actually productive
What someone is thinking
Whether someone understands the work they are doing

Computer vision can only provide observable visual signals.

Therefore, the application should use terminology such as:

Focus Indicator

rather than claiming:

"You were productive for 87% of the session."

This distinction is an important technical and ethical limitation of the system.

15. Project Constraints

FocusLens will face several technical constraints:

Computer Vision Accuracy

Detection can be affected by:

Lighting
Camera quality
Camera angle
Glasses
Movement
Background conditions
False Detection

The system may incorrectly detect:

Person presence
Posture
Screen-facing state
Real-Time Processing

The application needs to process webcam frames without making the interface slow.

Resource Usage

Continuous webcam processing can consume CPU/GPU resources.

Desktop Compatibility

Desktop applications may behave differently across operating systems.

16. Technology Requirements
Desktop
Tauri
React
Frontend
JavaScript / TypeScript
CSS / Tailwind CSS
Charting library
Computer Vision
Python
OpenCV
MediaPipe
Local Storage
SQLite
Tauri-compatible database solution / local application storage
AI

Optional and not required for MVP.

17. Team Structure

FocusLens is being developed by:

👩‍💻 Shavi

Participation across:

Project planning
UI/UX
React
Desktop development
Computer vision
Data processing
Database
Testing
Deployment
👩‍💻 Ragavi

Participation across the same major development areas.

The responsibilities will be rotated and shuffled throughout the 35-day development plan, rather than permanently assigning one person to frontend and another to backend.

This allows both team members to gain practical experience across the complete system.

18. Success Criteria

The MVP will be considered successful when a user can:

Open FocusLens
      ↓
Start a Focus Session
      ↓
Grant Camera Permission
      ↓
Enable Webcam
      ↓
Work Normally
      ↓
FocusLens Processes Visual Signals Locally
      ↓
Activity Metrics Are Generated
      ↓
Session Ends
      ↓
Metrics Are Stored Locally
      ↓
User Views Session Summary
      ↓
User Reviews Analytics

The final product should behave as a functional desktop productivity application rather than merely demonstrating individual computer-vision features.

19. Expected Learning Outcomes

By completing FocusLens, Shavi and Ragavi should gain practical experience in:

Computer vision
Real-time webcam processing
Desktop application development
React application architecture
Local databases
Data processing
Analytics
Software architecture
Privacy-conscious development
Computer-vision testing
Performance optimization
Application packaging
20. PRD Final Definition

FocusLens is a privacy-first desktop productivity assistant that uses local computer vision to transform webcam-derived visual signals into useful session metrics.

The MVP will focus on:

Webcam → Computer Vision → Activity Signals → Focus Session → Metrics → Local Storage → Analytics

while deliberately avoiding cloud video processing, user accounts, mobile applications, social features, and advanced AI until the core system is stable.

This keeps the project aligned with the proposal's stated goal: using FocusLens as a practical learning platform for desktop development, computer vision, local data processing, privacy engineering, and broader software engineering skills.