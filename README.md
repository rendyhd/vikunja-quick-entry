# Vikunja Quick Entry

Capture tasks to [Vikunja](https://vikunja.io) instantly without leaving what you're working on. Press a hotkey, type your task, hit Enter — done.
Looking for Voice support? [Check out Vikunja Voice Assistant by NeoHuncho](https://github.com/NeoHuncho/vikunja-voice-assistant)

![Windows](https://img.shields.io/badge/Windows-supported-blue)
![macOS](https://img.shields.io/badge/macOS-supported-blue)
![Linux](https://img.shields.io/badge/Linux-supported-blue)

<!-- TODO: Add screenshot of the quick entry window here -->
<!-- ![Screenshot](assets/screenshot.png) -->

## Features

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
4. **Enter your API token** — create one in Vikunja under **Settings > API Tokens** with **Tasks: Create** and **Projects: Read All** permissions
5. **Load Projects** — click the button to fetch your projects, then pick a default
6. **Set a hotkey** — click **Record** and press your preferred key combo (default: `Alt+Shift+V`)
7. **Save** — you're ready to go

Press your hotkey anywhere to open the input, type a task, and hit Enter.

## Usage

### Quick Entry

| Key | Action |
|-----|--------|
| **Enter** | Save task and close (from title or description) |
| **Tab** | Expand description field |
| **Shift+Enter** | New line in description |
| **Escape** | Close without saving |
| **!** in title | Schedule task for today (e.g. `Buy groceries!`) |

### Tray

| Action | Behavior |
|--------|----------|
| Click tray icon | Toggle quick entry window |
| Right-click tray icon | Menu: Show Quick Entry / Settings / Quit |

The window also closes when you click outside it, or press the hotkey again while it's open.

## Configuration

Most users should use the built-in Settings window (right-click tray icon > Settings). For advanced use or automation, you can manually edit `config.json`:

```json
{
  "vikunja_url": "https://vikunja.example.com",
  "api_token": "tk_your_api_token_here",
  "default_project_id": 2,
  "hotkey": "Alt+Shift+V",
  "launch_on_startup": false,
  "exclamation_today": true
}
```

The app looks for `config.json` in two locations, checked in order:

1. **Portable** — next to the executable / project root
2. **User data** — the OS default app data directory (e.g. `%APPDATA%\vikunja-quick-entry` on Windows)

### Hotkey Tips

Uses [Electron Accelerator](https://www.electronjs.org/docs/latest/api/accelerator) format.

**Good choices:** `Alt+Shift+V` (default), `Ctrl+Shift+N`, `Alt+N`

**Avoid on Windows:** `Ctrl+Alt+*` (conflicts with AltGr), `Ctrl+Space` (intercepted by IME switching)

### API Token

The token needs two permissions:

- **Tasks** — `Create`
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
  settings-preload.js  # Preload for settings window
  api.js               # Vikunja API calls (create task, fetch projects)
  config.js            # Config file loading/saving
  focus.js             # Focus return helper
  renderer/
    index.html         # Quick entry window markup
    renderer.js        # Quick entry window logic
    styles.css         # Quick entry window styles
  settings/
    settings.html      # Settings window markup
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

- **Sandboxed renderers** — both windows run with `sandbox: true`
- **Context isolation** — `contextIsolation: true`, `nodeIntegration: false`
- **Content Security Policy** — `default-src 'self'` on all pages, no inline scripts or styles
- **SSRF protection** — API calls validate that URLs use HTTP(S) before making requests
- **Electron Fuses** — `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments` disabled
- **Electron 40** — includes fix for ASAR integrity bypass vulnerability

## License

MIT
