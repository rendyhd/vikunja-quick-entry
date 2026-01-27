# Vikunja Quick Entry

Capture tasks to [Vikunja](https://vikunja.io) instantly without leaving what you're working on. Press a hotkey, type your task, hit Enter — done. Need to check what's on your plate? A second hotkey opens a Quick View of your upcoming tasks.

Looking for Voice support? [Check out Vikunja Voice Assistant for Home Assistant by NeoHuncho](https://github.com/NeoHuncho/vikunja-voice-assistant)

![Windows](https://img.shields.io/badge/Windows-supported-blue)
![macOS](https://img.shields.io/badge/macOS-supported-blue)
![Linux](https://img.shields.io/badge/Linux-supported-blue)

<!-- TODO: Add screenshot of the quick entry window here -->
<!-- ![Screenshot](assets/screenshot.png) -->

## Features

### Quick Entry

- **Instant capture** — a global hotkey summons a floating input from anywhere, in any app
- **Stays out of your way** — lives in the system tray with no taskbar or dock presence, only appears when called
- **Single instance** — launching the app twice brings up the existing window instead of starting a second copy
- **Never lose your place** — focus returns to your previous app after the window dismisses
- **Title + description** — press Tab to expand a description field for extra detail
- **Quick-schedule for today** — include `!` anywhere in the task title to set the due date to today
- **Frosted glass UI** — translucent, blurred background that blends with your desktop
- **Dark mode** — automatically matches your system theme
- **Launch on startup** — optionally start with your OS so it's always ready
- **Settings GUI** — configure everything through a built-in settings window

### Quick View

- **At-a-glance task list** — a second global hotkey opens a floating list of your open tasks
- **Due date display** — each task shows its due date with color-coded urgency (overdue, today, upcoming)
- **Complete tasks inline** — click the checkbox to mark a task as done without leaving your workflow
- **Priority indicators** — color-coded dots show task priority at a glance
- **Resizable width** — drag the window edge to adjust width; tasks wrap to fit
- **Remembers position** — drag the window anywhere and it remembers the location for next time
- **Filter profile** — configure which projects, due date range, and sort order to display
- **Frosted glass UI** — same translucent design as Quick Entry
- **Dark mode** — automatically matches your system theme

## Download

Grab the latest installer for your OS from the [Releases](../../releases) page.

_Please note that the Windows installer immediatly installs without confirmation (Squirrel installer)._

| Platform | Format |
|----------|--------|
| Windows  | `.exe` (Squirrel installer) |
| macOS    | `.dmg` |
| Linux    | `.deb`, `.rpm` |

### macOS — First Launch

This app is not signed with an Apple Developer certificate. macOS will block it on first launch.

**Option A** — Open **System Settings > Privacy & Security**, scroll to the Security section, and click **Open Anyway** next to the blocked app message.

**Option B** — Run once in Terminal:

```bash
xattr -cr /Applications/Vikunja\ Quick\ Entry.app
```

Either method is a one-time step. The app opens normally after that.

## Getting Started

1. **Launch the app** — it starts in the system tray. On first run, the Settings window opens automatically
2. **Open Settings** — or find it later via right-click on the tray icon > **Settings**
3. **Enter your Vikunja URL** — e.g. `https://app.vikunja.cloud`
4. **Enter your API token** — create one in Vikunja under **Settings > API Tokens** with **Tasks: Create, Read All, Update** and **Projects: Read All** permissions
5. **Load Projects** — click the button to fetch your projects, then pick a default
6. **Set a hotkey** — click **Record** and press your preferred key combo (default: `Alt+Shift+V`)
7. **Configure Quick View** — switch to the **Quick View** tab to set a viewer hotkey (default: `Alt+Shift+B`) and filter profile
8. **Save** — you're ready to go

Press your Quick Entry hotkey anywhere to create tasks. Press your Quick View hotkey to see your task list.

## Usage

### Quick Entry

| Key | Action |
|-----|--------|
| **Enter** | Save task and close (from title or description) |
| **Tab** | Expand description field |
| **Shift+Enter** | New line in description |
| **Escape** | Close without saving |
| **!** in title | Schedule task for today (e.g. `Buy groceries!`) |

### Quick View

| Key / Action | Behavior |
|--------------|----------|
| **Escape** | Close the viewer |
| **Click checkbox** | Mark task as done (animates out) |
| **Click outside** | Close the viewer |
| **Drag window** | Reposition (saved for next open) |
| **Resize horizontally** | Adjust width (300–800px) |

### Tray

| Action | Behavior |
|--------|----------|
| Click tray icon | Toggle quick entry window |
| Right-click tray icon | Menu: Show Quick Entry / Show Quick View / Settings / Quit |

The windows also close when you click outside them, or press the hotkey again while they're open.

## Configuration

Most users should use the built-in Settings window (right-click tray icon > Settings). The settings window has two tabs:

- **Quick Entry** — default project, hotkey, startup behavior, exclamation scheduling
- **Quick View** — viewer hotkey, project filter, sort order, due date filter

For advanced use or automation, you can manually edit `config.json`:

```json
{
  "vikunja_url": "https://app.vikunja.cloud",
  "api_token": "tk_your_api_token_here",
  "default_project_id": 2,
  "hotkey": "Alt+Shift+V",
  "launch_on_startup": false,
  "exclamation_today": true,
  "viewer_hotkey": "Alt+Shift+B",
  "viewer_filter": {
    "project_ids": [],
    "sort_by": "due_date",
    "order_by": "asc",
    "due_date_filter": "all"
  }
}
```

The app looks for `config.json` in two locations, checked in order:

1. **Portable** — next to the executable / project root
2. **User data** — the OS default app data directory (e.g. `%APPDATA%\vikunja-quick-entry` on Windows)

### Quick View Filter Profile

The `viewer_filter` object controls which tasks appear in Quick View:

| Field | Options | Default |
|-------|---------|---------|
| `project_ids` | Array of project IDs (empty = all projects) | `[]` |
| `sort_by` | `due_date`, `priority`, `created`, `updated`, `title` | `due_date` |
| `order_by` | `asc`, `desc` | `asc` |
| `due_date_filter` | `all`, `overdue`, `today`, `this_week`, `this_month`, `has_due_date`, `no_due_date` | `all` |

### Hotkey Tips

Uses [Electron Accelerator](https://www.electronjs.org/docs/latest/api/accelerator) format.

**Good choices:** `Alt+Shift+V` (Quick Entry default), `Alt+Shift+B` (Quick View default), `Ctrl+Shift+N`, `Alt+N`

**Avoid on Windows:** `Ctrl+Alt+*` (conflicts with AltGr), `Ctrl+Space` (intercepted by IME switching)

### API Token

The token needs these permissions:

- **Tasks** — `Create`, `Read All`, `Update` (Create for Quick Entry, Read All and Update for Quick View)
- **Projects** — `Read All` (required to list projects in Settings and verify access; without it, task creation returns `403`)

## Development

Requires Node.js 20+.

```bash
git clone https://github.com/rendyhd/vikunja-quick-entry.git
cd vikunja-quick-entry
npm install
npm start
```

### Project Structure

```
src/
  main.js              # Main process — tray, windows, IPC handlers
  preload.js           # Preload for quick entry window
  viewer-preload.js    # Preload for quick view window
  settings-preload.js  # Preload for settings window
  api.js               # Vikunja API calls (create/fetch tasks, mark done, fetch projects)
  config.js            # Config file loading/saving
  focus.js             # Focus return helper
  updater.js           # GitHub release checker
  renderer/
    index.html         # Quick entry window markup
    renderer.js        # Quick entry window logic
    styles.css         # Quick entry window styles
  viewer/
    viewer.html        # Quick view window markup
    viewer.js          # Quick view window logic
    viewer.css         # Quick view window styles
  settings/
    settings.html      # Settings window markup (tabbed: Quick Entry / Quick View)
    settings.js        # Settings window logic
    settings.css       # Settings window styles
```

### Building

```bash
npm run make
```

Produces platform-specific installers in `out/make/` — Squirrel `.exe` on Windows, `.dmg` on macOS, `.deb` and `.rpm` on Linux.

### CI/CD

Pushing a version tag triggers a GitHub Actions workflow that builds on all three platforms and publishes a GitHub Release with all installers attached:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Only `v*` tags trigger the workflow. Regular commits and branch pushes do not create releases.

## Security

- **Sandboxed renderers** — all windows run with `sandbox: true`
- **Context isolation** — `contextIsolation: true`, `nodeIntegration: false`
- **Content Security Policy** — `default-src 'self'` on all pages, no inline scripts or styles
- **SSRF protection** — API calls validate that URLs use HTTP(S) before making requests
- **Electron Fuses** — `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments` disabled
- **Electron 40** — includes fix for ASAR integrity bypass vulnerability

## License

MIT
