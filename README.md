# FocusLens

FocusLens is a privacy-first desktop productivity assistant built with React, Vite, and Tauri.

## Day 01: Desktop Foundation

The Tauri shell lives in `src-tauri/`. React is the frontend, while Tauri provides the native desktop window and the Rust entry point for future local integrations.

```text
npm run dev       # React only
npm run tauri:dev # React + Tauri desktop window
npm run build     # Frontend production build
npm run tauri:build
```

The development window is configured as follows:

- Product name: `FocusLens`
- Window title: `FocusLens`
- Default size: `1280 x 800`
- Development URL: `http://localhost:1420`

To run the desktop commands, install Rust through [rustup](https://rustup.rs/) and the Microsoft C++ Build Tools with the Windows SDK. `npx tauri info` reports whether those native prerequisites are available.
