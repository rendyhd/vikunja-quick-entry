const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  dialog,
  screen,
} = require('electron');
const path = require('path');
const { getConfig, saveConfig } = require('./config');
const { createTask } = require('./api');
const { returnFocusToPreviousWindow } = require('./focus');

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let config = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Prevent the window from being destroyed — just hide it
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      hideWindow();
    }
  });

  mainWindow.on('blur', () => {
    // Hide when clicking outside
    if (mainWindow && mainWindow.isVisible()) {
      hideWindow();
    }
  });
}

function showWindow() {
  if (!mainWindow) return;

  // Center on the primary display
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const [winWidth] = mainWindow.getSize();
  const x = Math.round((screenWidth - winWidth) / 2);
  const y = Math.round(screenHeight * 0.3); // Upper third of the screen
  mainWindow.setPosition(x, y);

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window-shown');
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
  returnFocusToPreviousWindow();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    hideWindow();
  } else {
    showWindow();
  }
}

function createTrayIcon() {
  // Try loading from file first
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) return icon;
  } catch {
    // fall through to programmatic icon
  }

  // Generate a 16x16 "V" checkmark icon programmatically
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0); // RGBA

  // Draw a simple "V" checkmark in white
  const pixels = [
    // Left stroke of V
    [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
    [3, 3], [4, 4], [5, 5], [6, 6], [7, 7],
    // Right stroke of V
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13],
    [8, 8], [9, 9], [10, 10], [11, 11], [12, 12], [13, 11],
    // Bottom of V
    [7, 9], [8, 10],
  ];

  for (const [y, x] of pixels) {
    const offset = (y * size + x) * 4;
    buf[offset] = 100;     // R
    buf[offset + 1] = 149; // G
    buf[offset + 2] = 237; // B (a nice blue)
    buf[offset + 3] = 255; // A
  }

  return nativeImage.createFromBuffer(buf, {
    width: size,
    height: size,
  });
}

function createTray() {
  const trayIcon = createTrayIcon();

  tray = new Tray(trayIcon);
  tray.setToolTip('Vikunja Quick Entry');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Quick Entry',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleWindow());
}

function registerShortcut() {
  const hotkey = config ? config.hotkey : 'Alt+Shift+V';
  let registered = false;

  try {
    registered = globalShortcut.register(hotkey, () => {
      console.log(`Hotkey "${hotkey}" triggered`);
      toggleWindow();
    });
  } catch (err) {
    console.error(`Error registering shortcut "${hotkey}":`, err.message);
  }

  if (registered) {
    console.log(`Global shortcut registered: ${hotkey}`);
  } else {
    console.error(`Failed to register global shortcut: ${hotkey}`);
    dialog.showMessageBox({
      type: 'warning',
      title: 'Hotkey Registration Failed',
      message: `Could not register global shortcut: ${hotkey}`,
      detail:
        'Another application may already be using this key combination.\n\n' +
        'You can still use the app via the system tray icon.\n' +
        'To change the hotkey, edit "hotkey" in your config.json.\n\n' +
        'Examples: "Ctrl+Shift+Space", "Alt+N", "Ctrl+Alt+T"',
    });
  }
}

async function showSetupDialog() {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Vikunja Quick Entry - Setup Required',
    message: 'Configuration file not found.',
    detail:
      'Please create a config.json file in:\n' +
      `${app.getPath('userData')}\n\n` +
      'Required fields:\n' +
      '  vikunja_url: "https://vikunja.example.com"\n' +
      '  api_token: "tk_..." (needs Tasks:Create + Projects:ReadAll)\n' +
      '  default_project_id: 2 (Inbox is usually 2, not 1)\n' +
      '  hotkey: "Alt+Shift+V" (optional)',
    buttons: ['Create Template & Quit', 'Quit'],
  });

  if (response === 0) {
    saveConfig({
      vikunja_url: 'https://vikunja.example.com',
      api_token: 'tk_your_api_token_here',
      default_project_id: 2,
      hotkey: 'Alt+Shift+V',
    });
    await dialog.showMessageBox({
      type: 'info',
      title: 'Template Created',
      message: `Config template saved to:\n${app.getPath('userData')}\\config.json\n\nEdit it with your Vikunja details and restart the app.`,
    });
  }

  app.quit();
}

// --- IPC Handlers ---
ipcMain.handle('save-task', async (_event, title) => {
  return createTask(title);
});

ipcMain.handle('close-window', () => {
  hideWindow();
});

ipcMain.handle('get-config', () => {
  return config
    ? { vikunja_url: config.vikunja_url, default_project_id: config.default_project_id }
    : null;
});

// --- App Lifecycle ---
app.on('ready', async () => {
  // Hide dock icon on macOS (no-op on Windows, but good practice)
  if (app.dock) {
    app.dock.hide();
  }

  config = getConfig();
  if (!config) {
    await showSetupDialog();
    return;
  }

  createWindow();
  createTray();
  registerShortcut();
});

app.on('second-instance', () => {
  // If user opens a second instance, show the existing window
  showWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Do not quit — this is a tray app
});
