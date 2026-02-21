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

**IMPORTANT**: When editing `package-lock.json`, only change the two project version fields listed above. Do NOT use `replace_all` or blanket find-and-replace — the lockfile contains hundreds of dependency version strings that will be corrupted. Always target each field individually by matching surrounding context (e.g., the `"name": "vikunja-quick-entry"` line adjacent to the version).

#### macOS Code Signing

**Do NOT add `osxSign` to `packagerConfig`.** The app uses ad-hoc signing only (no Apple Developer certificate).

The `FusesPlugin` in `forge.config.js` flips Electron security fuses, which invalidates the binary's existing code signature. How it re-signs depends on whether `osxSign` is present:

- **`osxSign` absent** (correct): FusesPlugin sets `resetAdHocDarwinSignature: true` on arm64 and runs `codesign --sign - --force --deep` itself. This works reliably.
- **`osxSign` present** (broken): FusesPlugin sets `resetAdHocDarwinSignature: false`, expecting `@electron/osx-sign` to handle it. But `@electron/osx-sign` adds `--timestamp` by default, Apple's timestamp server rejects ad-hoc signatures, the signing fails silently (due to `continueOnError: true`), and the app ships with an invalid signature — causing `SIGKILL (Code Signature Invalid)` on Apple Silicon.

### Security

All renderer windows enforce CSP (`default-src 'self'`). Electron Fuses disable `RunAsNode`, `NodeOptions`, and CLI inspect. `api.js` validates URLs to block non-HTTP(S) protocols.

### Platform-Specific Code

- `src/obsidian-client.js` — Foreground app detection: koffi FFI on Windows (sync, ~1us), osascript/JXA on macOS (async, ~50ms). Both exported as async functions (`getForegroundProcessName`, `isObsidianForeground`).
- `src/window-url-reader.js` — Browser URL reading: PowerShell + UI Automation on Windows, AppleScript on macOS. `BROWSER_PROCESSES` set uses exe names on Windows (`chrome`, `msedge`) vs display names on macOS (`Google Chrome`, `Safari`, `Arc`).
- `src/browser-host-registration.js` — Native messaging host: Windows registry + `.bat` wrapper on Windows, filesystem manifests + `.sh` wrapper on macOS.
- `src/notifications.js` — Cross-platform (Electron Notification API). No platform-specific code.
- `src/focus.js` — Windows-only focus return trick (macOS returns focus automatically).
- `src/settings/settings.js` — Platform-aware UI text: macOS shows `⌘`/`⌥` symbols, AppleScript descriptions, and permission notes; Windows shows `Ctrl`/`Alt` and Windows API references.

### macOS Notes

- Foreground detection and browser URL reading use `osascript` (async child process). The exported functions (`getForegroundProcessName`, `isObsidianForeground`) return Promises on all platforms. Callers in `showWindow()` use `await`.
- First-time browser URL detection triggers a macOS Automation permission prompt ("Vikunja Quick Entry wants to control [browser name]"). User must allow in System Settings > Privacy & Security > Automation.
- Firefox URL detection on macOS is unreliable — Firefox has no AppleScript dictionary, so it falls back to System Events accessibility (which often fails). Safari, Chrome, Edge, Brave, Arc, Vivaldi, and Opera all work reliably.
- Native messaging host manifests are written to `~/Library/Application Support/<browser>/NativeMessagingHosts/com.vikunja-quick-entry.browser.json` for Chrome, Edge, and Firefox.
- The shell wrapper for native messaging is at `~/Library/Application Support/vikunja-quick-entry/vqe-bridge.sh` — placed in `userData` (not inside the `.app` bundle) to avoid invalidating the code signature.
- Notifications work via Electron's `Notification` API. The first notification triggers a macOS permission prompt (System Settings > Notifications).

### Firefox Extension (.xpi) Build Process

The Firefox extension requires Mozilla signing. **Do NOT rebuild the `.xpi` file directly** — it will break the signature.

**Workflow:**
1. Extension source lives in `extensions/browser/` (shared with Chrome "Load unpacked")
2. Build an unsigned `.zip` from the source files for AMO upload
3. Upload the `.zip` to [addons.mozilla.org](https://addons.mozilla.org) to get a signed `.xpi` back
4. Place the signed `.xpi` at `extensions/browser/vikunja-quick-entry-firefox-extension.xpi`

**Building the `.zip`** — use `System.IO.Compression` to ensure forward slashes in entry names (PowerShell's `Compress-Archive` uses backslashes, which AMO rejects):
```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("vikunja-quick-entry-firefox-extension.zip", 'Create')
$extDir = [System.IO.Path]::GetFullPath("extensions\browser")
$files = @(
    @("manifest.json", "manifest.json"),
    @("background.js", "background.js"),
    @("icons\icon16.png", "icons/icon16.png"),
    @("icons\icon48.png", "icons/icon48.png"),
    @("icons\icon128.png", "icons/icon128.png")
)
foreach ($f in $files) {
    $srcPath = Join-Path $extDir $f[0]
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $srcPath, $f[1]) | Out-Null
}
$zip.Dispose()
```

**Key constraints:**
- Zip entry paths MUST use forward slashes (`icons/icon16.png`, not `icons\icon16.png`) or AMO rejects with "Invalid file name in archive"
- The `.xpi` in the repo must always be the Mozilla-signed version
- The extension ID is `browser-link@vikunja-quick-entry.app` (set in `manifest.json` under `browser_specific_settings.gecko.id`)
