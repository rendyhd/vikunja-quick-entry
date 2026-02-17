// --- Quick Entry elements ---
const urlInput = document.getElementById('vikunja-url');
const tokenInput = document.getElementById('api-token');
const toggleTokenBtn = document.getElementById('toggle-token');
const projectSelect = document.getElementById('default-project');
const loadProjectsBtn = document.getElementById('load-projects');
const projectStatus = document.getElementById('project-status');
const hotkeyDisplay = document.getElementById('hotkey-display');
const recordHotkeyBtn = document.getElementById('record-hotkey');
const launchStartup = document.getElementById('launch-startup');
const exclamationToday = document.getElementById('exclamation-today');
const autoCheckUpdates = document.getElementById('auto-check-updates');
const secondaryProjectsList = document.getElementById('secondary-projects-list');
const addSecondarySelect = document.getElementById('add-secondary-project');
const addSecondaryBtn = document.getElementById('add-secondary-btn');
const projectCycleModifier = document.getElementById('project-cycle-modifier');
const cycleShortcutHint = document.getElementById('cycle-shortcut-hint');
const cycleShortcutDisplay = document.getElementById('cycle-shortcut-display');

// --- Quick View elements ---
const viewerHotkeyDisplay = document.getElementById('viewer-hotkey-display');
const recordViewerHotkeyBtn = document.getElementById('record-viewer-hotkey');
const viewerListSelect = document.getElementById('viewer-list-select');
const loadViewerProjectsBtn = document.getElementById('load-viewer-projects');
const viewerProjectStatus = document.getElementById('viewer-project-status');
const viewerIncludeToday = document.getElementById('viewer-include-today');
const viewerIncludeTodayGroup = document.getElementById('viewer-include-today-group');

// --- Notification elements ---
const notificationsEnabled = document.getElementById('notifications-enabled');
const notificationOptions = document.getElementById('notification-options');
const notifDailyEnabled = document.getElementById('notifications-daily-enabled');
const notifDailyTime = document.getElementById('notifications-daily-time');
const notifSecondaryEnabled = document.getElementById('notifications-secondary-enabled');
const notifSecondaryTime = document.getElementById('notifications-secondary-time');
const notifOverdue = document.getElementById('notifications-overdue');
const notifDueToday = document.getElementById('notifications-due-today');
const notifUpcoming = document.getElementById('notifications-upcoming');
const notifPersistent = document.getElementById('notifications-persistent');
const notifSound = document.getElementById('notifications-sound');
const testNotificationBtn = document.getElementById('test-notification-btn');

// --- Standalone mode elements ---
const standaloneMode = document.getElementById('standalone-mode');
const serverSettings = document.getElementById('server-settings');
const tabBar = document.querySelector('.tab-bar');
const uploadDialog = document.getElementById('upload-dialog');
const uploadDialogMessage = document.getElementById('upload-dialog-message');
const uploadYesBtn = document.getElementById('upload-yes');
const uploadNoBtn = document.getElementById('upload-no');
const uploadStatus = document.getElementById('upload-status');

// --- Theme element ---
const themeSelect = document.getElementById('theme-select');

// --- Shared elements ---
const githubLink = document.getElementById('github-link');
const settingsError = document.getElementById('settings-error');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');

let recordingHotkey = false;
let recordingViewerHotkey = false;
let loadedProjects = null; // Cache projects for Quick View tab
let secondaryProjects = []; // [{id, title}, ...]
let wasStandaloneMode = false; // Track if standalone was enabled when settings loaded

// --- Standalone mode UI toggle ---
function updateStandaloneUI(isStandalone) {
  if (isStandalone) {
    serverSettings.classList.add('hidden');
    tabBar.classList.add('hidden');
    // Hide both tabs, show only Quick Entry stripped content
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    document.getElementById('tab-quick-entry').classList.add('active');
    // Hide server-dependent settings
    document.querySelectorAll('.server-dependent').forEach((el) => el.classList.add('hidden'));
  } else {
    serverSettings.classList.remove('hidden');
    tabBar.classList.remove('hidden');
    document.querySelectorAll('.server-dependent').forEach((el) => el.classList.remove('hidden'));
  }
  // Hide upload dialog when toggling
  uploadDialog.hidden = true;
}

