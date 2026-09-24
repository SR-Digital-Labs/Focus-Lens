# FocusLens — UI/UX Design Brief

**Version:** 1.0
**Project:** FocusLens
**Application Type:** Desktop Application
**Primary Domain:** Computer Vision + Productivity
**Design Approach:** Privacy-First / Local-First
**Primary Interface:** React-based Desktop UI

---

# 1. Document Purpose

This document defines the UI/UX direction for FocusLens.

It describes:

* Visual identity
* Application layout
* Navigation
* Dashboard
* Focus Session screen
* Camera permission interface
* Session Summary
* Session History
* Analytics Dashboard
* Settings
* Privacy controls
* Notifications
* Components
* States
* User feedback
* Accessibility
* Responsive desktop behavior

The goal is to make FocusLens feel like a **real desktop productivity product**, rather than simply a computer-vision demonstration. This matches the intended final product described in the proposal.

---

# 2. UX Vision

FocusLens should provide a calm, focused, transparent, and easy-to-understand experience.

The interface should communicate:

> **"Focus on your work. FocusLens quietly helps you understand your work patterns."**

The design should avoid making the user feel monitored or judged.

Instead of presenting computer-vision results as absolute judgments, the interface should present them as **activity indicators**.

For example:

```text
✓ Person Present
✓ Screen Facing
✓ Good Posture
```

rather than:

```text
✓ You are productive
```

The proposal explicitly states that FocusLens should not claim to objectively measure productivity or genuine concentration.

---

# 3. Design Goals

The UI should prioritize:

### 3.1 Clarity

Users should immediately understand:

* What is happening
* Whether a session is running
* Whether the camera is active
* What each metric means

### 3.2 Privacy Transparency

Camera activity should always be visible.

### 3.3 Low Distraction

During a focus session, the interface should remain minimal.

### 3.4 Easy Navigation

Users should be able to move between:

* Dashboard
* Focus Session
* History
* Analytics
* Settings

### 3.5 Visual Feedback

Important application states should be clearly communicated.

### 3.6 Trust

The design should make local-first processing and privacy controls easy to understand.

---

# 4. Visual Design Direction

The visual style should feel:

* Modern
* Minimal
* Calm
* Professional
* Technology-focused
* Privacy-conscious
* Productivity-oriented

The interface should avoid looking like:

* A generic admin dashboard
* A medical application
* A surveillance system
* A complex developer tool

---

# 5. Suggested Visual Theme

A dark-first desktop interface is recommended for FocusLens because it can create a calm, focused environment during long work sessions.

### Primary Theme

```text
Dark / Focus Mode
```

### Optional Theme

```text
Light Mode
```

Light mode can be considered if implementation time allows.

The exact color values are a design decision and should be finalized during Figma design.

---

# 6. Suggested Color System

The UI should use a small, consistent color system.

### Background

Dark neutral tones for the main application background.

### Surface

Slightly lighter neutral tones for:

* Cards
* Panels
* Navigation
* Dialogs

### Primary Accent

A single recognizable accent color for:

* Primary buttons
* Active navigation
* Focus session controls
* Important highlights

### Success

Used for:

* Person present
* Good posture
* Screen-facing
* Successful actions

### Warning

Used for:

* Looking away
* Slouched posture
* Break reminders
* Attention-required states

### Error

Used for:

* Camera errors
* Permission errors
* Storage errors

### Neutral

Used for:

* Unknown states
* Disabled states
* Secondary information

---

# 7. Typography

Typography should be clean and highly readable.

Suggested hierarchy:

```text
H1
Main page title

H2
Section title

H3
Card title

Body
Normal information

Caption
Supporting information
```

The final font family should be selected during the visual design stage.

The interface should avoid using too many font styles.

---

# 8. Application Layout

The primary desktop layout should use:

```text
┌─────────────────────────────────────────────────┐
│                  Top Bar                         │
├──────────────┬──────────────────────────────────┤
│              │                                  │
│              │                                  │
│  Sidebar     │          Main Content            │
│              │                                  │
│              │                                  │
│              │                                  │
├──────────────┴──────────────────────────────────┤
│                  Status Area                    │
└─────────────────────────────────────────────────┘
```

---

# 9. Sidebar Navigation

The sidebar should provide access to the major application areas.

Suggested navigation:

```text
FocusLens

⌂ Dashboard

◉ Focus Session

▣ Session History

▥ Analytics

⚙ Settings
```

The active page should have a clear visual state.

The navigation should remain consistent across the application.

---

# 10. Top Bar

The top bar may contain:

* Current page title
* Camera status
* Session status
* Notifications
* Application status

