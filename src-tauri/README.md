# FocusLens Tauri shell

The React frontend is loaded by Tauri through the Vite development server at `http://localhost:1420` during development and from `dist/` in production builds.

- `src/main.rs` is the native executable entry point.
- `src/lib.rs` creates the Tauri application and will host native commands later.
- `tauri.conf.json` defines the FocusLens window and frontend build workflow.
