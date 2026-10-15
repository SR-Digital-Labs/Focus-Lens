# FocusLens — Day 1–35 Task Breakdown

This guide explains the planned work for **Shavisha** and **Ragavi** separately,
day by day. Assignments follow the existing [Implementation Plan](./ImplementationPlan.md)
and its responsibility-rotation example. A task marked **Shared** belongs to both
contributors; the individual focus below clarifies how they can collaborate without
changing the original ownership.

These are planned responsibilities, not a claim that every task is complete.
The team should coordinate changes, review each other's work, and adjust the
division if dependencies or project needs change.

## How to Use This Breakdown

For each day, the named person should take responsibility for implementing and
checking their part—not just discussing it. A practical daily workflow is:

1. **Agree on the handoff first.** Shavisha and Ragavi decide the input/output
   each part needs, the shared types or UI behavior, and who owns each file or
   component before coding.
2. **Implement the assigned part.** Each person makes a focused change that
   fits the current architecture and avoids duplicating the other's work.
3. **Check it locally.** Run the relevant tests or manual scenario and report
   what passed, what failed, and anything blocked.
4. **Integrate and review together.** Connect both parts, try the end-to-end
   behavior, review each other's changes, and agree whether the day's outcome
   is actually complete.

Shavisha's work often focuses on the interface and how a user controls or
understands a feature; Ragavi's often focuses on local services, CV, data, or
desktop behavior. These are only the current day's assignments, not permanent
job titles. Both should help with integration, tests, and review.

## Phase 1 — Foundation and Planning

### Day 1 — Project Initialization
- **Shavisha:** Create and run the React application; establish the root
  component and entry point; confirm the initial screen renders in the browser.
- **Ragavi:** Add/configure the Tauri shell around the frontend; launch the
  desktop app; check that the app window loads the same initial screen.
- **Together:** Agree on the supported development commands and verify a clean
  first launch from the repository instructions.
- **Outcome/check:** FocusLens opens as a desktop window and displays the React
  application without startup errors.

### Day 2 — Architecture Setup
- **Shavisha:** Create the main page layout, navigation links, route setup, and
  placeholder screens; make sure users can move between the planned pages.
- **Ragavi:** Lay out where local services and Python/CV integration will live;
  document the proposed request/event boundary without adding duplicate
  services or coupling CV code directly to page components.
- **Together:** Review the folder boundaries and agree how frontend features
  will consume local service results.
- **Outcome/check:** The app has navigable placeholder pages and a written,
  agreed boundary between UI and local services.

### Day 3 — Development Standards
- **Shavisha:** Define component naming, page/component responsibilities,
  shared styling conventions, and reusable UI patterns; apply them to a small
  representative component.
- **Ragavi:** Define service naming and error-reporting conventions; document
  required local environment configuration and review CV/database interfaces.
- **Both:** Review the six project foundation documents: PRD, TRD, App Flow,
  UI/UX Design Brief, Backend/Local Database Schema, and Implementation Plan.
  Record contradictions or decisions that need clarification.
- **Outcome/check:** A shared set of conventions and a short list of agreed
  architectural decisions, with unresolved questions visible rather than guessed.

## Phase 2 — Computer Vision Foundation

### Day 4 — Webcam Access
- **Shavisha:** Build the preview area, enable/disable control, permission or
  loading state, and a camera-active indicator that is visible whenever capture
  is running.
- **Ragavi:** Open and release the local camera device; return usable frames to
  the preview path; surface permission, missing-device, and initialization
  errors instead of leaving the UI stuck.
- **Together:** Test camera allowed, denied, unavailable, started, stopped, and
  started again.
- **Outcome/check:** The user can tell whether the camera is active, can stop it,
  and sees a useful error if access fails.

### Day 5 — OpenCV Processing
- **Shavisha:** Show processing/loading status and distinguish a camera error
  from a frame-processing error; ensure controls remain usable during loading.
- **Ragavi:** Convert and process incoming frames with OpenCV locally; measure
  frame throughput and release frame/buffer resources; do not write raw frames
  to files or send them over a network.
- **Together:** Confirm preview and processing stop cleanly when the camera is
  disabled.
- **Outcome/check:** Frames are processed locally, errors are visible, and
  capture can stop without leaving the camera held open.