During an active session, camera status should be especially visible.

Example:

```text
Focus Session                         ● Camera Active
```

---

# 11. Dashboard

The Dashboard is the primary landing screen.

It should provide a quick overview of the user's activity.

Possible sections:

```text
Dashboard
│
├── Welcome / Overview
│
├── Today's Focus Time
│
├── Sessions Today
│
├── Average Session
│
├── Recent Sessions
│
└── Start Focus Session
```

The proposal identifies the dashboard as one of the primary UI areas.

---

# 12. Dashboard Hero Area

The top portion can contain:

```text
Good morning 👋

Ready for a focused session?

[ Start Focus Session ]
```

The design should remain simple rather than becoming a large decorative hero section.

---

# 13. Dashboard Metric Cards

Suggested cards:

### Today's Focus

```text
2h 45m
Today's focus time
```

### Sessions

```text
4
Sessions today
```

### Average Session

```text
41m
Average duration
```

### Away Time

```text
18m
Total away time
```

These metrics correspond to the types of information FocusLens is expected to track.

---

# 14. Recent Sessions

The Dashboard should show recent sessions.

Example:

```text
Recent Sessions

09:00     45 min     Focus Indicator 86%
11:30     60 min     Focus Indicator 81%
14:00     30 min     Focus Indicator 90%

                         View History →
```

Selecting a session should open its details.

---

# 15. Focus Session Screen

The Focus Session screen is the most important active-work interface.

It should prioritize:

1. Timer
2. Session status
3. Camera status
4. Activity indicators
5. Minimal controls

---

# 16. Focus Session Layout

Suggested structure:

```text
┌─────────────────────────────────────────────┐
│              Focus Session                  │
│                                             │
│                  42:18                      │
│                                             │
│            Focus Indicator                  │
│                  86%                        │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│   Person       Screen       Posture         │
│   Present      Facing       Good            │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│         [ Pause ]       [ End Session ]     │
│                                             │
└─────────────────────────────────────────────┘
```

The screen should avoid excessive charts or historical information while the user is working.

---

# 17. Timer Design

The timer should be the strongest visual element.

Example:

```text
42:18
```

The timer should be:

* Large
* Easy to read
* Centered or visually prominent
* Clearly associated with the active session

---

# 18. Activity Indicators

Activity indicators should use compact cards or status pills.

Example:

```text
● Person Present

● Screen Facing

● Good Posture
```

Possible states:

### Positive

```text
✓ Person Present
✓ Screen Facing
✓ Good Posture
```

### Warning

```text
! Looking Away
! Slouched Posture
```

### Unknown

```text
? Unknown
```

The system should not visually exaggerate normal changes.

---

# 19. Camera Status

Camera status should always be obvious during camera-enabled sessions.

Example:

```text
● Camera Active
```

or:

```text
Camera
ACTIVE
Local Processing
```

The interface should reassure users that webcam data is processed locally.

The proposal explicitly requires clear communication whenever the camera is active.

---

# 20. Webcam Preview

When enabled, the application may display a small camera preview.

Possible layout:

```text
┌──────────────────┐
│                  │
│   Camera View    │
│                  │
│   ● Processing   │
└──────────────────┘
```

The preview should not dominate the focus-session interface.

The purpose is to provide transparency and confirm that the camera is working.

---

# 21. Camera Permission Screen

Before camera processing begins, the user should see a dedicated permission interface.

Example:

```text
┌─────────────────────────────────┐
│        Camera Access            │
│                                 │
│  FocusLens uses your webcam     │
│  to detect basic visual         │
│  activity signals.              │
│                                 │
│  Processing happens locally.    │
│  Camera footage is not stored.  │
│                                 │
│       [ Allow Camera ]          │
│                                 │
│       Continue Without Camera   │
└─────────────────────────────────┘
```

The privacy explanation should be short and understandable.

The proposal's preferred processing pipeline is local processing followed by discarding the camera frame and storing metrics.

---

# 22. Session Setup Screen

Before starting a session:

```text
Start Focus Session

Choose duration

○ 25 min
○ 45 min
○ 60 min
○ Custom

Camera

● Enabled
○ Disabled

[ Continue ]
```

The session durations are based on the proposal.

---

# 23. Session Ready Screen

After setup:

```text
You're ready.

45 minute session

Camera: Active
Computer Vision: Ready

[ Start Session ]
```

This creates a clear transition between configuration and active monitoring.

---

# 24. Pause State

If pause functionality is implemented:

```text
┌──────────────────────────┐
│      SESSION PAUSED      │
│                          │
│         23:14            │
│                          │
│      [ Resume ]          │
│      [ End Session ]     │
└──────────────────────────┘
```

