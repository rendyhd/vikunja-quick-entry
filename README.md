# Vikunja Quick Entry Companion App

**Capture tasks instantly. Check your list without breaking flow.**

Vikunja is a powerful task manager — but sometimes you just need to jot down a thought before it slips away, or glance at what's due next without opening a browser. That's what this companion app does.

It lives in your system tray, stays out of the way, and is always one keystroke away. Great for meetings, calls, deep work, or any time you want to capture or check tasks without losing your place.

![Windows](https://img.shields.io/badge/Windows-supported-blue)
![macOS](https://img.shields.io/badge/macOS-supported-blue)

![Slide1](https://github.com/user-attachments/assets/aaf21d48-40ae-4408-bb28-026de3c46bd7)

---

## Features

### Instant task capture with a global hotkey

Press your hotkey from anywhere and a lightweight floating window appears. Type your task, hit Enter, and it's saved to Vikunja. The window disappears and focus returns to whatever you were doing. The whole interaction takes a few seconds. Including:
- **Natural language parsing** — type dates, priorities, labels, projects, and recurrence inline and they're extracted automatically (see below)
- Quick-schedule for today (by adding `!` anywhere in your task title)
- Cycle between projects (with a keyboard shortcut while the Quick Entry window is open)
- Optional description

<img width="2260" height="1000" alt="screenshot quick" src="https://github.com/user-attachments/assets/418fc218-ae21-4b6c-b929-83284ca2bc73" />

### Browser integration

When a browser is the foreground app, Quick Entry detects the active tab's URL and title and offers to attach it to your task.

- Supports Chrome, Edge, Brave, Opera, Vivaldi, Arc, Safari (macOS), and Firefox
- Mode: Off / Ask / Always auto-link (configurable in Settings > Integrations)
- Optional browser extension for instant native messaging detection (<1ms)
- Fallback: PowerShell + UI Automation on Windows, AppleScript on macOS

### Obsidian integration

When Obsidian is the foreground app, Quick Entry detects the active note and offers to attach a deep link to your task. The link is saved in the task description and shown in Quick View.

- Requires the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) and [Advanced URI](https://github.com/Vinzent03/obsidian-advanced-uri) Obsidian plugins
- Mode: Off / Ask / Always auto-link (configurable in Settings > Integrations)
- Links survive file renames (uses UID-based deep links via Advanced URI)

<img width="718" height="261" alt="Screenshot 2026-02-27 at 20 20 10" src="https://github.com/user-attachments/assets/7771095b-ab68-4cc8-984a-aa2b3b99fbca" />

### Natural language task input

Type everything in one line and the parser extracts structured fields automatically. Recognized tokens are highlighted inline as you type, with a preview strip below the input showing what will be set.

**Dates** — powered by [chrono-node](https://github.com/wanasit/chrono), understands natural phrases:
- `tomorrow`, `next friday`, `in 3 days`, `jan 15`, `next week`, etc.

**Priority** — two syntax modes:
| Todoist mode (default) | Vikunja mode | Meaning |
|------------------------|--------------|---------|
| `p1` | `!1` | Urgent |
| `p2` | `!2` | High |
| `p3` | `!3` | Medium |
| `p4` | `!4` | Low |

Both modes also accept `!urgent`, `!high`, `!medium`, `!low`.

**Labels** — prefix with `@` (Todoist mode) or `*` (Vikunja mode). Multi-word labels use quotes: `@"work stuff"`. Autocomplete suggests matching labels from your Vikunja server as you type.

**Projects** — prefix with `#` (Todoist mode) or `+` (Vikunja mode). Autocomplete suggests matching projects. Overrides the default project for that task.

**Recurrence** — `every day`, `every 2 weeks`, `every month`, or shorthands like `daily`, `weekly`, `monthly`, `yearly`.

**Example:** `Call dentist tomorrow p2 @health every month` → title "Call dentist", due tomorrow, high priority, label "health", repeats monthly.

The parser is enabled by default and can be toggled off in Settings > Quick Entry. Syntax mode (Todoist vs Vikunja prefixes) is also configurable there.

### At-a-glance task list

A second hotkey opens Quick View: a floating list of your upcoming tasks. See what's due, check off completed items, and close it. No need to open Vikunja in a browser just to see what's next.
- Keyboard-driven navigation (Navigate tasks with arrow keys, complete them with Enter, undo with Enter again)
- Expand task descriptions inline with Tab
- Quick-schedule a task for today by pressing `!`
- Edit task titles inline with Shift+Enter
- Color-coded due dates and priorities (red for overdue, yellow for today, green for upcoming)
- Flexible filtering (select which projects and filter requirements)
- Clickable task titles open in browser

### Scheduled notifications

Desktop reminders for overdue, due-today, and upcoming tasks at configurable times.

- Two reminder times (default: 8:00 AM and 4:00 PM)
- Per-category toggles (overdue, due today, upcoming)
- Sound and persistence options
- Works in both server and standalone modes

### Standalone mode

Use the app as a local task manager without any server connection. Enable it in Settings with a single checkbox — all tasks are stored locally on your device. No Vikunja account or server needed.

- Tasks are saved to a local database (the offline cache)
- Quick View reads from local storage
- Only one project (local) — no project configuration required
- When you later connect to a server, you'll be prompted to upload your local tasks to your default Vikunja project


![Slide2](https://github.com/user-attachments/assets/4b924b62-da9d-4a73-8875-fda38332e346)

---

## Download

Grab the latest installer for your OS from the [Releases](../../releases) page.

| Platform | Format |
|----------|--------|
| Windows  | `.exe` (NSIS installer) |
| macOS    | `.dmg` (Apple Silicon) |

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
7. Settings auto-save — you're ready to go.

Press your Quick Entry hotkey anywhere to create tasks. Press your Quick View hotkey to see your task list.

---

## Usage

### Quick Entry

| Key | Action |
|-----|--------|
| **Enter** | Save task and close (or accept autocomplete suggestion) |
| **Tab** | Expand description field (or accept autocomplete suggestion) |
| **Shift+Enter** | New line in description |
| **Ctrl/Alt+Arrow** | Cycle between projects |
| **Up/Down** | Navigate autocomplete suggestions |
| **Ctrl+L** | Link detected Obsidian note or browser tab |
| **Escape** | Close autocomplete, or close window |
| **!** in title | Schedule task for today |

### Quick View

| Key / Action | Behavior |
|--------------|----------|
| **Up/Down** | Navigate task list |
| **Enter** | Complete selected task (or undo) |
| **Tab** | Expand / collapse task description |
| **Shift+Enter** | Edit task inline |
| **!** | Schedule selected task for today |
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

Most users should use the built-in Settings window (right-click tray icon > **Settings**). It has five tabs:

- **Server** — Vikunja URL, API token, default project, launch on startup, auto-update check, standalone mode toggle
- **Quick Entry** — secondary projects, hotkey, `!` scheduling, project cycle modifier
- **Quick View** — viewer hotkey, project filter, sort order, due date filter, include-today toggle
- **Notifications** — enable/disable, reminder times, category toggles (overdue, due today, upcoming), sound, persistence
- **Integrations** — Obsidian link mode + API key/vault/port, browser link mode + extension setup + bridge registration

For advanced use or automation, edit `config.json` directly.
The app looks for `config.json` in two locations (checked in order):

1. **Portable** — next to the executable / project root
2. **User data** — OS app data directory (e.g. `%APPDATA%\vikunja-quick-entry` on Windows, `~/Library/Application Support/vikunja-quick-entry` on macOS)

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
| Tasks | Read All | Quick View, Notifications |
| Tasks | Update | Quick View (complete/undo/schedule/edit) |
| Projects | Read All | Settings (project list), Quick Entry (task creation requires project access) |

---

### API endpoints used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| PUT | `/api/v1/projects/{id}/tasks` | Create a task (Quick Entry) |
| GET | `/api/v1/projects` | Fetch project list (Settings) |
| GET | `/api/v1/tasks` | Fetch tasks with filters (Quick View, Notifications) |
| POST | `/api/v1/tasks/{id}` | Update / mark task done (Quick View) |

---

## Related

Looking for voice support? [Vikunja Voice Assistant for Home Assistant by NeoHuncho](https://github.com/NeoHuncho/vikunja-voice-assistant)

## License

MIT