### Day 6 — MediaPipe Setup
- **Shavisha:** Create reusable status UI for loading, available, unavailable,
  and detected/not-detected results; avoid claiming a detection before one is
  returned.
- **Ragavi:** Initialize MediaPipe from the local processing path; exercise face
  and pose results; isolate model setup and inference behind reusable functions;
  report model/runtime failures.
- **Together:** Verify the UI can represent both successful inference and
  detector failure.
- **Outcome/check:** MediaPipe processes local frames and returns structured
  results without storing the image.

### Day 7 — CV Signal Structure
- **Shavisha:** Define how the UI will label the planned person, screen-facing,
  and posture states, including a distinct unknown/unavailable presentation.
- **Ragavi:** Check landmark coordinate units, indices, and validity; specify a
  shared signal contract containing supported states, confidence, and
  timestamp; distinguish no face from detector failure and incomplete data.
- **Together:** Review sample valid, missing, and uncertain results and confirm
  that unknown is not displayed as away.
- **Outcome/check:** Both sides agree on the signal shape and the meaning of
  each state before detection features depend on it.

### Day 8 — CV Foundation Review
- **Shavisha:** Walk through the camera UI on normal and failure paths; check
  that status text and controls match actual camera/service state.
- **Ragavi:** Check capture/inference errors, confidence and unknown values,
  processing resources, and release behavior.
- **Both:** Run a start/stop/restart cycle, record defects with reproduction
  steps, and fix blockers before starting presence detection.
- **Outcome/check:** The foundation behaves consistently across success and
  failure cases, with known limitations recorded.

## Phase 3 — Person and Screen-Facing Detection

### Day 9 — Person Presence
- **Shavisha:** Display `PRESENT`, `AWAY`, and `UNKNOWN` distinctly, including a
  waiting/unavailable state if no reliable result has arrived.
- **Ragavi:** Map successful face detection to presence and successful
  no-detection evidence to absence; map detector errors or unreliable inputs to
  unknown. Do not treat a failed inference as proof of absence.
- **Together:** Exercise a visible person, an empty camera view, and detector
  unavailable/error cases.
- **Outcome/check:** Every result has the right state and UI label; unknown
  remains distinct from away.

### Day 10 — Screen-Facing Detection
- **Shavisha:** Display `SCREEN_FACING`, `LOOKING_AWAY`, and `UNKNOWN`; use
  wording that describes head direction, not whether the user is paying attention.
- **Ragavi:** Calculate approximate orientation from valid facial landmarks;
  check expected landmark availability and geometry; return unknown for
  incomplete, degenerate, or unavailable results.
- **Together:** Try facing the camera and turning the head, then compare the
  displayed result with the signal returned by the estimator.
- **Outcome/check:** A local approximate head-direction signal is visible and
  uncertainty is handled honestly.

### Day 11 — Confidence and Stability
- **Shavisha:** Check that the interface does not flicker on brief changes and
  makes stale or unknown information apparent where appropriate.
- **Ragavi:** Define and apply confidence gates and a small state-stability
  policy; ensure smoothing does not keep presenting a state as reliable after
  evidence has become invalid for too long.
- **Together:** Test noisy/borderline observations and agree on the expected
  transition behavior.
- **Outcome/check:** Transient noise does not cause rapid state changes, but
  prolonged uncertainty becomes unknown.

### Day 12 — Detection Integration
- **Shavisha:** Connect the common signal to the activity UI; confirm each field
  updates and that the UI can represent missing values without inventing a state.
- **Ragavi:** Combine presence and screen-facing outputs with confidence and
  timestamp; keep face loss, unreliable landmarks, and unavailable detector
  cases distinct; preserve independent signal reliability.
- **Both:** Test a person present, leaving camera view, no detectable face, and
  uncertain detection; verify repeated or stale results do not make the UI wrong.
- **Outcome/check:** One integrated signal carries consistent states,
  confidence, and time from CV processing to display.

## Phase 4 — Posture Detection

### Day 13 — Pose Landmarks
- **Shavisha:** Add a posture indicator with good, slouched, and unknown
  presentations; make unknown the neutral state until a reliable classification
  is available.
- **Ragavi:** Extract the selected body points; validate array length,
  coordinates, and required shoulder visibility; keep optional missing hips
  distinct from invalid required shoulders.
- **Together:** Check normal posture, partially occluded shoulders, and absent
  pose output.
