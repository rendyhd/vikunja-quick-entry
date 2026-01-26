# Vikunja Quick Entry

A lightweight system tray app with a global hotkey that opens a minimal floating text input for adding tasks to [Vikunja](https://vikunja.io).

## Setup

Copy `config.example.json` to `config.json` and fill in your details:

```json
{
  "vikunja_url": "https://vikunja.example.com",
  "api_token": "tk_your_api_token_here",
  "default_project_id": 2,
  "hotkey": "Alt+Shift+V"
}
```

### `vikunja_url`

The base URL of your Vikunja instance, without a trailing slash.

### `api_token`

Create an API token in Vikunja under **Settings > API Tokens**.

The token needs these permissions at minimum:
- **Tasks**: `Create`
- **Projects**: `Read All`

Both are required. `Projects: Read All` is needed so the API can verify your access to the target project. Without it, task creation returns `403 Forbidden`.

### `default_project_id`

The numeric ID of the project where tasks will be created.

**How to find your project ID:**

1. Open your Vikunja instance
2. Call `GET /api/v1/projects` with your API token (the token needs `Projects: Read All`)
3. Find your project in the response and note its `"id"` field

Using curl:
```bash
curl -s "https://vikunja.example.com/api/v1/projects" \
  -H "Authorization: Bearer tk_your_api_token_here"
```

Note: The default "Inbox" project is typically ID **2**, not 1.

### `hotkey`

The global keyboard shortcut to open the quick entry window. Uses [Electron Accelerator](https://www.electronjs.org/docs/latest/api/accelerator) format.

**Hotkeys that won't work on Windows:**
- `Ctrl+Alt+*` combinations — conflict with AltGr key and are often intercepted by the OS
- `Ctrl+Space` — intercepted by Windows for IME (input method) switching
- `Ctrl+Shift+Space` — commonly used by 1Password and similar apps

**Recommended hotkeys:**
- `Alt+Shift+V` (default) — unlikely to conflict with anything
- `Ctrl+Shift+N`
- `Ctrl+Shift+A`
- `Alt+N`

## Usage

```bash
npm install
npm start
```

The app runs in the system tray. Press your configured hotkey to open the quick entry window.

| Action | Behavior |
|--------|----------|
| Press hotkey | Window appears, input focused |
| Type + Enter | Task saved to Vikunja, window closes |
| Escape | Window closes, nothing saved |
| Click outside | Window closes |
| Hotkey while open | Window closes (toggle) |
| Tray icon click | Toggle window |
| Tray right-click | Context menu (Show / Quit) |

## Building

```bash
npm run make
```

Produces a Windows installer in the `out/` directory.