standaloneMode.addEventListener('change', async () => {
  const isStandalone = standaloneMode.checked;
  updateStandaloneUI(isStandalone);

  // If turning OFF standalone mode, check for tasks to upload
  if (!isStandalone && wasStandaloneMode) {
    const taskCount = await window.settingsApi.getStandaloneTaskCount();
    if (taskCount > 0) {
      uploadDialogMessage.textContent = `You have ${taskCount} task(s) created in standalone mode. Would you like to upload them to the default Vikunja project?`;
      uploadDialog.hidden = false;
      uploadStatus.textContent = '';
    }
  }
});

uploadYesBtn.addEventListener('click', async () => {
  hideError();
  const settings = gatherSettings({ standalone_mode: false });

  if (!settings.vikunja_url || !settings.api_token || !settings.default_project_id) {
    showError('Configure server settings before uploading tasks.');
    return;
  }

  uploadStatus.textContent = 'Uploading tasks...';
  uploadStatus.className = 'status-text';
  uploadYesBtn.disabled = true;
  uploadNoBtn.disabled = true;

  const saveResult = await window.settingsApi.saveSettings(settings);
  if (!saveResult.success) {
    showError(saveResult.error || 'Failed to save settings.');
    uploadYesBtn.disabled = false;
    uploadNoBtn.disabled = false;
    uploadStatus.textContent = '';
    return;
  }

  const uploadResult = await window.settingsApi.uploadStandaloneTasks(
    settings.vikunja_url,
    settings.api_token,
    Number(settings.default_project_id),
  );

  uploadYesBtn.disabled = false;
  uploadNoBtn.disabled = false;

  if (uploadResult.success) {
    uploadStatus.textContent = `${uploadResult.uploaded} task(s) uploaded.`;
    uploadStatus.className = 'status-text success';
    wasStandaloneMode = false;
    setTimeout(() => window.close(), 1000);
  } else {
    const msg = uploadResult.uploaded > 0
      ? `${uploadResult.uploaded} uploaded, but some failed: ${uploadResult.error}`
      : uploadResult.error;
    uploadStatus.textContent = msg;
    uploadStatus.className = 'status-text error';
  }
});

uploadNoBtn.addEventListener('click', async () => {
  hideError();
  const settings = gatherSettings({ standalone_mode: false });

  if (!settings.vikunja_url || !settings.api_token || !settings.default_project_id) {
    showError('Configure server settings before saving.');
    return;
  }

  btnSave.disabled = true;
  uploadDialog.hidden = true;

  const saveResult = await window.settingsApi.saveSettings(settings);

  btnSave.disabled = false;

  if (saveResult.success) {
    wasStandaloneMode = false;
    window.close();
  } else {
    showError(saveResult.error || 'Failed to save settings.');
  }
});

// --- Theme live preview ---
themeSelect.addEventListener('change', () => {
  window.settingsApi.previewTheme(themeSelect.value);
});

// --- Notification master toggle ---
notificationsEnabled.addEventListener('change', () => {
  notificationOptions.disabled = !notificationsEnabled.checked;
});

// --- Test notification ---
testNotificationBtn.addEventListener('click', () => {
  window.settingsApi.testNotification();
});

// --- Tab switching ---
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;

    tabBtns.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// --- Load existing config ---