- **Outcome/check:** The classifier receives validated landmark data plus enough
  information to know when evidence is insufficient.

### Day 14 — Posture Classification
- **Shavisha:** Present the latest posture state and changes clearly; avoid
  representing an unknown result as a posture failure.
- **Ragavi:** Use validated landmarks and scale-normalized geometry; apply
  documented thresholds/dead zones; reject ambiguous or invalid geometry as unknown.
- **Together:** Try representative upright, slouched, and unreliable landmark
  inputs; review false-positive behavior before integrating reminders.
- **Outcome/check:** Classification returns `GOOD`, `SLOUCHED`, or `UNKNOWN`
  according to evidence quality.

### Day 15 — Posture Integration and Feedback
- **Shavisha:** Add the reminder text and any dismiss/acknowledge interaction
  using existing UI patterns; show current posture and avoid interruptive
  behavior for uncertain results.
- **Ragavi:** Apply reliable-state smoothing and sustained-slouch timing; only
  trigger when presence and current posture evidence are reliable; reset timing
  on good/unknown posture or confirmed absence; read the existing reminder
  preferences rather than duplicating settings.
- **Both:** Test sustained slouch, brief slouch, good posture, unknown posture,
  absence, and disabled reminders.
- **Outcome/check:** A reminder appears only under the intended reliable
  conditions and respects user settings.

## Phase 5 — Focus Session Engine

### Day 16 — Session Setup and Lifecycle
- **Shavisha:** Build duration selection for 25, 45, 60, and custom minutes;
  validate custom input; show the selected duration before starting.
- **Ragavi:** Document lifecycle states and allowed transitions; define how
  session ID, start/end/pause times, active elapsed time, and pause duration are
  represented; state which component owns lifecycle versus countdown.
- **Together:** Walk through a normal start/pause/resume/complete path and an
  early end; resolve what the UI should show for each state.
- **Outcome/check:** Duration setup works and the session-state model is
  explicit enough for the timer and storage work to follow.

### Day 17 — Timer and Session Contract
- **Shavisha:** Render remaining time and current session state; wire start,
  pause, resume, and end controls; disable or guard actions that are invalid
  for the current state.
- **Ragavi:** Define manager/timer calls and state events; specify what happens
  at zero, on early end, on repeated actions, and after app interruption; ensure
  a paused interval is not counted as focus time.
- **Together:** Check transitions and timer display against the agreed lifecycle
  contract, including invalid/repeated button actions.
- **Outcome/check:** The timer controls work and the UI and lifecycle contract
  agree on session behavior.

### Day 18 — Activity Monitoring
- **Shavisha:** Show current person, screen-facing, and posture indicators and
  a suitable last-updated/unavailable state during a session.
- **Ragavi:** Subscribe to the existing CV signal source; attach/check the active
  session ID; validate timestamps and payloads; ignore duplicate, stale,
  mismatched, paused-session, and terminal-session events; unsubscribe on stop.
- **Together:** Test live updates, unavailable CV, pause/resume, completion,
  cancellation, session-ID changes, and listener cleanup.
- **Outcome/check:** Only valid derived signals update the matching running
  session, and monitor resources are cleaned up.

### Day 19 — Away Detection
- **Shavisha:** Show when the user is reliably away and, if required by the
  design, show the resulting away duration without confusing it with paused time.
- **Ragavi:** Apply the configured threshold to reliable `AWAY` evidence; record
  the start/end of an away interval and compute duration without counting
  `UNKNOWN` as away.
- **Together:** Test short absence below threshold, sustained absence, return,
  unknown detection, and session pause.
- **Outcome/check:** Away time is derived only from confirmed absence during an
  eligible running session.

## Phase 6 — Local SQLite Storage

### Day 20 — Database Setup
- **Shavisha:** Identify which screens/services need stored data and connect
  them through service interfaces; show an actionable error if storage cannot
  be initialized.
- **Ragavi:** Initialize SQLite locally; create the initial schema and indexes;
  define migration/version handling and constraints for sessions, events,
  preferences, and privacy settings.
- **Together:** Verify a fresh database initializes, schema changes are repeatable,
  and a storage failure is visible rather than silently ignored.
- **Outcome/check:** A local database is created with a versioned schema and
  callers do not depend directly on raw SQL details.

