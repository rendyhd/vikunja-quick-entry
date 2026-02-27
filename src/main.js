const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  Notification,
  shell,
  dialog,
  screen,
} = require('electron');
const path = require('path');
const { getConfig, saveConfig, isEncryptionAvailable } = require('./config');
const { createTask, fetchProjects, fetchTasks, markTaskDone, markTaskUndone, updateTaskDueDate, updateTask, fetchProjectViews, fetchViewTasks, fetchLabels, addLabelToTask } = require('./api');
const { returnFocusToPreviousWindow } = require('./focus');
const { checkForUpdates } = require('./updater');
const { initNotifications, rescheduleNotifications, stopNotifications, sendTestNotification } = require('./notifications');
const { getForegroundProcessName, getForegroundWindowHandle, isObsidianForeground, getObsidianContext, testObsidianConnection } = require('./obsidian-client');
const { getBrowserContext } = require('./browser-client');
const { BROWSER_PROCESSES, getBrowserUrlFromWindow, prewarmUrlReader, shutdownUrlReader } = require('./window-url-reader');
const { registerChromeHost, registerFirefoxHost, isRegistered } = require('./browser-host-registration');
const {
  addPendingAction,
  removePendingAction,
  removePendingActionByTaskId,
  getPendingActions,
  getPendingCount,
  setCachedTasks,
  getCachedTasks,
  isRetriableError,
  isAuthError,
  addStandaloneTask,
  getStandaloneTasks,
  getAllStandaloneTasks,
  markStandaloneTaskDone,
  markStandaloneTaskUndone,
  scheduleStandaloneTaskToday,
  removeStandaloneTaskDueDate,
  updateStandaloneTask,
  clearStandaloneTasks,
} = require('./cache');

// Silently ignore EPIPE errors on stdout/stderr — happens when the
// launching terminal closes but the tray app keeps running.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err) => {
    if (err.code === 'EPIPE') return;
    throw err;
  });
}

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
let syncTimer = null;
let isSyncing = false;
let isResettingViewerHeight = false;
const SHADOW_PADDING = 20; // px of transparent space around container for CSS box-shadow
const DRAG_HANDLE_HEIGHT = 14;
let viewerDesiredHeight = 460 + DRAG_HANDLE_HEIGHT + SHADOW_PADDING * 2;
let dragHoverTimer = null;
let mainWindowDragHover = false;
let viewerWindowDragHover = false;
let cacheRefreshTimer = null;
let isRefreshingCache = false;
let cacheRefreshBackoff = 30000;
const CACHE_REFRESH_BASE_INTERVAL = 30000;  // 30s
const CACHE_REFRESH_MAX_INTERVAL = 300000;  // 5min cap
const CACHE_REFRESH_BACKOFF_FACTOR = 2;
const CACHE_REFRESH_JITTER = 0.25;          // +/-25%
let lastAuthNotificationTime = 0;
const AUTH_NOTIFICATION_COOLDOWN = 3600000; // 1 hour

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560 + SHADOW_PADDING * 2,
    height: 260 + SHADOW_PADDING * 2,
    frame: false,
    transparent: true,
    hasShadow: false,
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

  // Save position when window is moved
  mainWindow.on('moved', () => {
    if (!mainWindow || !config) return;
    const [x, y] = mainWindow.getPosition();
    const updatedConfig = Object.assign({}, config, { entry_position: { x, y } });
    saveConfig(updatedConfig);
    config = getConfig();
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
    width: 480,
    height: 640,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: true,
    minWidth: 420,
    minHeight: 500,
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
    // Revert theme to saved config (reverts live preview if user cancelled)
    nativeTheme.themeSource = (config && config.theme) || 'system';
    if (app.dock) {
      app.dock.hide();
    }
  });
}