The paused state should look clearly different from the active state.

---

# 25. Break Reminder

When the configured reminder time is reached:

```text
┌──────────────────────────────┐
│        Break Reminder        │
│                              │
│ You've been working for      │
│ 50 minutes.                  │
│                              │
│ Consider taking a short      │
│ break.                       │
│                              │
│ [ Dismiss ]  [ End Session ] │
└──────────────────────────────┘
```

Users should be able to configure or disable these reminders.

---

# 26. Posture Reminder

If the user remains in a slouched posture beyond the configured threshold:

```text
Posture Reminder

Your posture has been
slouched for a while.

Consider adjusting your
sitting position.

[ Got it ]
```

The wording should remain gentle rather than judgmental.

---

# 27. Session Completion Screen

When the session ends:

```text
Session Complete 🎉

60 minute session

[ View Summary ]
```

A subtle completion animation can be used.

The animation should not be distracting.

---

# 28. Session Summary

The Session Summary should provide the most useful information from the completed session.

Suggested structure:

```text
Session Summary

60 min
Total Session

54 min
Person Present

48 min
Screen Facing

6 min
Away Time

12
Posture Events

84%
Focus Indicator
```

These metrics reflect the proposal's example session metrics.

---

# 29. Session Summary Visualization

A simple visual breakdown can be used:

```text
Session Duration
████████████████████ 60m

Present
██████████████████   54m

Screen Facing
████████████████     48m

Away
██                   6m
```

The visualization should help users understand the session without requiring detailed analysis.

---

# 30. Session Summary Actions

At the bottom:

```text
[ Done ]
[ View History ]
[ View Analytics ]
```

The primary action should return the user to the Dashboard or History.

---

# 31. Session History Screen

Session History should provide a clean list of previous sessions.

Example:

```text
Session History

Today

09:00    45 min    86%
11:30    60 min    81%
14:00    30 min    90%

Yesterday

09:15    50 min    84%
13:00    45 min    79%
```

---

# 32. Session Filters

If needed, users can filter sessions by:

* Today
* This week
* This month
* Custom date

Filtering should remain simple for the MVP.

---

# 33. Session Details

Selecting a session opens:

```text
Session Details

Date
24 September 2026

Start
09:00

Duration
60 min

Person Present
54 min

Screen Facing
48 min

Away
6 min

Posture Events
12

Focus Indicator
84%
```

---

# 34. Analytics Dashboard

The Analytics screen provides longer-term trends.

Possible sections:

```text
Analytics

Overview
│
├── Total Focus Time
├── Session Count
├── Average Session
├── Away Time
│
├── Daily Focus Chart
├── Weekly Focus Chart
├── Screen-Facing Trend
└── Posture Events
```

These categories are based on the proposal's analytics requirements.

---

# 35. Analytics Cards

Example:

```text
Total Focus Time
12h 35m

Sessions
18

Average Session
42m

Away Time
1h 12m
```

Cards should use consistent visual hierarchy.

---

# 36. Focus Trend Chart

Example:

```text
Focus Time

Mon   ███████
Tue   █████████
Wed   █████
Thu   ██████████
Fri   ████████
```

The final chart type should be selected based on readability.

---

# 37. Daily / Weekly Analytics

Users should be able to switch between:

```text
[ Daily ] [ Weekly ]
```

Daily view can show individual sessions.

Weekly view can show aggregated activity.

The proposal identifies daily and weekly trends as MVP analytics requirements.

---

# 38. Settings Screen

Settings should be organized into clear categories.

```text
Settings

Session
├── Default Session Duration
├── Break Reminders
└── Posture Reminders

Privacy
├── Camera Access
├── Session Tracking
├── Data Storage
└── Delete History

Notifications
└── Notification Preferences

Appearance
└── Theme
```

The exact settings list can be refined during implementation.

---

# 39. Privacy Settings

Privacy should have its own clearly visible section.

Example:

```text
Privacy

Camera Access
[ Enabled ]

Session Tracking
[ Enabled ]

Notifications
[ Enabled ]

Local Data Storage
[ Enabled ]

Delete Session History
[ Delete ]
```

The proposal specifically identifies these privacy controls.

---

# 40. Delete History Confirmation

When deleting data:

```text
Delete Session History?

This will permanently remove
your locally stored session data.

This action cannot be undone.

[ Cancel ]    [ Delete History ]
```

The destructive action should be visually distinct.

---

# 41. Notification Design

Notifications should be:

* Short
* Clear
* Non-intrusive
* Actionable when appropriate

