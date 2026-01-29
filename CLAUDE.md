# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vikunja Quick Entry is a lightweight Electron tray app that provides global hotkeys to quickly create tasks (Quick Entry) and view open tasks (Quick View) on a self-hosted Vikunja server. It has no taskbar/dock presence — only a system tray icon and floating windows.

## Commands

- `npm start` — Launch in dev mode (electron-forge start)
- `npm run package` — Create app bundle without installer
- `npm run make` — Build platform-specific installers (Squirrel .exe, .dmg, .deb, .rpm)

There are no tests or linting configured.

## Architecture

### Process Model

The app uses Electron's multi-process model with strict context isolation:

- **Main process** (`src/main.js`) — App lifecycle, tray icon, global hotkeys, IPC handlers, window management
- **Quick Entry renderer** (`src/renderer/`) — Frameless floating input window (560x260, transparent, always-on-top)
- **Quick View renderer** (`src/viewer/`) — Frameless floating task list window (420x460, transparent, always-on-top, horizontally resizable)
- **Settings renderer** (`src/settings/`) — Standard settings form window with tabbed interface (Quick Entry / Quick View)

Renderers are sandboxed (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`) and communicate with main only through preload-exposed IPC bridges.

### IPC Bridge

Each renderer has its own preload script exposing a minimal API:

- `src/preload.js` exposes `window.api` — `saveTask()`, `closeWindow()`, `getConfig()`, `onShowWindow()`
- `src/viewer-preload.js` exposes `window.viewerApi` — `fetchTasks()`, `markTaskDone()`, `closeWindow()`, `onShowWindow()`
- `src/settings-preload.js` exposes `window.settingsApi` — `getFullConfig()`, `saveSettings()`, `fetchProjects()`

Main process handlers in `main.js` dispatch to:
- `src/api.js` — HTTP calls to Vikunja server via `net.request()` with 5s timeout and URL validation
- `src/config.js` — Config file read/write (looks in app dir first, then `userData`)
- `src/focus.js` — Windows-specific focus return trick (dummy window cycle)
- `src/updater.js` — GitHub release checker with 24h disk cache

### HTTP Pattern

All HTTP calls use Electron's `net.request()` wrapped in a Promise with manual `setTimeout` for timeouts. See `src/api.js` for the canonical pattern. The updater (`src/updater.js`) follows the same pattern with a 10s timeout.

### API Endpoints Used

- **PUT /api/v1/projects/{id}/tasks** — Create a task (Quick Entry)
- **GET /api/v1/projects** — Fetch project list (Settings)
- **GET /api/v1/tasks** — Fetch tasks with filters (Quick View)
- **POST /api/v1/tasks/{id}** — Update a task / mark as done (Quick View)

### Config Resolution

`config.js` checks two locations in order:
1. Portable: `app.getAppPath()/config.json` (next to executable)
2. User data: `app.getPath('userData')/config.json` (%APPDATA% on Windows)

Required fields: `vikunja_url`, `api_token`, `default_project_id`. Optional: `hotkey` (default `Alt+Shift+V`), `viewer_hotkey` (default `Alt+Shift+B`), `launch_on_startup` (default `false`), `viewer_filter` (filter profile for Quick View), `viewer_position` (saved window position).

### Quick View Window

The viewer window (`src/viewer/`) displays a list of 10 open tasks with:
- Checkbox to mark tasks as done
- Due date with color-coded urgency (overdue=red, today=yellow, upcoming=green)
- Priority indicators (color dots)
- Fade-out animation on task completion

The window position is saved to config on move and restored on next show. The window is horizontally resizable (300-800px) with fixed height. Clicking outside or pressing Escape closes it.

Filter parameters are configured via Settings > Quick View tab and stored in `viewer_filter`:
- `project_ids` — which projects to include (empty = all)
- `sort_by` — `due_date`, `priority`, `created`, `updated`, `title`
- `order_by` — `asc` or `desc`
- `due_date_filter` — `all`, `overdue`, `today`, `this_week`, `this_month`, `has_due_date`, `no_due_date`

### Build & Release

`forge.config.js` configures Electron Forge makers for all platforms. Version is read from `package.json` and embedded in installer filenames. The CI workflow (`.github/workflows/build.yml`) builds on Windows/macOS/Linux in parallel on `v*` tag pushes, renames Linux artifacts for consistent naming, then creates a GitHub release with all installers.

#### Version Bumping

The version must be updated in **two files, three locations** before tagging a release:

| File | Location | Example |
|------|----------|---------|
| `package.json` | `"version"` (line 3) | `"version": "1.3.2"` |
| `package-lock.json` | Top-level `"version"` (line 3) | `"version": "1.3.2"` |
| `package-lock.json` | `packages[""]["version"]` (line 9) | `"version": "1.3.2"` |

All three must match. After bumping, tag as `v<version>` and push with `--tags` to trigger CI.

#### macOS Code Signing

**Do NOT add `osxSign` to `packagerConfig`.** The app uses ad-hoc signing only (no Apple Developer certificate).

The `FusesPlugin` in `forge.config.js` flips Electron security fuses, which invalidates the binary's existing code signature. How it re-signs depends on whether `osxSign` is present:

- **`osxSign` absent** (correct): FusesPlugin sets `resetAdHocDarwinSignature: true` on arm64 and runs `codesign --sign - --force --deep` itself. This works reliably.
- **`osxSign` present** (broken): FusesPlugin sets `resetAdHocDarwinSignature: false`, expecting `@electron/osx-sign` to handle it. But `@electron/osx-sign` adds `--timestamp` by default, Apple's timestamp server rejects ad-hoc signatures, the signing fails silently (due to `continueOnError: true`), and the app ships with an invalid signature — causing `SIGKILL (Code Signature Invalid)` on Apple Silicon.

### Security

All renderer windows enforce CSP (`default-src 'self'`). Electron Fuses disable `RunAsNode`, `NodeOptions`, and CLI inspect. `api.js` validates URLs to block non-HTTP(S) protocols.
