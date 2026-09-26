# FocusLens

FocusLens is a privacy-first desktop productivity assistant built with React, Vite, and Tauri.

## Project Structure

```text
src/             React UI, routing, layouts, and pages
src-tauri/       Tauri configuration and Rust native shell
Docs/            Product, architecture, requirements, and design source of truth
public/          Static frontend assets
```

Keep frontend concerns in `src/` and native or operating-system concerns in `src-tauri/`.
Future computer vision, SQLite, notifications, privacy, and native integrations should be
introduced behind those boundaries rather than mixed into page components.

## Development Standards

- Use PascalCase for React component files and component names, such as `MainLayout.tsx`.
- Use camelCase for functions, variables, and React event handlers.
- Keep route-level screens in `src/pages/` and shared application layout in `src/layouts/`.
- Prefer small, focused components and existing dependencies before adding new libraries.
- Keep Tauri commands and native integrations in `src-tauri/`; expose only deliberate frontend APIs.
- Use the six files in `Docs/` as the source of truth for product and architecture decisions.

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
- Development URL: `http://127.0.0.1:1420`

To run the desktop commands, install Rust through [rustup](https://rustup.rs/) and the Microsoft C++ Build Tools with the Windows SDK. `npx tauri info` reports whether those native prerequisites are available.

The current Tauri shell does not include computer vision, SQLite, analytics, AI, or cloud
integration. Those features remain future work until their planned implementation phase.
