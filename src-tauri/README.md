# FocusLens Tauri shell

The React frontend is loaded by Tauri through the Vite development server at `http://127.0.0.1:1420` during development and from `dist/` in production builds.

- `src/main.rs` is the native executable entry point.
- `src/lib.rs` creates the Tauri application, exposes native commands, locates local CV resources, and stops the CV subprocess when the application exits.
- `tauri.conf.json` defines the FocusLens window, frontend build workflow, and the Python CV source files copied into the production resource directory.
- The SQLite plugin stores `sqlite:focuslens.db` in the app's local data directory and applies the schema migration on load.
- The desktop close handler flushes pending session writes, stops the CV pipeline, marks unfinished sessions interrupted, closes the frontend database connection, and only then allows the window to exit.

## Local CV runtime

The desktop CV pipeline starts the system Python runtime (`python` on Windows,
`python3` on macOS/Linux) and requires the packages in `../cv/requirements.txt`.
From `src-tauri/`, install the dependencies with
`python -m pip install -r ../cv/requirements.txt` (use `python3` on
macOS/Linux), then download the MediaPipe task models with
`python ../cv/models/download_model.py` and
`python ../cv/models/download_pose_model.py` before starting the pipeline or
building a package. The task model files are intentionally not checked into
source control; the bundle includes them from `cv/models/` when present at
build time. Packaged builds still require a compatible Python runtime and its
dependencies on the user's machine. If the models are missing, pipeline startup
returns an actionable error instead of leaving the desktop app in a false
"running" state.