Examples:

```text
✓ Session started
```

```text
☕ Consider taking a short break.
```

```text
✓ Session completed
```

```text
⚠ Camera disconnected
```

---

# 42. Application States

The UI should support the following major states:

### Idle

```text
No session running
```

### Preparing

```text
Preparing camera / session
```

### Active

```text
Session running
```

### Paused

```text
Session temporarily paused
```

### Completed

```text
Session finished
```

### Error

```text
Something went wrong
```

### Unknown Detection

```text
Computer vision cannot confidently determine a state
```

---

# 43. Empty States

The application should provide helpful empty states.

### No Sessions

```text
No sessions yet.

Start your first focus session
to begin building your history.

[ Start Session ]
```

### No Analytics

```text
Not enough data yet.

Complete a few sessions to
see your activity trends.
```

### Camera Disabled

```text
Camera monitoring is disabled.

You can still use FocusLens as
a focus timer.

[ Enable Camera ]
```

---

# 44. Error States

Errors should be understandable.

Instead of:

```text
MediaPipe subprocess exited with code 1
```

show:

```text
Computer Vision Unavailable

FocusLens couldn't start visual
monitoring.

[ Retry ]
```

Technical details can be logged separately for development/debugging.

---

# 45. Loading States

Loading indicators should be used when:

* Starting camera
* Initializing computer vision
* Loading history
* Loading analytics
* Saving session data

Example:

```text
Starting camera...

Initializing local computer vision...
```

---

# 46. Privacy Indicators

Privacy should be visible without overwhelming the user.

Possible indicator:

```text
🔒 Local Processing
```

or:

```text
● Camera Active
  Processing locally
```

This can appear in the session screen and camera-related interfaces.

---

# 47. UX for Uncertain Detection

The UI should never pretend that uncertain computer-vision output is accurate.

Example:

```text
Person
? Unknown
```

instead of:

```text
Person
Away
```

when the camera simply cannot determine the user's presence.

This supports the proposal's requirement to acknowledge false detection and computer-vision limitations.

---

# 48. Accessibility

The application should consider:

* Sufficient text contrast
* Readable font sizes
* Clear button labels
* Keyboard navigation
* Visible focus states
* Icons supported by text labels
* Avoiding color-only communication
* Clear error messages

For example, don't communicate:

```text
Green = Good
Red = Bad
```

without additional text.

Instead:

```text
✓ Good Posture
⚠ Slouched Posture
```

---

# 49. Interaction Design

Buttons should have clear hierarchy.

### Primary Button

Used for:

```text
Start Session
Continue
Save
```

### Secondary Button

Used for:

```text
Cancel
Back
View Details
```

### Destructive Button

Used for:

```text
Delete History
```

### Toggle

Used for:

```text
Camera
Notifications
Break Reminders
Posture Reminders
```

---

# 50. Animation Guidelines

Animations should be subtle.

Recommended:

* Button hover transitions
* Page transitions
* Timer state changes
* Progress animation
* Session completion animation
* Notification appearance

Avoid:

* Constant floating animations
* Excessive motion
* Distracting background effects
* Large decorative animations during focus sessions

The active-session interface should prioritize concentration.

---

# 51. Desktop Window Behavior

The application should be designed primarily for desktop use.

The interface should support:

* Standard desktop window resizing
* Minimum usable window size
* Scrolling for long pages
* Consistent sidebar navigation
* Proper chart resizing

The layout should not break when the desktop window becomes smaller.

---

# 52. Responsive Behavior

Although FocusLens is a desktop application, the interface should respond to different desktop window sizes.

### Large Window

```text
Sidebar + Wide Content + Charts
```

### Medium Window

```text
Sidebar + Compact Content
```

### Small Desktop Window

```text
Collapsed / Compact Navigation
Stacked Cards
Scrollable Content
```

---

# 53. Design Component System

The application should use reusable components.

Suggested components:

```text
Button
Card
MetricCard
StatusBadge
Timer
ProgressBar
Modal
Dialog
Toggle
Dropdown
Notification
Chart
SessionCard
NavigationItem
CameraStatus
ActivityIndicator
```

This will keep the React UI consistent and easier to maintain.

---

# 54. Component Consistency

Components should maintain consistent:

* Border radius
* Spacing
* Typography
* Button states
* Icon sizing
* Shadows
* Transitions
* Color usage

A small design system should be established in Figma before implementing all screens.

---

# 55. Spacing System

The UI should use a consistent spacing scale.

Example:

```text
4px
8px
12px
16px
24px
32px
48px
64px
```

The exact spacing values can be adjusted during implementation.