### Day 21 — Session Storage
- **Shavisha:** Show saved session summaries/details and handle loading, empty,
  and storage-error states; connect completion to a refresh of session data.
- **Ragavi:** Implement repository operations using the agreed schema; validate
  IDs and timestamps; ensure updates/deletes affect the intended session and
  surface database errors.
- **Together:** Create, read, update, and delete test sessions; confirm the UI
  reflects stored values after reload.
- **Outcome/check:** Session persistence is local and repository operations are
  verified through their consumers.

### Day 22 — Activity Event Storage
- **Shavisha:** Connect relevant activity transitions to the session display or
  history UI; make sure unsupported or unknown values are not mislabelled.
- **Ragavi:** Store only derived events with session ID, event type, and
  timestamp/needed metadata; validate references and avoid saving raw frames,
  images, or unnecessary landmarks.
- **Both:** Agree on event names, test event ordering and session association,
  and confirm data is written only to local storage.
- **Outcome/check:** Derived activity history can be queried for the right
  session without any raw webcam data.

## Phase 7 — Tauri Desktop Integration

### Day 23 — Frontend/Desktop Integration
- **Shavisha:** Connect UI actions and desktop-specific states through the
  approved Tauri APIs; keep browser/dev behavior understandable if supported.
- **Ragavi:** Implement/configure the required Tauri commands, permissions, and
  native-side error responses; expose only the capabilities the app needs.
- **Together:** Test each command from its UI caller and verify permission or
  native failures produce a visible error.
- **Outcome/check:** The React app can use required native features through a
  defined, permissioned interface.

### Day 24 — CV/Desktop Integration
- **Shavisha:** Subscribe to the agreed signal/event interface, update the right
  screen/session, and unsubscribe when the view or app host is removed.
- **Ragavi:** Connect Tauri to the local CV process/service; define startup,
  shutdown, payload validation, and error reporting; send derived state only.
- **Together:** Follow one signal end-to-end and test unavailable CV, malformed
  output, and application shutdown.
- **Outcome/check:** Signals travel React → Tauri → local CV → React with no
  raw frames crossing or being persisted.

### Day 25 — Desktop Resource Handling
- **Shavisha:** Test window close/navigation behavior, active camera indicators,
  session controls during service failures, and whether users can recover.
- **Ragavi:** Check camera release, CV process stop, Tauri listener cleanup,
  database closure/flush, and cleanup after errors or interrupted startup.
- **Together:** Run a start/use/pause/close/reopen scenario; inspect logs and
  ensure no process or device remains unexpectedly active.
- **Outcome/check:** Application shutdown and failure paths release owned
  resources and leave session state consistent.

## Phase 8 — Dashboard and Analytics

### Day 26 — Dashboard
- **Shavisha:** Build today's summary cards and recent-session list with loading,
  empty, and error states; make values understandable and accessible.
- **Ragavi:** Add local queries/aggregates for each displayed metric; define date
  boundaries and ensure queries handle no sessions.
- **Together:** Seed known session data and check each displayed number against
  the stored records.
- **Outcome/check:** Dashboard values match local data and sensible empty-state
  behavior is shown.

### Day 27 — Session History
- **Shavisha:** Build a browsable history list and a session-detail view; include
  loading, no-history, error, and selected-session states.
- **Ragavi:** Implement paged/sorted or date-filtered history queries as required
  by the design, plus a detail query that returns events for one session.
- **Together:** Verify ordering, detail-to-list navigation, missing/deleted
  sessions, and correct event association.
- **Outcome/check:** Users can find a session and see only its own stored details.

### Day 28 — Analytics
- **Shavisha:** Display daily/weekly charts and summary metrics with labels,
  units, empty states, and accessible descriptions.
- **Ragavi:** Produce aggregates for focus duration, session counts and lengths,
  away time, screen-facing time, posture events, and trends; document
  definitions so each metric has one consistent meaning.
- **Together:** Compare chart totals to a small known set of sessions/events and
  check date boundaries/time zones.
- **Outcome/check:** Analytics can be traced back to stored records and labels
  match the calculation.

## Phase 9 — Privacy, Settings, and UX

### Day 29 — Settings
- **Shavisha:** Build controls for general, session, and reminder preferences;
  show current values and validation feedback and avoid losing edits without
  clear save behavior.