async function loadExistingConfig() {
  const config = await window.settingsApi.getFullConfig();
  if (!config) return;

  // Standalone mode
  standaloneMode.checked = config.standalone_mode === true;
  wasStandaloneMode = config.standalone_mode === true;
  updateStandaloneUI(config.standalone_mode === true);

  urlInput.value = config.vikunja_url || '';
  tokenInput.value = config.api_token || '';
  hotkeyDisplay.value = config.hotkey || 'Alt+Shift+V';
  launchStartup.checked = config.launch_on_startup === true;
  exclamationToday.checked = config.exclamation_today !== false;
  autoCheckUpdates.checked = config.auto_check_updates !== false;

  // Project cycle modifier
  projectCycleModifier.value = config.project_cycle_modifier || 'ctrl';
  updateCycleShortcutDisplay(projectCycleModifier.value);

  // Theme
  themeSelect.value = config.theme || 'system';

  // Quick View settings
  viewerHotkeyDisplay.value = config.viewer_hotkey || 'Alt+Shift+B';

  if (config.viewer_filter) {
    viewerIncludeToday.checked = config.viewer_filter.include_today_all_projects === true;
  }

  // Notification settings
  notificationsEnabled.checked = config.notifications_enabled === true;
  notificationOptions.disabled = !notificationsEnabled.checked;
  notifDailyEnabled.checked = config.notifications_daily_reminder_enabled !== false;
  notifDailyTime.value = config.notifications_daily_reminder_time || '08:00';
  notifSecondaryEnabled.checked = config.notifications_secondary_reminder_enabled === true;
  notifSecondaryTime.value = config.notifications_secondary_reminder_time || '16:00';
  notifOverdue.checked = config.notifications_overdue_enabled !== false;
  notifDueToday.checked = config.notifications_due_today_enabled !== false;
  notifUpcoming.checked = config.notifications_upcoming_enabled === true;
  notifPersistent.checked = config.notifications_persistent === true;
  notifSound.checked = config.notifications_sound !== false;

  // If we have URL and token, auto-load projects
  if (config.vikunja_url && config.api_token) {
    await loadProjects(config.default_project_id);

    // Load secondary projects
    if (config.secondary_projects && config.secondary_projects.length > 0) {
      secondaryProjects = config.secondary_projects.map(p => ({ id: p.id, title: p.title }));
      renderSecondaryProjects();
      refreshAddSecondaryDropdown();
    }

    // Populate viewer list dropdown with preselected project
    if (loadedProjects) {
      const selectedIds = config.viewer_filter ? config.viewer_filter.project_ids : [];
      const selectedId = selectedIds.length === 1 ? selectedIds[0] : 0;
      populateViewerListSelect(loadedProjects, selectedId);
    }
  }
}

// --- Token toggle ---
toggleTokenBtn.addEventListener('click', () => {
  const isPassword = tokenInput.type === 'password';
  tokenInput.type = isPassword ? 'text' : 'password';
  toggleTokenBtn.textContent = isPassword ? 'Hide' : 'Show';
});

// --- Load projects ---
async function loadProjects(preselectId) {
  const url = urlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!url || !token) {
    setProjectStatus('Enter URL and API token first.', 'error');
    return;
  }

  setProjectStatus('Loading projects...', '');
  loadProjectsBtn.disabled = true;

  const result = await window.settingsApi.fetchProjects(url, token);

  loadProjectsBtn.disabled = false;

  if (!result.success) {
    setProjectStatus(result.error || 'Failed to load projects.', 'error');
    return;
  }

  if (!result.projects || result.projects.length === 0) {
    setProjectStatus('No projects found.', 'error');
    return;
  }

  loadedProjects = result.projects;

  // Populate dropdown
  projectSelect.innerHTML = '';
  for (const project of result.projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.title;
    projectSelect.appendChild(opt);
  }
  projectSelect.disabled = false;

  // Pre-select saved project
  if (preselectId) {
    const target = String(preselectId);
    for (const opt of projectSelect.options) {
      if (opt.value === target) {
        opt.selected = true;
        break;
      }
    }
  }

  setProjectStatus(`${result.projects.length} projects loaded.`, 'success');
  refreshAddSecondaryDropdown();
}

loadProjectsBtn.addEventListener('click', () => loadProjects());

// --- Secondary Projects ---
function renderSecondaryProjects() {
  secondaryProjectsList.innerHTML = '';
  secondaryProjects.forEach((project, index) => {
    const item = document.createElement('div');
    item.className = 'reorder-item';

    const title = document.createElement('span');
    title.className = 'reorder-item-title';
    title.textContent = project.title;

    const actions = document.createElement('div');
    actions.className = 'reorder-item-actions';

    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.className = 'reorder-btn';
      upBtn.textContent = '\u2191';
      upBtn.title = 'Move up';
      upBtn.type = 'button';
      upBtn.addEventListener('click', () => {
        [secondaryProjects[index - 1], secondaryProjects[index]] =
          [secondaryProjects[index], secondaryProjects[index - 1]];
        renderSecondaryProjects();
      });
      actions.appendChild(upBtn);
    }

    if (index < secondaryProjects.length - 1) {
      const downBtn = document.createElement('button');
      downBtn.className = 'reorder-btn';
      downBtn.textContent = '\u2193';
      downBtn.title = 'Move down';
      downBtn.type = 'button';
      downBtn.addEventListener('click', () => {
        [secondaryProjects[index], secondaryProjects[index + 1]] =
          [secondaryProjects[index + 1], secondaryProjects[index]];
        renderSecondaryProjects();
      });
      actions.appendChild(downBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'reorder-btn remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.title = 'Remove';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => {
      secondaryProjects.splice(index, 1);
      renderSecondaryProjects();
      refreshAddSecondaryDropdown();
    });
    actions.appendChild(removeBtn);

    item.appendChild(title);
    item.appendChild(actions);
    secondaryProjectsList.appendChild(item);
  });
}

