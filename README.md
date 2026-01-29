# Vikunja Quick Entry

**Capture tasks instantly. Check your list without breaking flow.**

Vikunja is a powerful task manager for complex projects — but sometimes you just need to jot down a thought before it slips away, or glance at what's due next without opening a browser. That's what this app does.

Press a hotkey, type your task, hit Enter. Done. You never leave the app you're working in. A second hotkey shows your upcoming tasks so you can stay on top of the small things — the follow-ups, the quick errands, the "don't forget to" items — without pulling up a full project board.

It lives in your system tray, stays out of the way, and is always one keystroke away. Great for meetings, calls, deep work, or any time you want to capture or check tasks without losing your place.

![Windows](https://img.shields.io/badge/Windows-supported-blue)
![macOS](https://img.shields.io/badge/macOS-supported-blue)
![Linux](https://img.shields.io/badge/Linux-supported-blue)

<!-- TODO: Add screenshot/gif showing Quick Entry and Quick View in action -->

---

## Features

### Instant task capture with a global hotkey

Press your hotkey from anywhere — your browser, IDE, video call — and a lightweight floating window appears. Type your task, hit Enter, and it's saved to Vikunja. The window disappears and focus returns to whatever you were doing. The whole interaction takes a few seconds.

### At-a-glance task list

A second hotkey opens Quick View: a floating list of your upcoming tasks. See what's due, check off completed items, and close it. No need to open Vikunja in a browser just to see what's next.

### Quick-schedule for today

Add `!` anywhere in your task title and it's automatically scheduled for today. `Buy groceries!` becomes a task due today — no extra clicks or date pickers.

### Cycle between projects

Set up multiple projects and cycle through them with a keyboard shortcut while the Quick Entry window is open. Your default project is always one key combo away, with secondary projects in the order you choose.

### Keyboard-driven Quick View

Navigate tasks with arrow keys, complete them with Enter, undo with Enter again, or open a task in your browser with Shift+Enter. You never need to touch the mouse.

### Color-coded due dates and priorities

Quick View shows due dates with urgency at a glance — red for overdue, yellow for today, green for upcoming. Priority dots give you immediate visual context without reading a word.

### Flexible filtering

Configure Quick View to show tasks from specific projects, sorted by due date, priority, or title. Filter by due date range — overdue, today, this week, this month — so you see exactly what matters right now. Optionally include today's tasks from all projects even when filtering by project.

### Frosted glass UI with dark mode

Translucent, blurred background that blends with your desktop. Automatically matches your system's light or dark theme.

### Auto-update notifications

The app checks for new releases on GitHub and notifies you when an update is available. Click the notification to download.

### Tray-only — no clutter

No taskbar icon, no dock entry. The app lives entirely in your system tray and only appears when you call it.

### Launch on startup

Enable it once in Settings and the app is always ready when your computer starts.

### Settings GUI

Configure everything — server URL, API token, hotkeys, projects, filters — through a built-in settings window. No need to edit config files (though you can if you want to).

---

## Download

Grab the latest installer for your OS from the [Releases](../../releases) page.

| Platform | Format |
|----------|--------|
| Windows  | `.exe` (Squirrel installer) |
| macOS    | `.dmg` |
| Linux    | `.deb`, `.rpm` |

> **Windows note:** The Squirrel installer runs immediately without a confirmation dialog.

### macOS — First launch

This app is not signed with an Apple Developer certificate. macOS will block it on first launch.

**Option A** — Open **System Settings > Privacy & Security**, scroll to the Security section, and click **Open Anyway** next to the blocked app message.

**Option B** — Run once in Terminal:

```bash
xattr -cr /Applications/Vikunja\ Quick\ Entry.app
```

Either method is a one-time step. The app opens normally after that.

---

## Getting Started

1. **Launch the app** — it starts in the system tray. On first run, Settings opens automatically.
2. **Enter your Vikunja URL** — e.g. `https://app.vikunja.cloud`
3. **Enter your API token** — create one in Vikunja under **Settings > API Tokens** with these permissions:
   - **Tasks:** Create, Read All, Update
   - **Projects:** Read All
4. **Load Projects** — click the button to fetch your projects, then pick a default.
5. **Set hotkeys** — click **Record** and press your preferred key combo.
   - Quick Entry default: `Alt+Shift+V`
   - Quick View default: `Alt+Shift+B`
6. **Configure Quick View** — switch to the **Quick View** tab to set up your filter profile (projects, sort order, due date range).
7. **Save** — you're ready to go.

Press your Quick Entry hotkey anywhere to create tasks. Press your Quick View hotkey to see your task list.

---

## Usage

### Quick Entry

| Key | Action |
|-----|--------|
| **Enter** | Save task and close |
| **Tab** | Expand description field |
| **Shift+Enter** | New line in description |
| **Ctrl/Alt+Arrow** | Cycle between projects |
| **Escape** | Close without saving |
| **!** in title | Schedule task for today |

### Quick View

| Key / Action | Behavior |
|--------------|----------|
| **Up/Down** | Navigate task list |
| **Enter** | Complete selected task (or undo) |
| **Shift+Enter** | Open selected task in browser |
| **Escape** | Close the viewer |
| **Click checkbox** | Mark task as done |
| **Click task title** | Open task in browser |
| **Click outside** | Close the viewer |
| **Drag window** | Reposition (remembered for next time) |
| **Resize edge** | Adjust width (300–800 px) |

### Tray

| Action | Behavior |
|--------|----------|
| Click tray icon | Toggle Quick Entry window |
| Right-click tray icon | Menu: Quick Entry, Quick View, Settings, Check for Updates, Quit |

Both floating windows also close when you press the hotkey again while they're open.

---

## Configuration

Most users should use the built-in Settings window (right-click tray icon > **Settings**). It has two tabs:

- **Quick Entry** — default project, secondary projects, hotkey, startup behavior, `!` scheduling, update checking
- **Quick View** — viewer hotkey, project filter, sort order, due date filter, include-today toggle

### Manual configuration

For advanced use or automation, edit `config.json` directly:

```json
{
  "vikunja_url": "https://app.vikunja.cloud",
  "api_token": "tk_your_api_token_here",
  "default_project_id": 2,
  "hotkey": "Alt+Shift+V",
  "viewer_hotkey": "Alt+Shift+B",
  "launch_on_startup": false,
  "exclamation_today": true,
  "auto_check_updates": true,
  "project_cycle_modifier": "ctrl",
  "secondary_projects": [],
  "viewer_filter": {
    "project_ids": [],
    "sort_by": "due_date",
    "order_by": "asc",
    "due_date_filter": "all",
    "include_today_all_projects": false
  }
}
```

The app looks for `config.json` in two locations (checked in order):

1. **Portable** — next to the executable / project root
2. **User data** — OS app data directory (e.g. `%APPDATA%\vikunja-quick-entry` on Windows)

### Quick View filter options

| Field | Options | Default |
|-------|---------|---------|
| `project_ids` | Array of project IDs (empty = all) | `[]` |
| `sort_by` | `due_date`, `priority`, `created`, `updated`, `title` | `due_date` |
| `order_by` | `asc`, `desc` | `asc` |
| `due_date_filter` | `all`, `overdue`, `today`, `this_week`, `this_month`, `has_due_date`, `no_due_date` | `all` |
| `include_today_all_projects` | Include today's tasks from all projects regardless of project filter | `false` |

### Hotkey tips

Uses [Electron Accelerator](https://www.electronjs.org/docs/latest/api/accelerator) format.

**Good choices:** `Alt+Shift+V`, `Alt+Shift+B`, `Ctrl+Shift+N`, `Alt+N`

**Avoid on Windows:** `Ctrl+Alt+*` (conflicts with AltGr), `Ctrl+Space` (intercepted by IME switching)

### API token permissions

| Scope | Permission | Used by |
|-------|------------|---------|
| Tasks | Create | Quick Entry |
| Tasks | Read All | Quick View |
| Tasks | Update | Quick View (complete/undo) |
| Projects | Read All | Settings (project list), Quick Entry (task creation requires project access) |

---

## Roadmap

<!-- Items to be added -->

---

## Development

Requires Node.js 20+.

```bash
git clone https://github.com/rendyhd/vikunja-quick-entry.git
cd vikunja-quick-entry
npm install
npm start
```

### Project structure

```
src/
  main.js              # Main process — tray, windows, IPC, hotkeys
  preload.js           # Preload for Quick Entry window
  viewer-preload.js    # Preload for Quick View window
  settings-preload.js  # Preload for Settings window
  api.js               # Vikunja API calls (net.request with 5s timeout)
  config.js            # Config file loading/saving
  focus.js             # Focus-return helper (Windows)
  updater.js           # GitHub release checker (24h disk cache)
  renderer/            # Quick Entry UI (HTML/CSS/JS)
  viewer/              # Quick View UI (HTML/CSS/JS)
  settings/            # Settings UI (HTML/CSS/JS)
```

### Architecture

The app uses Electron's multi-process model with strict context isolation:

- **Main process** — app lifecycle, tray icon, global hotkeys, IPC handlers, window management
- **Renderer processes** — three sandboxed windows (Quick Entry, Quick View, Settings) that communicate with main only through preload-exposed IPC bridges
- **HTTP layer** — all API calls use Electron's `net.request()` wrapped in Promises with manual timeout handling

Renderers are fully sandboxed (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`). Each has its own preload script exposing a minimal API surface.

### API endpoints used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT | `/api/v1/projects/{id}/tasks` | Create a task (Quick Entry) |
| GET | `/api/v1/projects` | Fetch project list (Settings) |
| GET | `/api/v1/tasks` | Fetch tasks with filters (Quick View) |
| POST | `/api/v1/tasks/{id}` | Update / mark task done (Quick View) |

### Building

```bash
npm run make
```

Produces platform-specific installers in `out/make/` — Squirrel `.exe` on Windows, `.dmg` on macOS, `.deb` and `.rpm` on Linux.

### CI/CD

Pushing a version tag triggers a GitHub Actions workflow that builds on all three platforms and publishes a GitHub Release with all installers:

```bash
git tag v2.1.0
git push origin v2.1.0
```

Only `v*` tags trigger the workflow.

### Version bumping

The version must be updated in **two files** before tagging:

| File | Location |
|------|----------|
| `package.json` | `"version"` field |
| `package-lock.json` | Top-level `"version"` and `packages[""]["version"]` |

All three values must match.

---

## Security

- **Sandboxed renderers** — all windows run with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- **Content Security Policy** — `default-src 'self'` on all pages; no inline scripts or external resources
- **URL validation** — API calls reject non-HTTP(S) protocols
- **Electron Fuses** — `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments` all disabled
- **Request timeouts** — 5-second timeout on all API calls to prevent hanging
- **Token handling** — API token stored locally in config, displayed as password field in Settings

---

## Related

Looking for voice support? [Vikunja Voice Assistant for Home Assistant by NeoHuncho](https://github.com/NeoHuncho/vikunja-voice-assistant)

## License

MIT