async function showWindow() {
  if (!mainWindow) return;

  // Detect foreground app first — used by both Obsidian and browser detection.
  // Done before showing window, while the previous app still has focus.
  const fgProcess = await getForegroundProcessName();

  // Capture foreground window handle BEFORE showing our window (steals focus).
  // Passed to the PowerShell URL reader so it targets the correct window.
  const fgHwnd = getForegroundWindowHandle();

  // 1. Obsidian detection
  let obsidianCtx = null;
  if (config && config.obsidian_mode !== 'off' && config.obsidian_api_key &&
      (fgProcess === 'Obsidian' || fgProcess === 'obsidian')) {
    obsidianCtx = await Promise.race([
      getObsidianContext(config),
      new Promise((resolve) => setTimeout(() => resolve(null), 350)),
    ]);
  }

  // 2. Browser detection (only if Obsidian didn't match and foreground IS a browser)
  let browserCtx = null;
  if (!obsidianCtx && config && config.browser_link_mode !== 'off' && BROWSER_PROCESSES.has(fgProcess)) {
    browserCtx = getBrowserContext(); // extension path (<1ms)
    if (!browserCtx) {
      browserCtx = await Promise.race([
        getBrowserUrlFromWindow(fgProcess, fgHwnd),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
    }
  }

  if (config && config.entry_position) {
    // Use saved position, but ensure it's on-screen
    const displays = screen.getAllDisplays();
    const pos = config.entry_position;
    const onScreen = displays.some((d) => {
      const bounds = d.workArea;
      return pos.x >= bounds.x && pos.x < bounds.x + bounds.width &&
             pos.y >= bounds.y && pos.y < bounds.y + bounds.height;
    });
    if (onScreen) {
      mainWindow.setPosition(pos.x, pos.y);
    } else {
      centerEntryWindow();
    }
  } else {
    centerEntryWindow();
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window-shown');

  // Send context IPC after window-shown so resetInput() in the renderer
  // doesn't immediately clear the context that was just set
  if (obsidianCtx) {
    mainWindow.webContents.send('obsidian-context', { ...obsidianCtx, mode: config.obsidian_mode });
  }
  if (!obsidianCtx && browserCtx) {
    mainWindow.webContents.send('browser-context', { ...browserCtx, mode: config.browser_link_mode });
  }

  startDragHoverPolling();

  // Opportunistically try to sync pending queue when user activates window
  processPendingQueue();
}

function centerEntryWindow() {
  if (!mainWindow) return;
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const [winWidth] = mainWindow.getSize();
  const x = Math.round((screenWidth - winWidth) / 2);
  const y = Math.round(screenHeight * 0.3); // Upper third of the screen
  mainWindow.setPosition(x, y);
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.webContents.send('window-hidden');
  mainWindow.hide();
  stopDragHoverPolling();
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
    width: 420 + SHADOW_PADDING * 2,
    height: 460 + DRAG_HANDLE_HEIGHT + SHADOW_PADDING * 2,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 300 + SHADOW_PADDING * 2,
    maxWidth: 800 + SHADOW_PADDING * 2,
    minHeight: 60 + SHADOW_PADDING * 2,
    maxHeight: 460 + DRAG_HANDLE_HEIGHT + SHADOW_PADDING * 2,
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

  // Lock height to desired value — frameless transparent windows on Windows
  // allow content-driven resizing that bypasses maxHeight constraints
  viewerWindow.on('resize', () => {
    if (isResettingViewerHeight) return;
    const [w, h] = viewerWindow.getSize();
    if (h !== viewerDesiredHeight) {
      isResettingViewerHeight = true;
      viewerWindow.setSize(w, viewerDesiredHeight);
      isResettingViewerHeight = false;
    }
  });
}

function showViewer() {
  if (!viewerWindow) return;

  // Pre-size window to desired height before showing to avoid stale-height flash
  const [currentWidth] = viewerWindow.getSize();
  isResettingViewerHeight = true;
  viewerWindow.setSize(currentWidth, viewerDesiredHeight);
  isResettingViewerHeight = false;

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
  startDragHoverPolling();

  // Opportunistically try to sync pending queue when user activates viewer
  processPendingQueue();
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
  stopDragHoverPolling();
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
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'icon.png')
    : path.join(app.getAppPath(), 'assets', 'icon.png');
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

// --- Auth Error Notification (rate-limited) ---
function showAuthErrorNotification(errorMsg) {
  const now = Date.now();
  if (now - lastAuthNotificationTime < AUTH_NOTIFICATION_COOLDOWN) return;
  lastAuthNotificationTime = now;

  const n = new Notification({
    title: 'Vikunja \u2014 Connection Error',
    body: errorMsg || 'API token is invalid or expired. Open Settings to update it.',
  });
  n.on('click', () => {
    createSettingsWindow();
  });
  n.show();
}

// --- Offline Sync Processor ---
async function processPendingQueue() {
  if (isSyncing) return;
  const pending = getPendingActions();
  if (pending.length === 0) return;

  isSyncing = true;
  let syncedAny = false;

  try {
    for (const action of pending) {
      let result;
      try {
        switch (action.type) {
          case 'create':
            result = await createTask(action.title, action.description, action.dueDate, action.projectId);
            break;
          case 'complete':
            result = await markTaskDone(action.taskId, action.taskData);
            break;
          case 'uncomplete':
            result = await markTaskUndone(action.taskId, action.taskData);
            break;
          case 'schedule-today':
          case 'remove-due-date':
            result = await updateTaskDueDate(action.taskId, action.taskData, action.dueDate);
            break;
          case 'update-task':
            result = await updateTask(action.taskId, action.taskData);
            break;
          default:
            // Unknown action type, remove it
            removePendingAction(action.id);
            continue;
        }
      } catch (err) {
        // Unexpected error, treat as retriable
        break;
      }

      if (result.success) {
        removePendingAction(action.id);
        syncedAny = true;
      } else if (result.error && isAuthError(result.error)) {
        // Auth error — stop processing but keep actions (user needs to fix token)
        showAuthErrorNotification(result.error);
        break;
      } else if (result.error && isRetriableError(result.error)) {
        // Network still down — stop processing, retry later
        break;
      } else {
        // Permanent error (404, 400, etc.) — discard action
        removePendingAction(action.id);
        syncedAny = true;
      }
    }
  } finally {
    isSyncing = false;
  }

  // Notify renderers so they can update pending counts / refresh
  if (syncedAny) {
    notifyRenderersSyncCompleted();
  }
}

function notifyRenderersSyncCompleted() {
  // Always notify entry window (lightweight — just updates pending count badge)
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-completed');
    }
  } catch { /* ignore */ }
  // Only notify viewer if visible (triggers a full task reload)
  try {
    if (viewerWindow && !viewerWindow.isDestroyed() && viewerWindow.isVisible()) {
      viewerWindow.webContents.send('sync-completed');
    }
  } catch { /* ignore */ }
}

function startSyncTimer() {
  if (syncTimer) return;
  // Try to sync pending actions every 30 seconds
  syncTimer = setInterval(() => {
    processPendingQueue();
  }, 30000);
}

function stopSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

// --- View ID Cache (for position-based sorting) ---
const viewIdCache = new Map();

async function getListViewId(projectId) {
  if (viewIdCache.has(projectId)) {
    return viewIdCache.get(projectId);
  }

  const result = await fetchProjectViews(projectId);
  if (!result.success || !Array.isArray(result.data)) {
    return null;
  }

  // Find the "list" view — Vikunja creates one by default for every project
  const listView = result.data.find((v) => v.view_kind === 'list') || result.data[0];
  if (!listView) return null;

  viewIdCache.set(projectId, listView.id);
  return listView.id;
}

async function fetchTasksByPosition(filterParams) {
  const projectIds = filterParams.project_ids;
  if (!projectIds || projectIds.length === 0) {
    return { success: false, error: 'Position sort requires specific projects to be selected' };
  }

  const allTasks = [];

  for (const projectId of projectIds) {
    const viewId = await getListViewId(projectId);
    if (!viewId) continue;

    const result = await fetchViewTasks(projectId, viewId, filterParams);
    if (result.success && Array.isArray(result.data)) {
      allTasks.push(...result.data);
    } else if (result.error && !isRetriableError(result.error)) {
      // Non-retriable error on a single project — skip it
      continue;
    } else if (result.error) {
      // Retriable error — propagate so caller can fall back to cache
      return result;
    }
  }

  return { success: true, tasks: allTasks };
}

// --- Background Task Cache Refresh ---
function buildFilterParams() {
  if (!config || !config.viewer_filter) return null;
  return {
    per_page: 10000,
    page: 1,
    project_ids: config.viewer_filter.project_ids,
    sort_by: config.viewer_filter.sort_by,
    order_by: config.viewer_filter.order_by,
    due_date_filter: config.viewer_filter.due_date_filter,
    include_today_all_projects: config.viewer_filter.include_today_all_projects,
  };
}

async function refreshTaskCache() {
  if (isRefreshingCache) return;
  if (!config || config.standalone_mode) return;

  // Skip if viewer is visible (it fetches on its own via IPC)
  if (viewerWindow && !viewerWindow.isDestroyed() && viewerWindow.isVisible()) {
    scheduleCacheRefresh();
    return;
  }

  // Skip if offline — net.on('online') will restart the chain
  const { net } = require('electron');
  if (!net.isOnline()) return;

  isRefreshingCache = true;
  try {
    const filterParams = buildFilterParams();
    if (!filterParams) return;

    const result = filterParams.sort_by === 'position'
      ? await fetchTasksByPosition(filterParams)
      : await fetchTasks(filterParams);

    if (result.success) {
      setCachedTasks(result.tasks);
      cacheRefreshBackoff = CACHE_REFRESH_BASE_INTERVAL; // reset on success
    } else if (result.error && isAuthError(result.error)) {
      showAuthErrorNotification(result.error);
    } else if (isRetriableError(result.error)) {
      // Exponential backoff: 30s → 60s → 120s → 240s → 300s cap
      cacheRefreshBackoff = Math.min(
        cacheRefreshBackoff * CACHE_REFRESH_BACKOFF_FACTOR,
        CACHE_REFRESH_MAX_INTERVAL
      );
    }
  } finally {
    isRefreshingCache = false;
    scheduleCacheRefresh();
  }
}

function scheduleCacheRefresh() {
  if (cacheRefreshTimer) {
    clearTimeout(cacheRefreshTimer);
    cacheRefreshTimer = null;
  }
  if (!config || config.standalone_mode) return;

  // Apply jitter: ±25% of current backoff
  const jitter = cacheRefreshBackoff * CACHE_REFRESH_JITTER;
  const delay = cacheRefreshBackoff + (Math.random() * 2 - 1) * jitter;

  cacheRefreshTimer = setTimeout(() => {
    cacheRefreshTimer = null;
    refreshTaskCache();
  }, delay);
}

function stopCacheRefresh() {
  if (cacheRefreshTimer) {
    clearTimeout(cacheRefreshTimer);
    cacheRefreshTimer = null;
  }
  cacheRefreshBackoff = CACHE_REFRESH_BASE_INTERVAL;
  isRefreshingCache = false;
}

// --- Drag Handle Hover Polling ---
// CSS :hover doesn't work on -webkit-app-region: drag elements (Electron limitation).
// Poll cursor position from the main process and send IPC to toggle a CSS class.
function checkDragHover(win, prevHover) {
  if (!win || win.isDestroyed() || !win.isVisible()) return prevHover;
  const bounds = win.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const inRegion =
    cursor.x >= bounds.x + SHADOW_PADDING &&
    cursor.x < bounds.x + bounds.width - SHADOW_PADDING &&
    cursor.y >= bounds.y + SHADOW_PADDING &&
    cursor.y < bounds.y + SHADOW_PADDING + DRAG_HANDLE_HEIGHT;
  if (inRegion !== prevHover) {
    try { win.webContents.send('drag-hover', inRegion); } catch { /* ignore */ }
  }
  return inRegion;
}

function startDragHoverPolling() {
  if (dragHoverTimer) return;
  dragHoverTimer = setInterval(() => {
    mainWindowDragHover = checkDragHover(mainWindow, mainWindowDragHover);
    viewerWindowDragHover = checkDragHover(viewerWindow, viewerWindowDragHover);
  }, 50);
}

function stopDragHoverPolling() {
  const mainVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  const viewerVisible = viewerWindow && !viewerWindow.isDestroyed() && viewerWindow.isVisible();
  if (mainVisible || viewerVisible) return; // still have a visible window
  if (dragHoverTimer) {
    clearInterval(dragHoverTimer);
    dragHoverTimer = null;
  }
  mainWindowDragHover = false;
  viewerWindowDragHover = false;
}

let networkPollTimer = null;

function setupNetworkListeners() {
  const { net } = require('electron');
  let wasOnline = net.isOnline();

  networkPollTimer = setInterval(() => {
    const isNowOnline = net.isOnline();
    if (isNowOnline && !wasOnline) {
      // Came back online
      cacheRefreshBackoff = CACHE_REFRESH_BASE_INTERVAL;
      refreshTaskCache();
      processPendingQueue();
    } else if (!isNowOnline && wasOnline) {
      // Went offline
      if (cacheRefreshTimer) {
        clearTimeout(cacheRefreshTimer);
        cacheRefreshTimer = null;
      }
    }
    wasOnline = isNowOnline;
  }, 5000);
}

// --- IPC Handlers ---
ipcMain.handle('save-task', async (_event, title, description, dueDate, projectId, priority, repeatAfter, repeatMode) => {
  // Standalone mode: store locally, no API calls
  if (config && config.standalone_mode) {
    const task = addStandaloneTask(title, description || null, dueDate || null);
    // Notify viewer to refresh (invalidates stale in-memory cache)
    try {
      if (viewerWindow && !viewerWindow.isDestroyed()) {
        viewerWindow.webContents.send('sync-completed');
      }
    } catch { /* ignore */ }
    return { success: true, task };
  }

  const result = await createTask(title, description, dueDate, projectId, priority, repeatAfter, repeatMode);

  if (result.success) {
    // Notify viewer to invalidate stale cache
    try {
      if (viewerWindow && !viewerWindow.isDestroyed()) {
        viewerWindow.webContents.send('sync-completed');
      }
    } catch { /* ignore */ }
    processPendingQueue();
    return result;
  }

  // If it's a network/retriable error, cache the task for later sync
  if (isRetriableError(result.error)) {
    addPendingAction({
      type: 'create',
      title,
      description: description || null,
      dueDate: dueDate || null,
      projectId: projectId || null,
    });
    return { success: true, cached: true };
  }

  // Permanent error (auth, validation, etc.) — return as-is
  return result;
});

ipcMain.handle('close-window', () => {
  hideWindow();
});

ipcMain.handle('get-encryption-status', () => {
  return { available: isEncryptionAvailable() };
});

ipcMain.handle('get-config', () => {
  return config
    ? {
        vikunja_url: config.vikunja_url,
        default_project_id: config.default_project_id,
        exclamation_today: config.exclamation_today,
        secondary_projects: config.secondary_projects || [],
        project_cycle_modifier: config.project_cycle_modifier || 'ctrl',
        standalone_mode: config.standalone_mode === true,
        obsidian_mode: config.obsidian_mode || 'off',
        browser_link_mode: config.browser_link_mode || 'off',
        nlp_enabled: config.nlp_enabled !== false,
        nlp_syntax_mode: config.nlp_syntax_mode || 'todoist',
      }
    : null;
});

ipcMain.handle('get-full-config', () => {
  return config
    ? {
        platform: process.platform,
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
        project_cycle_modifier: config.project_cycle_modifier || 'ctrl',
        standalone_mode: config.standalone_mode === true,
        theme: config.theme || 'system',
        // Notification settings
        notifications_enabled: config.notifications_enabled,
        notifications_persistent: config.notifications_persistent,
        notifications_daily_reminder_enabled: config.notifications_daily_reminder_enabled,
        notifications_daily_reminder_time: config.notifications_daily_reminder_time,
        notifications_secondary_reminder_enabled: config.notifications_secondary_reminder_enabled,
        notifications_secondary_reminder_time: config.notifications_secondary_reminder_time,
        notifications_overdue_enabled: config.notifications_overdue_enabled,
        notifications_due_today_enabled: config.notifications_due_today_enabled,
        notifications_upcoming_enabled: config.notifications_upcoming_enabled,
        notifications_sound: config.notifications_sound,
        // Integration settings
        obsidian_mode: config.obsidian_mode || 'off',
        obsidian_api_key: config.obsidian_api_key || '',
        obsidian_port: config.obsidian_port || 27124,
        obsidian_vault_name: config.obsidian_vault_name || '',
        browser_link_mode: config.browser_link_mode || 'off',
        browser_extension_id: config.browser_extension_id || '',
      }
    : null;
});

ipcMain.handle('preview-theme', (_event, theme) => {
  const valid = ['system', 'light', 'dark'];
  nativeTheme.themeSource = valid.includes(theme) ? theme : 'system';
});

ipcMain.handle('test-notification', () => {
  sendTestNotification();
});

ipcMain.handle('save-settings', async (_event, settings) => {
  try {
    const isStandalone = settings.standalone_mode === true;

    // Validate required fields (relaxed in standalone mode and partial saves)
    const hasServerFields = settings.vikunja_url && settings.api_token && settings.default_project_id;
    if (!isStandalone && !settings.partial && !hasServerFields) {
      return { success: false, error: 'URL, API token, and project are required.' };
    }

    const newConfig = {
      standalone_mode: isStandalone,
      vikunja_url: settings.vikunja_url ? settings.vikunja_url.replace(/\/+$/, '') : '',
      api_token: settings.api_token || '',
      default_project_id: settings.default_project_id ? Number(settings.default_project_id) : 0,
      hotkey: settings.hotkey || 'Alt+Shift+V',
      launch_on_startup: settings.launch_on_startup === true,
      exclamation_today: settings.exclamation_today !== false,
      auto_check_updates: settings.auto_check_updates !== false,
      project_cycle_modifier: settings.project_cycle_modifier || 'ctrl',
      viewer_hotkey: settings.viewer_hotkey || 'Alt+Shift+B',
      viewer_filter: settings.viewer_filter || {
        project_ids: [],
        sort_by: 'due_date',
        order_by: 'asc',
        due_date_filter: 'all',
        include_today_all_projects: false,
      },
      secondary_projects: Array.isArray(settings.secondary_projects) ? settings.secondary_projects : [],
      theme: settings.theme || 'system',
      // Notification settings
      notifications_enabled: settings.notifications_enabled === true,
      notifications_persistent: settings.notifications_persistent === true,
      notifications_daily_reminder_enabled: settings.notifications_daily_reminder_enabled !== false,
      notifications_daily_reminder_time: settings.notifications_daily_reminder_time || '08:00',
      notifications_secondary_reminder_enabled: settings.notifications_secondary_reminder_enabled === true,
      notifications_secondary_reminder_time: settings.notifications_secondary_reminder_time || '16:00',
      notifications_overdue_enabled: settings.notifications_overdue_enabled !== false,
      notifications_due_today_enabled: settings.notifications_due_today_enabled !== false,
      notifications_upcoming_enabled: settings.notifications_upcoming_enabled === true,
      notifications_sound: settings.notifications_sound !== false,
      // Integration settings
      obsidian_mode: settings.obsidian_mode || 'off',
      obsidian_api_key: settings.obsidian_api_key || '',
      obsidian_port: settings.obsidian_port || 27124,
      obsidian_vault_name: settings.obsidian_vault_name || '',
      browser_link_mode: settings.browser_link_mode || 'off',
      browser_extension_id: settings.browser_extension_id || '',
    };

    // Preserve window positions from existing config
    if (config && config.viewer_position) {
      newConfig.viewer_position = config.viewer_position;
    }
    if (config && config.entry_position) {
      newConfig.entry_position = config.entry_position;
    }

    // Save to disk
    saveConfig(newConfig);

    // Reload config
    config = getConfig();

    // Apply saved theme
    nativeTheme.themeSource = config.theme || 'system';

    // Reschedule notifications with updated config
    rescheduleNotifications();

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

    // Notify viewer to invalidate stale cache (filters may have changed)
    try {
      if (viewerWindow && !viewerWindow.isDestroyed()) {
        viewerWindow.webContents.send('sync-completed');
      }
    } catch { /* ignore */ }

    if (isStandalone) {
      // No sync in standalone mode
      stopSyncTimer();
      stopCacheRefresh();
    } else if (hasServerFields) {
      // Ensure sync timer is running (may not be if this is first-time setup)
      startSyncTimer();
      stopCacheRefresh();       // restart with fresh config
      refreshTaskCache();       // re-fetch with updated filters
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to save settings' };
  }
});

ipcMain.handle('fetch-projects', async (_event, url, token) => {
  return fetchProjects(url, token);
});

ipcMain.handle('fetch-labels', async () => {
  if (!config || config.standalone_mode) {
    return { success: true, labels: [] };
  }
  return fetchLabels();
});

ipcMain.handle('fetch-projects-for-renderer', async () => {
  if (!config || config.standalone_mode) {
    return { success: true, projects: [] };
  }
  return fetchProjects(config.vikunja_url, config.api_token);
});

ipcMain.handle('add-label-to-task', async (_event, taskId, labelId) => {
  if (!config || config.standalone_mode) {
    return { success: false, error: 'Not available in standalone mode' };
  }
  return addLabelToTask(taskId, labelId);
});

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// --- Deep link handler (obsidian:// and http(s)://) ---
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'obsidian:']);