function refreshAddSecondaryDropdown() {
  if (!loadedProjects) {
    addSecondarySelect.disabled = true;
    addSecondaryBtn.disabled = true;
    return;
  }

  const defaultId = String(projectSelect.value);
  const usedIds = new Set(secondaryProjects.map(p => String(p.id)));
  usedIds.add(defaultId);

  addSecondarySelect.innerHTML = '<option value="">Select a project to add...</option>';

  let hasOptions = false;
  for (const project of loadedProjects) {
    if (!usedIds.has(String(project.id))) {
      const opt = document.createElement('option');
      opt.value = project.id;
      opt.textContent = project.title;
      addSecondarySelect.appendChild(opt);
      hasOptions = true;
    }
  }

  addSecondarySelect.disabled = !hasOptions;
  addSecondaryBtn.disabled = !hasOptions;
}

addSecondaryBtn.addEventListener('click', () => {
  const selectedId = addSecondarySelect.value;
  if (!selectedId) return;

  const project = loadedProjects.find(p => String(p.id) === selectedId);
  if (!project) return;

  secondaryProjects.push({ id: project.id, title: project.title });
  renderSecondaryProjects();
  refreshAddSecondaryDropdown();
});

projectSelect.addEventListener('change', () => {
  const defaultId = String(projectSelect.value);
  secondaryProjects = secondaryProjects.filter(p => String(p.id) !== defaultId);
  renderSecondaryProjects();
  refreshAddSecondaryDropdown();
});

function setProjectStatus(msg, type) {
  projectStatus.textContent = msg;
  projectStatus.className = 'status-text' + (type ? ` ${type}` : '');
}

// --- Viewer list select ---
function populateViewerListSelect(projects, selectedId) {
  viewerListSelect.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = '0';
  allOpt.textContent = 'All Projects';
  viewerListSelect.appendChild(allOpt);

  for (const project of projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.title;
    viewerListSelect.appendChild(opt);
  }

  viewerListSelect.disabled = false;
  viewerListSelect.value = selectedId ? String(selectedId) : '0';
  updateIncludeTodayVisibility();
}

function updateIncludeTodayVisibility() {
  const isSpecificProject = viewerListSelect.value && viewerListSelect.value !== '0';
  viewerIncludeTodayGroup.hidden = !isSpecificProject;
  if (!isSpecificProject) {
    viewerIncludeToday.checked = false;
  }
}

viewerListSelect.addEventListener('change', updateIncludeTodayVisibility);

loadViewerProjectsBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!url || !token) {
    viewerProjectStatus.textContent = 'Enter URL and API token first.';
    viewerProjectStatus.className = 'status-text error';
    return;
  }

  viewerProjectStatus.textContent = 'Loading projects...';
  viewerProjectStatus.className = 'status-text';
  loadViewerProjectsBtn.disabled = true;

  const result = await window.settingsApi.fetchProjects(url, token);
  loadViewerProjectsBtn.disabled = false;

  if (!result.success) {
    viewerProjectStatus.textContent = result.error || 'Failed to load projects.';
    viewerProjectStatus.className = 'status-text error';
    return;
  }

  if (!result.projects || result.projects.length === 0) {
    viewerProjectStatus.textContent = 'No projects found.';
    viewerProjectStatus.className = 'status-text error';
    return;
  }

  loadedProjects = result.projects;
  populateViewerListSelect(result.projects, 0);
  viewerProjectStatus.textContent = `${result.projects.length} projects loaded.`;
  viewerProjectStatus.className = 'status-text success';
});

