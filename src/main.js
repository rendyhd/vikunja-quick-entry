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
const { createTask, fetchProjects } = require('./api');
const { returnFocusToPreviousWindow } = require('./focus');

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let config = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 260,
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

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 560,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
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
  updateTrayMenu();
  tray.on('click', () => {
    if (config) toggleWindow();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const hasConfig = !!config;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Quick Entry',
      enabled: hasConfig,
      click: () => showWindow(),
    },
    {
      label: 'Settings',
      click: () => createSettingsWindow(),
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
    return false;
  }

  return true;
}

// --- IPC Handlers ---
ipcMain.handle('save-task', async (_event, title, description) => {
  return createTask(title, description);
});

ipcMain.handle('close-window', () => {
  hideWindow();
});

ipcMain.handle('get-config', () => {
  return config
    ? { vikunja_url: config.vikunja_url, default_project_id: config.default_project_id }
    : null;
});

ipcMain.handle('get-full-config', () => {
  return config
    ? {
        vikunja_url: config.vikunja_url,
        api_token: config.api_token,
        default_project_id: config.default_project_id,
        hotkey: config.hotkey,
        launch_on_startup: config.launch_on_startup,
      }
    : null;
});

ipcMain.handle('save-settings', async (_event, settings) => {
  try {
    // Validate required fields
    if (!settings.vikunja_url || !settings.api_token || !settings.default_project_id) {
      return { success: false, error: 'URL, API token, and project are required.' };
    }

    const newConfig = {
      vikunja_url: settings.vikunja_url.replace(/\/+$/, ''),
      api_token: settings.api_token,
      default_project_id: Number(settings.default_project_id),
      hotkey: settings.hotkey || 'Alt+Shift+V',
      launch_on_startup: settings.launch_on_startup === true,
    };

    // Save to disk
    saveConfig(newConfig);

    // Reload config
    config = getConfig();

    // Re-register hotkey
    globalShortcut.unregisterAll();
    const hotkeyOk = registerShortcut();
    if (!hotkeyOk) {
      return {
        success: false,
        error: `Could not register hotkey: ${newConfig.hotkey}. Another app may be using it.`,
      };
    }

    // Apply startup setting
    app.setLoginItemSettings({ openAtLogin: config.launch_on_startup });

    // Create main window if it doesn't exist yet (first-time setup)
    if (!mainWindow) {
      createWindow();
    }

    // Update tray menu (enable "Show Quick Entry")
    updateTrayMenu();

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to save settings' };
  }
});

ipcMain.handle('fetch-projects', async (_event, url, token) => {
  return fetchProjects(url, token);
});

// --- App Lifecycle ---
app.on('ready', async () => {
  // Hide dock icon on macOS (no-op on Windows, but good practice)
  if (app.dock) {
    app.dock.hide();
  }

  config = getConfig();

  createTray();

  if (!config) {
    // No config — open settings window instead of old setup dialog
    createSettingsWindow();
    return;
  }

  createWindow();
  registerShortcut();
  app.setLoginItemSettings({ openAtLogin: config.launch_on_startup });
});

app.on('second-instance', () => {
  // If user opens a second instance, show the existing window
  if (config) {
    showWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Do not quit — this is a tray app
});
