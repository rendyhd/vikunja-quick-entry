// Handle Squirrel.Windows install/update/uninstall events
// This must run before anything else
if (process.platform === 'win32') {
  const squirrelCommand = process.argv[1];
  if (squirrelCommand) {
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const appFolder = path.resolve(process.execPath, '..');
    const rootFolder = path.resolve(appFolder, '..');
    const updateExe = path.resolve(path.join(rootFolder, 'Update.exe'));
    const exeName = path.basename(process.execPath);

    const spawnUpdate = (args) => {
      try {
        spawn(updateExe, args, { detached: true });
      } catch {
        // Update.exe not found — ignore
      }
    };

    if (squirrelCommand === '--squirrel-install' || squirrelCommand === '--squirrel-updated') {
      spawnUpdate(['--createShortcut', exeName]);
      setTimeout(() => process.exit(0), 1500);
    } else if (squirrelCommand === '--squirrel-uninstall') {
      spawnUpdate(['--removeShortcut', exeName]);
      // Clean up user data (config, cache) from %APPDATA%
      const userDataDir = path.join(process.env.APPDATA, 'vikunja-quick-entry');
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures
      }
      setTimeout(() => process.exit(0), 1500);
    } else if (squirrelCommand === '--squirrel-obsolete') {
      process.exit(0);
    }

    // If we matched a squirrel command, stop executing the rest of main.js
    if (squirrelCommand.startsWith('--squirrel-')) {
      return;
    }
  }
}

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  Notification,
  shell,
  dialog,
  screen,
} = require('electron');
const path = require('path');
const { getConfig, saveConfig } = require('./config');
const { createTask, fetchProjects, fetchTasks, markTaskDone, markTaskUndone } = require('./api');
const { returnFocusToPreviousWindow } = require('./focus');
const { checkForUpdates } = require('./updater');

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let viewerWindow = null;
let settingsWindow = null;
let tray = null;
let config = null;
let updateInfo = null;
let updateNotification = null;

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
      sandbox: true,
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
    if (app.dock) {
      app.dock.show();
    }
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 700,
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
      sandbox: true,
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    if (app.dock) {
      app.dock.show();
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (app.dock) {
      app.dock.hide();
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
  mainWindow.webContents.send('window-hidden');
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

// --- Viewer Window ---
function createViewerWindow() {
  viewerWindow = new BrowserWindow({
    width: 420,
    height: 460,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 300,
    maxWidth: 800,
    minHeight: 460,
    maxHeight: 460,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'viewer-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  viewerWindow.loadFile(path.join(__dirname, 'viewer', 'viewer.html'));

  // Prevent the window from being destroyed — just hide it
  viewerWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      hideViewer();
    }
  });

  viewerWindow.on('blur', () => {
    if (viewerWindow && viewerWindow.isVisible()) {
      hideViewer();
    }
  });

  // Save position when window is moved
  viewerWindow.on('moved', () => {
    if (!viewerWindow || !config) return;
    const [x, y] = viewerWindow.getPosition();
    const updatedConfig = Object.assign({}, config, { viewer_position: { x, y } });
    saveConfig(updatedConfig);
    config = getConfig();
  });
}

function showViewer() {
  if (!viewerWindow) return;

  if (config && config.viewer_position) {
    // Use saved position, but ensure it's on-screen
    const displays = screen.getAllDisplays();
    const pos = config.viewer_position;
    const onScreen = displays.some((d) => {
      const bounds = d.workArea;
      return pos.x >= bounds.x && pos.x < bounds.x + bounds.width &&
             pos.y >= bounds.y && pos.y < bounds.y + bounds.height;
    });
    if (onScreen) {
      viewerWindow.setPosition(pos.x, pos.y);
    } else {
      centerViewer();
    }
  } else {
    centerViewer();
  }

  viewerWindow.show();
  viewerWindow.focus();
  viewerWindow.webContents.send('viewer-shown');
}

function centerViewer() {
  if (!viewerWindow) return;
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const [winWidth] = viewerWindow.getSize();
  const x = Math.round((screenWidth - winWidth) / 2);
  const y = Math.round(screenHeight * 0.2);
  viewerWindow.setPosition(x, y);
}

function hideViewer() {
  if (!viewerWindow) return;
  viewerWindow.hide();
  returnFocusToPreviousWindow();
}

function toggleViewer() {
  if (!viewerWindow) return;
  if (viewerWindow.isVisible()) {
    hideViewer();
  } else {
    showViewer();
  }
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      // Resize to appropriate tray icon size (16x16, with @2x for HiDPI)
      return icon.resize({ width: 16, height: 16 });
    }
  } catch {
    // fall through to programmatic icon
  }

  // Fallback: generate a 16x16 "V" checkmark icon programmatically
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0); // RGBA

  const pixels = [
    [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
    [3, 3], [4, 4], [5, 5], [6, 6], [7, 7],
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13],
    [8, 8], [9, 9], [10, 10], [11, 11], [12, 12], [13, 11],
    [7, 9], [8, 10],
  ];

  for (const [y, x] of pixels) {
    const offset = (y * size + x) * 4;
    buf[offset] = 100;     // R
    buf[offset + 1] = 149; // G
    buf[offset + 2] = 237; // B
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

  const items = [
    {
      label: 'Show Quick Entry',
      enabled: hasConfig,
      click: () => showWindow(),
    },
    {
      label: 'Show Quick View',
      enabled: hasConfig,
      click: () => showViewer(),
    },
    {
      label: 'Settings',
      click: () => createSettingsWindow(),
    },
  ];

  if (updateInfo) {
    items.push({
      label: `Update Available (${updateInfo.version})`,
      click: () => shell.openExternal(updateInfo.url),
    });
  }

  items.push(
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => performUpdateCheck(true),
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  );

  const contextMenu = Menu.buildFromTemplate(items);
  tray.setContextMenu(contextMenu);
}