function getSelectedViewerProjectIds() {
  const val = viewerListSelect.value;
  if (!val || val === '0') return [];
  return [Number(val)];
}

// --- Hotkey recording (shared utility) ---

/**
 * Maps KeyboardEvent.code to Electron accelerator key name.
 * Uses e.code (physical key) instead of e.key (character) to avoid
 * macOS character composition issues with Alt/Option key.
 */
function codeToAcceleratorKey(code) {
  // Letters: "KeyA" -> "A"
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }

  // Numbers: "Digit0" -> "0"
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }

  // Function keys: "F1" -> "F1" (no change)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code;
  }

  // Arrow keys: "ArrowUp" -> "Up"
  if (code.startsWith('Arrow')) {
    return code.slice(5);
  }

  // Numpad numbers: "Numpad0" -> "num0"
  if (code.startsWith('Numpad') && code.length === 7 && /\d$/.test(code)) {
    return 'num' + code.slice(6);
  }

  // Numpad operators
  const numpadMap = {
    'NumpadAdd': 'numadd',
    'NumpadSubtract': 'numsub',
    'NumpadMultiply': 'nummult',
    'NumpadDivide': 'numdiv',
    'NumpadDecimal': 'numdec',
    'NumpadEnter': 'Enter',
  };
  if (numpadMap[code]) return numpadMap[code];

  // Special keys (no transformation)
  const directMap = {
    'Space': 'Space',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Escape': 'Escape',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Insert': 'Insert',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
  };
  if (directMap[code]) return directMap[code];

  // Punctuation keys
  const punctuationMap = {
    'Minus': '-',
    'Equal': '=',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Backslash': '\\',
    'Semicolon': ';',
    'Quote': "'",
    'Backquote': '`',
    'Comma': ',',
    'Period': '.',
    'Slash': '/',
  };
  if (punctuationMap[code]) return punctuationMap[code];

  // Unknown key
  return null;
}

function keyEventToAccelerator(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Ignore modifier-only presses (check physical key codes)
  const modifierCodes = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
                         'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'];
  if (modifierCodes.includes(e.code)) return null;

  // Require at least one modifier
  if (parts.length === 0) return null;

  // Convert physical key code to accelerator key name
  const key = codeToAcceleratorKey(e.code);
  if (!key) return null;

  parts.push(key);
  return parts.join('+');
}

// --- Quick Entry hotkey recording ---
recordHotkeyBtn.addEventListener('click', () => {
  if (recordingHotkey) return;
  recordingHotkey = true;
  recordHotkeyBtn.textContent = 'Press keys...';
  hotkeyDisplay.value = '';
  hotkeyDisplay.focus();
});

hotkeyDisplay.addEventListener('keydown', (e) => {
  if (!recordingHotkey) return;
  e.preventDefault();

  const accelerator = keyEventToAccelerator(e);
  if (!accelerator) return;

  hotkeyDisplay.value = accelerator;
  recordingHotkey = false;
  recordHotkeyBtn.textContent = 'Record';
});

hotkeyDisplay.addEventListener('blur', () => {
  if (recordingHotkey) {
    recordingHotkey = false;
    recordHotkeyBtn.textContent = 'Record';
    if (!hotkeyDisplay.value) {
      hotkeyDisplay.value = 'Alt+Shift+V';
    }
  }
});

// --- Viewer hotkey recording ---
recordViewerHotkeyBtn.addEventListener('click', () => {
  if (recordingViewerHotkey) return;
  recordingViewerHotkey = true;
  recordViewerHotkeyBtn.textContent = 'Press keys...';
  viewerHotkeyDisplay.value = '';
  viewerHotkeyDisplay.focus();
});

viewerHotkeyDisplay.addEventListener('keydown', (e) => {
  if (!recordingViewerHotkey) return;
  e.preventDefault();

  const accelerator = keyEventToAccelerator(e);
  if (!accelerator) return;

  viewerHotkeyDisplay.value = accelerator;
  recordingViewerHotkey = false;
  recordViewerHotkeyBtn.textContent = 'Record';
});