ipcMain.handle('open-deep-link', (_event, url) => {
  if (typeof url !== 'string') return;
  try {
    const parsed = new URL(url);
    if (ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      shell.openExternal(url);
    }
  } catch { /* invalid URL */ }
});

// --- Obsidian & Browser integration IPC ---
ipcMain.handle('test-obsidian-connection', async (_event, apiKey, port) => {
  return testObsidianConnection(apiKey || '', port || 27124);
});

ipcMain.handle('check-browser-host-registration', () => {
  return isRegistered();
});

ipcMain.handle('register-browser-hosts', (_event, extensionId) => {
  if (extensionId) registerChromeHost(extensionId);
  registerFirefoxHost();
  return isRegistered();
});

ipcMain.handle('open-browser-extension-folder', () => {
  const extensionDir = app.isPackaged
    ? path.join(process.resourcesPath, 'extensions', 'browser')
    : path.join(app.getAppPath(), 'extensions', 'browser');
  const { existsSync } = require('fs');
  if (existsSync(extensionDir)) {
    shell.showItemInFolder(extensionDir);
  }
});

ipcMain.handle('test-browser-bridge', () => {
  const { existsSync, readFileSync, statSync } = require('fs');
  const { execSync } = require('child_process');
  const { getBridgePath, isRegistered: getBridgeRegistration } = require('./browser-host-registration');
  const { getBrowserContext } = require('./browser-client');
  const os = require('os');

  const result = {};
  const HOST_NAME = 'com.vikunja_quick_entry.browser';

  // 1. Check native messaging host manifests
  if (process.platform === 'darwin') {
    const firefoxManifestPath = path.join(
      os.homedir(),
      'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts',
      `${HOST_NAME}.json`
    );
    result.firefoxManifestPath = firefoxManifestPath;
    result.firefoxManifestExists = existsSync(firefoxManifestPath);
    if (result.firefoxManifestExists) {
      try {
        result.firefoxManifestContent = JSON.parse(readFileSync(firefoxManifestPath, 'utf-8'));
      } catch (err) {
        result.firefoxManifestError = err.message;
      }
    }

    const chromeManifestPath = path.join(
      os.homedir(),
      'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts',
      `${HOST_NAME}.json`
    );
    result.chromeManifestPath = chromeManifestPath;
    result.chromeManifestExists = existsSync(chromeManifestPath);
  }

  // 2. Check shell wrapper / bat wrapper
  const wrapperPath = process.platform === 'darwin'
    ? path.join(app.getPath('userData'), 'vqe-bridge.sh')
    : path.join(path.dirname(getBridgePath()), 'vqe-bridge.bat');
  result.wrapperPath = wrapperPath;
  result.wrapperExists = existsSync(wrapperPath);
  if (result.wrapperExists && process.platform === 'darwin') {
    try {
      const stats = statSync(wrapperPath);
      result.wrapperExecutable = !!(stats.mode & 0o111);
    } catch { /* ignore */ }
  }

  // 3. Check bridge JS exists
  const bridgePath = getBridgePath();
  result.bridgePath = bridgePath;
  result.bridgeExists = existsSync(bridgePath);

  // 4. Check node availability
  try {
    const nodeVersion = execSync('node --version', { timeout: 3000 }).toString().trim();
    result.nodeAvailable = true;
    result.nodeVersion = nodeVersion;
  } catch {
    result.nodeAvailable = false;
  }

  // 5. Check browser-context.json status
  const contextPath = path.join(app.getPath('userData'), 'browser-context.json');
  result.contextPath = contextPath;
  result.contextExists = existsSync(contextPath);
  if (result.contextExists) {
    try {
      const raw = readFileSync(contextPath, 'utf-8');
      const data = JSON.parse(raw);
      result.contextData = data;
      if (typeof data.timestamp === 'number') {
        result.contextAge = `${Date.now() - data.timestamp}ms`;
      }
    } catch (err) {
      result.contextError = err.message;
    }
  }

  // 6. Live test: try reading browser context
  const ctx = getBrowserContext();
  result.liveContext = ctx;

  return result;
});