---

# 56. Card Design

Cards should be used for:

* Metrics
* Sessions
* Activity indicators
* Analytics
* Settings groups

Cards should not be overused.

The goal is to organize information rather than make every element look like a separate box.

---

# 57. Privacy-First UX Principle

The privacy model should be visible throughout the user experience.

The application should communicate:

```text
Camera
   ↓
Local Processing
   ↓
Activity Metrics
   ↓
Camera Frame Discarded
   ↓
Local Storage
```

This is one of the defining characteristics of FocusLens.

---

# 58. UX Language Guidelines

The application should use careful terminology.

### Prefer

```text
Focus Indicator
Activity Signal
Screen Facing
Person Present
Away
Posture Event
Visual Activity
```

### Avoid

```text
Productivity Score
Mental Focus Score
Attention Guarantee
Productivity Percentage
Mind Detection
```

The proposal explicitly emphasizes that FocusLens cannot determine genuine concentration, emotional focus, actual productivity, thoughts, or comprehension.

---

# 59. First-Time User Experience

The first launch should introduce the application briefly.

Possible flow:

```text
Welcome to FocusLens

A privacy-first productivity
assistant using local computer vision.

Your camera data is processed
locally.

[ Get Started ]
```

Then:

```text
Privacy Overview
      ↓
Camera Permission
      ↓
Dashboard
```

The onboarding should be short and skippable where appropriate.

---

# 60. Main Screen List

The MVP should contain the following major screens:

```text
1. Welcome / First Launch
2. Dashboard
3. Session Setup
4. Camera Permission
5. Camera Preview / Ready
6. Active Focus Session
7. Paused Session
8. Session Complete
9. Session Summary
10. Session History
11. Session Details
12. Analytics
13. Settings
14. Privacy Settings
15. Confirmation Dialogs
16. Error / Recovery States
```

---

# 61. Core Screen Relationship

```text
                    Welcome
                       ↓
                   Dashboard
                  /    |     \
                 /     |      \
                ↓      ↓       ↓
          Focus Session History Analytics
                ↓
          Session Summary
                ↓
             History
                       
Dashboard
    ↓
 Settings
    ↓
 Privacy
```

---

# 62. Figma Design Deliverables

Before frontend implementation, the UI/UX design phase should produce:

### Design System

* Colors
* Typography
* Spacing
* Buttons
* Inputs
* Cards
* Status badges
* Icons

### Main Screens

* Dashboard
* Session Setup
* Camera Permission
* Active Session
* Session Summary
* Session History
* Analytics
* Settings
* Privacy Settings

### States

* Loading
* Empty
* Error
* Active
* Paused
* Completed
* Unknown

---

# 63. MVP UI/UX Priority

The design priority should be:

### Priority 1

```text
Focus Session
Camera Permission
Dashboard
```

### Priority 2

```text
Session Summary
Session History
```

### Priority 3

```text
Analytics
Settings
Privacy Controls
```

### Future

```text
AI Insights
Advanced Analytics
Multiple Profiles
Export
Cloud Sync
Mobile Companion
```

The future features remain outside the MVP according to the proposal.

---

# 64. Final UX Flow

The intended experience is:

```text
OPEN
 ↓
Understand
 ↓
Start
 ↓
Choose Duration
 ↓
Understand Camera Privacy
 ↓
Allow / Disable Camera
 ↓
Focus
 ↓
Receive Quiet Activity Signals
 ↓
Complete Session
 ↓
Understand Results
 ↓
Review History
 ↓
Understand Trends
```

The user should always know:

**What is happening?**

**Why is it happening?**

**What data is being used?**

**Where is the data stored?**

---

# 65. Final UI/UX Definition

FocusLens should provide a calm, modern, privacy-conscious desktop experience centered around focused work sessions.

The interface should make the following information immediately understandable:

* Current session status
* Remaining session time
* Camera state
* Person presence
* Screen-facing state
* Posture state
* Focus Indicator
* Session results
* Historical activity
* Analytics trends
* Privacy settings

The design must maintain a clear distinction between **visual activity detection** and claims about human productivity.

The overall UX philosophy is:

```text
                 FOCUSLENS
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
      FOCUS        PRIVACY      INSIGHTS
        │            │            │
        ↓            ↓            ↓
    Sessions     Local Data    Analytics
        │            │            │
        └────────────┼────────────┘
                     ↓
             Better Work Habits
```

FocusLens should feel like a trustworthy desktop productivity companion that quietly observes limited visual signals, processes them locally, and helps users understand their work-session patterns without pretending to know what they are thinking or how productive they truly are.