- **Ragavi:** Validate ranges/types, persist preferences locally, load defaults,
  and notify consumers when values change.
- **Both:** Restart the app and verify persistence; test focus-active water
  intervals and sleep reminders using local clock time.
- **Outcome/check:** Valid settings survive restart and changes affect the
  intended feature without unexpected side effects.

### Day 30 — Privacy Settings
- **Shavisha:** Build camera/tracking, notification, storage, and delete-history
  controls; explain the effect of each choice and confirm destructive history
  deletion.
- **Ragavi:** Persist privacy choices, enforce them in the relevant services,
  and ensure disabling a feature stops its processing/listeners as intended.
- **Together:** Verify each control changes actual behavior, survives restart
  when appropriate, and reports failures.
- **Outcome/check:** Privacy controls are functional—not just visual—and users
  receive clear confirmation of changes.

### Day 31 — Privacy UX Review
- **Shavisha:** Review labels, control discoverability, permission explanations,
  delete confirmation, keyboard/accessibility behavior, and whether error and
  unknown states are understandable.
- **Ragavi:** Review actual camera/tracking behavior against the privacy text;
  confirm unknown/unavailable results are safe and the app does not retain raw
  frames.
- **Together:** Walk through first launch, permission denial, disabling tracking,
  deleting data, and reminder settings as a user.
- **Outcome/check:** The product's stated privacy behavior matches its actual
  behavior and is understandable without developer knowledge.

## Phase 10 — Testing and Optimization

### Day 32 — Functional Testing
- **Shavisha:** Test user journeys through camera controls, session setup/timer,
  history, analytics, settings, and delete confirmation; record reproducible UI
  issues.
- **Ragavi:** Test service/repository behavior for session lifecycle, away
  tracking, persistence, and settings; add or run automated tests for important
  boundaries and failure cases.
- **Together:** Run the complete launch-to-session-to-history workflow, record
  test results, and fix regressions introduced by the feature work.
- **Outcome/check:** A repeatable test record exists and high-priority functional
  failures are fixed or explicitly tracked.

### Day 33 — CV and Performance Testing
- **Shavisha:** Run realistic user scenarios—facing the screen, turning away,
  leaving view, changing posture, and obscuring landmarks—and record confusing
  labels or false detections.
- **Ragavi:** Measure inference behavior and resource use; inspect confidence,
  transition stability, camera lifetime, CPU/memory usage, and long-running
  sessions; tune only with documented evidence.
- **Together:** Re-run the same scenarios after fixes and compare results.
- **Outcome/check:** CV behavior and performance have scenario-based evidence,
  not only a successful startup.

### Day 34 — Privacy and Reliability Testing
- **Shavisha:** Attempt to disable camera/tracking, deny permissions, delete
  session history, and recover from visible errors; check that the UI clearly
  reports what happened.
- **Ragavi:** Inspect storage and logs for raw frames; simulate camera, detector,
  database, and interrupted-session failures; verify cleanup and recovery
  without counting unobserved downtime as focus time.
- **Together:** Confirm failure cases do not bypass privacy controls or leave
  misleading success states.
- **Outcome/check:** Privacy requirements and major recovery paths have been
  verified and any remaining risks are documented.

## Phase 11 — Finalization and Packaging

### Day 35 — Finalization
- **Shavisha:** Fix final visual defects, check navigation and desktop sizing,
  verify important empty/error states, and capture accurate product screenshots.
- **Ragavi:** Run the production build; verify database initialization,
  local-service packaging, permissions, and production configuration; prepare
  the desktop installer/package and record build limitations.
- **Both:** Check the MVP checklist against working evidence, review the six
  foundation documents for accuracy, prepare run/demo instructions, and
  identify incomplete items honestly.
- **Outcome/check:** A buildable, reviewed desktop MVP package and a demo that
  reflects the actual verified product.

## Working Agreement

- These assignments rotate responsibility; they do **not** mean Shavisha is
  permanently frontend-only or Ragavi is permanently backend-only.
- For shared days, agree on interfaces and ownership of individual changes before
  implementation, then review and test the integrated result together.
- Keep webcam processing local, store only necessary derived data, and preserve
  `UNKNOWN` whenever detection evidence is missing or unreliable.
- Mark a task complete only after its expected behavior has been implemented and
  verified; this document describes the plan, not completion status.