viewerHotkeyDisplay.addEventListener('blur', () => {
  if (recordingViewerHotkey) {
    recordingViewerHotkey = false;
    recordViewerHotkeyBtn.textContent = 'Record';
    if (!viewerHotkeyDisplay.value) {
      viewerHotkeyDisplay.value = 'Alt+Shift+B';
    }
  }
});

// --- Gather settings helper ---
function gatherSettings(overrides = {}) {
  const settings = {
    standalone_mode: standaloneMode.checked,
    vikunja_url: urlInput.value.trim(),
    api_token: tokenInput.value.trim(),
    default_project_id: projectSelect.value,
    hotkey: hotkeyDisplay.value || 'Alt+Shift+V',
    launch_on_startup: launchStartup.checked,
    exclamation_today: exclamationToday.checked,
    auto_check_updates: autoCheckUpdates.checked,
    project_cycle_modifier: projectCycleModifier.value || 'ctrl',
    viewer_hotkey: viewerHotkeyDisplay.value || 'Alt+Shift+B',
    theme: themeSelect.value || 'system',
    viewer_filter: {
      project_ids: getSelectedViewerProjectIds(),
      sort_by: 'due_date',
      order_by: 'asc',
      due_date_filter: 'all',
      include_today_all_projects: viewerIncludeToday.checked,
    },
    secondary_projects: secondaryProjects.map(p => ({ id: p.id, title: p.title })),
    // Notification settings
    notifications_enabled: notificationsEnabled.checked,
    notifications_persistent: notifPersistent.checked,
    notifications_daily_reminder_enabled: notifDailyEnabled.checked,
    notifications_daily_reminder_time: notifDailyTime.value || '08:00',
    notifications_secondary_reminder_enabled: notifSecondaryEnabled.checked,
    notifications_secondary_reminder_time: notifSecondaryTime.value || '16:00',
    notifications_overdue_enabled: notifOverdue.checked,
    notifications_due_today_enabled: notifDueToday.checked,
    notifications_upcoming_enabled: notifUpcoming.checked,
    notifications_sound: notifSound.checked,
    ...overrides,
  };
  return settings;
}

// --- Save ---
btnSave.addEventListener('click', async () => {
  hideError();

  const isStandalone = standaloneMode.checked;

  const settings = gatherSettings();

  // Validation: only require server fields when not in standalone mode
  if (!isStandalone) {
    if (!settings.vikunja_url) {
      showError('Vikunja URL is required.');
      urlInput.focus();
      return;
    }

    if (!settings.api_token) {
      showError('API token is required.');
      tokenInput.focus();
      return;
    }

    if (!settings.default_project_id) {
      showError('Please select a default project. Click "Load Projects" first.');
      return;
    }
  }

  // If upload dialog is showing, hide it — the dialog buttons handle upload/discard independently
  if (!uploadDialog.hidden) {
    uploadDialog.hidden = true;
  }

  btnSave.disabled = true;
  btnSave.textContent = 'Saving...';

  const result = await window.settingsApi.saveSettings(settings);

  btnSave.disabled = false;
  btnSave.textContent = 'Save';

  if (result.success) {
    wasStandaloneMode = isStandalone;
    window.close();
  } else {
    showError(result.error || 'Failed to save settings.');
  }
});

// --- Cancel ---
btnCancel.addEventListener('click', () => {
  window.close();
});

// --- GitHub link ---
githubLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.settingsApi.openExternal('https://github.com/rendyhd/vikunja-quick-entry');
});

// --- Error helpers ---
function showError(msg) {
  settingsError.textContent = msg;
  settingsError.hidden = false;
}

function hideError() {
  settingsError.textContent = '';
  settingsError.hidden = true;
}

// --- Project cycle modifier ---
function updateCycleShortcutDisplay(modifier) {
  const displayMap = {
    'ctrl': 'Ctrl',
    'alt': 'Alt',
    'ctrl+alt': 'Ctrl+Alt',
  };
  const display = displayMap[modifier] || 'Ctrl';
  cycleShortcutHint.textContent = display;
  cycleShortcutDisplay.textContent = `${display}+Left/Right`;
}

projectCycleModifier.addEventListener('change', () => {
  updateCycleShortcutDisplay(projectCycleModifier.value);
});

// --- Init ---
loadExistingConfig();
