# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vikunja Quick Entry is a lightweight Electron tray app that provides a global hotkey to quickly create tasks on a self-hosted Vikunja server. It has no taskbar/dock presence — only a system tray icon and a floating input window.

## Commands

- `npm start` — Launch in dev mode (electron-forge start)
- `npm run package` — Create app bundle without installer
- `npm run make` — Build platform-specific installers (Squirrel .exe, .dmg, .deb, .rpm)

There are no tests or linting configured.

## Architecture

### Process Model

The app uses Electron's multi-process model with strict context isolation:

- **Main process** (`src/main.js`) — App lifecycle, tray icon, global hotkey, IPC handlers, window management
- **Quick Entry renderer** (`src/renderer/`) — Frameless floating input window (560x260, transparent, always-on-top)
- **Settings renderer** (`src/settings/`) — Standard settings form window

Renderers are sandboxed (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`) and communicate with main only through preload-exposed IPC bridges.

### IPC Bridge

Each renderer has its own preload script exposing a minimal API:

- `src/preload.js` exposes `window.api` — `saveTask()`, `closeWindow()`, `getConfig()`, `onShowWindow()`
- `src/settings-preload.js` exposes `window.settingsApi` — `getFullConfig()`, `saveSettings()`, `fetchProjects()`

Main process handlers in `main.js` dispatch to:
- `src/api.js` — HTTP calls to Vikunja server via `net.request()` with 5s timeout and URL validation
- `src/config.js` — Config file read/write (looks in app dir first, then `userData`)
- `src/focus.js` — Windows-specific focus return trick (dummy window cycle)
- `src/updater.js` — GitHub release checker with 24h disk cache

### HTTP Pattern

All HTTP calls use Electron's `net.request()` wrapped in a Promise with manual `setTimeout` for timeouts. See `src/api.js` for the canonical pattern. The updater (`src/updater.js`) follows the same pattern with a 10s timeout.

### Config Resolution

`config.js` checks two locations in order:
1. Portable: `app.getAppPath()/config.json` (next to executable)
2. User data: `app.getPath('userData')/config.json` (%APPDATA% on Windows)

Required fields: `vikunja_url`, `api_token`, `default_project_id`. Optional: `hotkey` (default `Alt+Shift+V`), `launch_on_startup` (default `false`).

### Build & Release

`forge.config.js` configures Electron Forge makers for all platforms. Version is read from `package.json` and embedded in installer filenames. The CI workflow (`.github/workflows/build.yml`) builds on Windows/macOS/Linux in parallel on `v*` tag pushes, renames Linux artifacts for consistent naming, then creates a GitHub release with all installers.

### Security

Both renderer windows enforce CSP (`default-src 'self'`). Electron Fuses disable `RunAsNode`, `NodeOptions`, and CLI inspect. `api.js` validates URLs to block non-HTTP(S) protocols.