ipcMain.handle('save-firefox-extension', async () => {
  const { existsSync, copyFileSync } = require('fs');
  const xpiName = 'vikunja-quick-entry-firefox-extension.xpi';
  const xpiPath = app.isPackaged
    ? path.join(process.resourcesPath, 'extensions', 'browser', xpiName)
    : path.join(app.getAppPath(), 'extensions', 'browser', xpiName);

  if (!existsSync(xpiPath)) {
    return { success: false, error: 'Extension file not found.' };
  }

  const result = await dialog.showSaveDialog(settingsWindow || null, {
    defaultPath: xpiName,
    filters: [{ name: 'Firefox Extension', extensions: ['xpi'] }],
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    copyFileSync(xpiPath, result.filePath);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Viewer IPC Handlers ---
ipcMain.handle('fetch-viewer-tasks', async () => {
  if (!config) {
    return { success: false, error: 'Configuration not loaded' };
  }

  // Standalone mode: read from local store
  if (config.standalone_mode) {
    const tasks = getStandaloneTasks(
      config.viewer_filter.sort_by,
      config.viewer_filter.order_by,
    );
    return { success: true, tasks, standalone: true };
  }

  const filterParams = buildFilterParams();
  if (!filterParams) {
    return { success: false, error: 'No filter configuration' };
  }

  const result = filterParams.sort_by === 'position'
    ? await fetchTasksByPosition(filterParams)
    : await fetchTasks(filterParams);

  if (result.success) {
    // Cache the fresh task list for offline use
    setCachedTasks(result.tasks);
    // Also try to flush any pending actions while we have connectivity
    processPendingQueue();
    return result;
  }

  // API failed — serve cached tasks if available
  if (isRetriableError(result.error)) {
    const cached = getCachedTasks();
    if (cached.tasks) {
      return {
        success: true,
        tasks: cached.tasks,
        cached: true,
        cachedAt: cached.timestamp,
      };
    }
  }

  // No cache available, or permanent error
  return result;
});

ipcMain.handle('mark-task-done', async (_event, taskId, taskData) => {
  // Standalone mode: update local store
  if (config && config.standalone_mode) {
    const task = markStandaloneTaskDone(String(taskId));
    return task ? { success: true, task } : { success: false, error: 'Task not found' };
  }

  const result = await markTaskDone(taskId, taskData);

  if (result.success) {
    processPendingQueue();
    return result;
  }

  // Network error — cache the completion for later sync
  if (isRetriableError(result.error)) {
    addPendingAction({
      type: 'complete',
      taskId,
      taskData,
    });
    return { success: true, cached: true };
  }

  return result;
});

ipcMain.handle('mark-task-undone', async (_event, taskId, taskData) => {
  // Standalone mode: update local store
  if (config && config.standalone_mode) {
    const task = markStandaloneTaskUndone(String(taskId));
    return task ? { success: true, task } : { success: false, error: 'Task not found' };
  }

  // Check if there's a pending 'complete' for this task — if so, just cancel it
  const cancelled = removePendingActionByTaskId(taskId, 'complete');
  if (cancelled) {
    return { success: true, cancelledPending: true };
  }

  const result = await markTaskUndone(taskId, taskData);

  if (result.success) {
    processPendingQueue();
    return result;
  }

  // Network error — cache the undo for later sync
  if (isRetriableError(result.error)) {
    addPendingAction({
      type: 'uncomplete',
      taskId,
      taskData,
    });
    return { success: true, cached: true };
  }

  return result;
});

ipcMain.handle('schedule-task-today', async (_event, taskId, taskData) => {
  const now = new Date();
  const dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  // Standalone mode: update local store
  if (config && config.standalone_mode) {
    const task = scheduleStandaloneTaskToday(String(taskId));
    return task ? { success: true, task } : { success: false, error: 'Task not found' };
  }

  const result = await updateTaskDueDate(taskId, taskData, dueDate);

  if (result.success) {
    processPendingQueue();
    return result;
  }

  // Network error — cache for later sync
  if (isRetriableError(result.error)) {
    addPendingAction({
      type: 'schedule-today',
      taskId,
      taskData,
      dueDate,
    });
    return { success: true, cached: true };
  }

  return result;
});

ipcMain.handle('update-task', async (_event, taskId, taskData) => {
  // Standalone mode: update local store
  if (config && config.standalone_mode) {
    const task = updateStandaloneTask(String(taskId), taskData);
    return task ? { success: true, task } : { success: false, error: 'Task not found' };
  }

  const result = await updateTask(taskId, taskData);

  if (result.success) {
    processPendingQueue();
    return result;
  }

  // Network error — cache for later sync
  if (isRetriableError(result.error)) {
    addPendingAction({
      type: 'update-task',
      taskId,
      taskData,
    });
    return { success: true, cached: true };
  }

  return result;
});

ipcMain.handle('remove-task-due-date', async (_event, taskId, taskData) => {
  const nullDate = '0001-01-01T00:00:00Z';

  // Standalone mode: update local store
  if (config && config.standalone_mode) {
    const task = removeStandaloneTaskDueDate(String(taskId));
    return task ? { success: true, task } : { success: false, error: 'Task not found' };
  }

  const result = await updateTaskDueDate(taskId, taskData, nullDate);

  if (result.success) {
    processPendingQueue();
    return result;
  }

  // Network error — cache for later sync
  if (isRetriableError(result.error)) {
    addPendingAction({
      type: 'remove-due-date',
      taskId,
      taskData,
      dueDate: nullDate,
    });
    return { success: true, cached: true };
  }

  return result;
});

// --- Pending Queue IPC ---
ipcMain.handle('get-pending-count', () => {
  return getPendingCount();
});

ipcMain.handle('open-task-in-browser', (_event, taskId) => {
  if (!config || config.standalone_mode) return;
  const url = `${config.vikunja_url}/tasks/${taskId}`;
  if (url.startsWith('https://') || url.startsWith('http://')) {
    shell.openExternal(url);
  }
});

ipcMain.handle('close-viewer', () => {
  hideViewer();
});

ipcMain.handle('set-viewer-height', (_event, height) => {
  if (!viewerWindow || viewerWindow.isDestroyed()) return;
  const clamped = Math.max(60, Math.min(460 + DRAG_HANDLE_HEIGHT, Math.round(height))) + SHADOW_PADDING * 2;
  viewerDesiredHeight = clamped;
  if (!viewerWindow.isVisible()) return;
  const [currentWidth] = viewerWindow.getSize();
  isResettingViewerHeight = true;
  viewerWindow.setSize(currentWidth, clamped);
  isResettingViewerHeight = false;
});

// --- Standalone mode IPC ---
ipcMain.handle('get-standalone-task-count', () => {
  return getAllStandaloneTasks().length;
});

ipcMain.handle('upload-standalone-tasks', async (_event, url, token, projectId) => {
  const tasks = getAllStandaloneTasks();
  if (tasks.length === 0) {
    return { success: true, uploaded: 0 };
  }

  let uploaded = 0;
  const errors = [];

  for (const task of tasks) {
    const result = await createTask(task.title, task.description || null, task.due_date === '0001-01-01T00:00:00Z' ? null : task.due_date, projectId);
    if (result.success) {
      uploaded++;
    } else {
      errors.push(`"${task.title}": ${result.error}`);
      // Stop on auth errors
      if (result.error && isAuthError(result.error)) break;
    }
  }

  if (uploaded > 0) {
    // Clear only successfully uploaded tasks
    if (uploaded === tasks.length) {
      clearStandaloneTasks();
    }
  }

  if (errors.length > 0) {
    return { success: false, uploaded, error: errors[0], totalErrors: errors.length };
  }

  return { success: true, uploaded };
});

// --- App Lifecycle ---
app.on('ready', async () => {
  // Required for Windows toast notifications
  app.setAppUserModelId('com.vikunja-quick-entry.app');

  // Hide dock icon on macOS (no-op on Windows, but good practice)
  if (app.dock) {
    app.dock.hide();
  }

  config = getConfig();

  if (config) {
    nativeTheme.themeSource = config.theme || 'system';
  }

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

  // Prewarm PowerShell URL reader for faster browser detection
  if (process.platform === 'win32') {
    prewarmUrlReader();
  }

  // Initialize notification scheduler (works in both server and standalone modes)
  initNotifications(() => config, showViewer);

  if (!config.standalone_mode) {
    // Start background sync for offline queue (not needed in standalone mode)
    startSyncTimer();
    // Try to flush anything cached from a previous session
    processPendingQueue();
    // Warm the task cache on startup and keep it fresh in the background
    refreshTaskCache();
    // React to connectivity changes (refresh cache on reconnect, pause when offline)
    setupNetworkListeners();
  }
});

app.on('second-instance', () => {
  // If user opens a second instance, show the existing window
  if (config) {
    showWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopSyncTimer();
  stopCacheRefresh();
  stopNotifications();
  shutdownUrlReader();
  if (dragHoverTimer) {
    clearInterval(dragHoverTimer);
    dragHoverTimer = null;
  }
  if (networkPollTimer) {
    clearInterval(networkPollTimer);
    networkPollTimer = null;
  }
});

app.on('window-all-closed', () => {
  // Do not quit — this is a tray app
});