function performUpdateCheck(force = false) {
  checkForUpdates(
    {
      onUpdateAvailable(version, url) {
        updateInfo = { version, url };
        updateTrayMenu();

        if (Notification.isSupported()) {
          updateNotification = new Notification({
            title: 'Vikunja Quick Entry',
            body: `Update available: ${version}. Click to download.`,
          });
          updateNotification.on('click', () => shell.openExternal(url));
          updateNotification.show();
        }
      },
    },
    force,
  ).catch(() => {
    // Silently ignore update check failures
  });
}

function registerShortcuts() {
  let allOk = true;

  // Quick Entry hotkey
  const entryHotkey = config ? config.hotkey : 'Alt+Shift+V';
  try {
    const registered = globalShortcut.register(entryHotkey, () => {
      console.log(`Entry hotkey "${entryHotkey}" triggered`);
      toggleWindow();
    });
    if (registered) {
      console.log(`Quick Entry shortcut registered: ${entryHotkey}`);
    } else {
      console.error(`Failed to register Quick Entry shortcut: ${entryHotkey}`);
      allOk = false;
    }
  } catch (err) {
    console.error(`Error registering entry shortcut "${entryHotkey}":`, err.message);
    allOk = false;
  }

  // Quick View hotkey
  const viewerHotkey = config ? config.viewer_hotkey : 'Alt+Shift+B';
  try {
    const registered = globalShortcut.register(viewerHotkey, () => {
      console.log(`Viewer hotkey "${viewerHotkey}" triggered`);
      toggleViewer();
    });
    if (registered) {
      console.log(`Quick View shortcut registered: ${viewerHotkey}`);
    } else {
      console.error(`Failed to register Quick View shortcut: ${viewerHotkey}`);
      // Don't fail overall if only viewer hotkey fails
    }
  } catch (err) {
    console.error(`Error registering viewer shortcut "${viewerHotkey}":`, err.message);
  }

  return allOk;
}

// --- IPC Handlers ---
ipcMain.handle('save-task', async (_event, title, description, dueDate, projectId) => {
  return createTask(title, description, dueDate, projectId);
});

ipcMain.handle('close-window', () => {
  hideWindow();
});

ipcMain.handle('get-config', () => {
  return config
    ? {
        vikunja_url: config.vikunja_url,
        default_project_id: config.default_project_id,
        exclamation_today: config.exclamation_today,
        secondary_projects: config.secondary_projects || [],
      }
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
        exclamation_today: config.exclamation_today,
        auto_check_updates: config.auto_check_updates,
        viewer_hotkey: config.viewer_hotkey,
        viewer_filter: config.viewer_filter,
        secondary_projects: config.secondary_projects || [],
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
      exclamation_today: settings.exclamation_today !== false,
      auto_check_updates: settings.auto_check_updates !== false,
      viewer_hotkey: settings.viewer_hotkey || 'Alt+Shift+B',
      viewer_filter: settings.viewer_filter || {
        project_ids: [],
        sort_by: 'due_date',
        order_by: 'asc',
        due_date_filter: 'all',
      },
      secondary_projects: Array.isArray(settings.secondary_projects) ? settings.secondary_projects : [],
    };

    // Preserve viewer_position from existing config
    if (config && config.viewer_position) {
      newConfig.viewer_position = config.viewer_position;
    }

    // Save to disk
    saveConfig(newConfig);

    // Reload config
    config = getConfig();

    // Re-register hotkeys
    globalShortcut.unregisterAll();
    const hotkeyOk = registerShortcuts();
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

    // Create viewer window if it doesn't exist yet
    if (!viewerWindow) {
      createViewerWindow();
    }

    // Update tray menu (enable "Show Quick Entry" / "Show Quick View")
    updateTrayMenu();

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to save settings' };
  }
});

ipcMain.handle('fetch-projects', async (_event, url, token) => {
  return fetchProjects(url, token);
});

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// --- Viewer IPC Handlers ---
ipcMain.handle('fetch-viewer-tasks', async () => {
  if (!config) {
    return { success: false, error: 'Configuration not loaded' };
  }
  const filterParams = {
    per_page: 10,
    page: 1,
    project_ids: config.viewer_filter.project_ids,
    sort_by: config.viewer_filter.sort_by,
    order_by: config.viewer_filter.order_by,
    due_date_filter: config.viewer_filter.due_date_filter,
  };
  return fetchTasks(filterParams);
});

ipcMain.handle('mark-task-done', async (_event, taskId) => {
  return markTaskDone(taskId);
});

ipcMain.handle('mark-task-undone', async (_event, taskId) => {
  return markTaskUndone(taskId);
});

ipcMain.handle('open-task-in-browser', (_event, taskId) => {
  if (!config) return;
  const url = `${config.vikunja_url}/tasks/${taskId}`;
  if (url.startsWith('https://') || url.startsWith('http://')) {
    shell.openExternal(url);
  }
});

ipcMain.handle('close-viewer', () => {
  hideViewer();
});

// --- App Lifecycle ---
app.on('ready', async () => {
  // Hide dock icon on macOS (no-op on Windows, but good practice)
  if (app.dock) {
    app.dock.hide();
  }

  config = getConfig();

  createTray();
  if (!config || config.auto_check_updates) {
    performUpdateCheck();
  }

  if (!config) {
    // No config — open settings window instead of old setup dialog
    createSettingsWindow();
    return;
  }

  createWindow();
  createViewerWindow();
  registerShortcuts();
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
