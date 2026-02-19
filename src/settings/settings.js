// --- Server tab elements ---
const urlInput = document.getElementById('vikunja-url');
const tokenInput = document.getElementById('api-token');
const toggleTokenBtn = document.getElementById('toggle-token');
const projectSelect = document.getElementById('default-project');
const loadProjectsBtn = document.getElementById('load-projects');
const projectStatus = document.getElementById('project-status');
const launchStartup = document.getElementById('launch-startup');
const autoCheckUpdates = document.getElementById('auto-check-updates');

// --- Quick Entry elements ---
const hotkeyDisplay = document.getElementById('hotkey-display');
const recordHotkeyBtn = document.getElementById('record-hotkey');
const exclamationToday = document.getElementById('exclamation-today');
const secondaryProjectsList = document.getElementById('secondary-projects-list');
const addSecondarySelect = document.getElementById('add-secondary-project');
const addSecondaryBtn = document.getElementById('add-secondary-btn');
const projectCycleModifier = document.getElementById('project-cycle-modifier');
const cycleShortcutHint = document.getElementById('cycle-shortcut-hint');
const cycleShortcutDisplay = document.getElementById('cycle-shortcut-display');

// --- Quick View elements ---
const viewerHotkeyDisplay = document.getElementById('viewer-hotkey-display');
const recordViewerHotkeyBtn = document.getElementById('record-viewer-hotkey');
const viewerProjectsList = document.getElementById('viewer-projects-list');
const loadViewerProjectsBtn = document.getElementById('load-viewer-projects');
const viewerProjectStatus = document.getElementById('viewer-project-status');
const viewerSortBy = document.getElementById('viewer-sort-by');
const viewerOrderBy = document.getElementById('viewer-order-by');
const viewerDueDateFilter = document.getElementById('viewer-due-date-filter');
const viewerIncludeToday = document.getElementById('viewer-include-today');

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

// --- Integration elements ---
const obsidianMode = document.getElementById('obsidian-mode');
const obsidianFields = document.getElementById('obsidian-fields');
const obsidianApiKey = document.getElementById('obsidian-api-key');
const toggleObsidianKeyBtn = document.getElementById('toggle-obsidian-key');
const obsidianVaultName = document.getElementById('obsidian-vault-name');
const obsidianPort = document.getElementById('obsidian-port');
const testObsidianBtn = document.getElementById('test-obsidian-btn');
const obsidianTestStatus = document.getElementById('obsidian-test-status');
const browserLinkMode = document.getElementById('browser-link-mode');
const browserFields = document.getElementById('browser-fields');
const browserExtensionId = document.getElementById('browser-extension-id');
const registerBrowserBtn = document.getElementById('register-browser-btn');
const openExtensionFolderBtn = document.getElementById('open-extension-folder-btn');
const browserRegistrationStatus = document.getElementById('browser-registration-status');

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
const saveStatus = document.getElementById('save-status');

let recordingHotkey = false;
let recordingViewerHotkey = false;
let loadedProjects = null;
let secondaryProjects = [];
let wasStandaloneMode = false;
let saveTimeout = null;
let initializing = true; // Suppress auto-save during initial load

// --- Platform detection: hide platform-specific elements + text overrides ---
const _platform = window.settingsApi.getPlatform();
const _isMac = _platform === 'darwin';

(function hidePlatformElements() {
  if (_isMac) {
    document.querySelectorAll('.platform-windows-only').forEach((el) => {
      el.style.display = 'none';
    });
  }
  if (!_isMac) {
    document.querySelectorAll('.platform-macos-note').forEach((el) => {
      el.style.display = 'none';
    });
  }
})();

// macOS-specific text overrides
if (_isMac) {
  // Browser integration descriptions
  const howItWorks = document.getElementById('browser-how-it-works');
  if (howItWorks) {
    howItWorks.textContent = 'Vikunja Quick Entry reads the URL from the active browser tab using AppleScript when Quick Entry opens. This works with Chrome, Safari, Edge, Brave, Opera, Vivaldi, and Arc. Firefox has limited support.';
  }
  const autoDetect = document.getElementById('browser-auto-detect-note');
  if (autoDetect) {
    autoDetect.textContent = 'No setup needed for Chrome, Safari, Edge, Brave, Vivaldi, and Arc. On first use, macOS will ask you to allow control of the browser. Firefox URL detection is unreliable and may not work.';
  }

  // Obsidian "Ask" option: Ctrl+L → ⌘L
  const obsidianAskOption = obsidianMode.querySelector('option[value="ask"]');
  if (obsidianAskOption) obsidianAskOption.textContent = 'Ask (\u2318L to link)';

  // Browser "Ask" option: Ctrl+L → ⌘L
  const browserAskOption = browserLinkMode.querySelector('option[value="ask"]');
  if (browserAskOption) browserAskOption.textContent = 'Ask (\u2318L to link)';

  // Project cycle modifier dropdown options
  const ctrlOption = projectCycleModifier.querySelector('option[value="ctrl"]');
  if (ctrlOption) ctrlOption.textContent = '\u2318 Cmd + Arrow keys';
  const altOption = projectCycleModifier.querySelector('option[value="alt"]');
  if (altOption) altOption.textContent = '\u2325 Option + Arrow keys';
  const ctrlAltOption = projectCycleModifier.querySelector('option[value="ctrl+alt"]');
  if (ctrlAltOption) ctrlAltOption.textContent = '\u2318\u2325 Cmd+Option + Arrow keys';
}

// --- Auto-save ---
function showSaveStatus(text, type) {
  saveStatus.textContent = text;
  saveStatus.className = 'save-status' + (type ? ` ${type}` : '');
  if (type === 'saved') {
    setTimeout(() => {
      if (saveStatus.textContent === text) {
        saveStatus.textContent = '';
        saveStatus.className = 'save-status';
      }
    }, 2000);
  }
}

async function doAutoSave() {
  if (initializing) return;
  hideError();

  const settings = gatherSettings();
  settings.partial = true; // Tell main process not to require all fields

  showSaveStatus('Saving...', 'saving');

  const result = await window.settingsApi.saveSettings(settings);

  if (result.success) {
    showSaveStatus('Saved', 'saved');
  } else {
    showSaveStatus('', '');
    showError(result.error || 'Failed to save settings.');
  }
}

function scheduleAutoSave(delay = 500) {
  if (initializing) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(doAutoSave, delay);
}

function immediateAutoSave() {
  if (initializing) return;
  clearTimeout(saveTimeout);
  doAutoSave();
}

// Attach auto-save to all form inputs
function setupAutoSave() {
  // Text inputs: debounced save
  const textInputs = document.querySelectorAll(
    'input[type="url"], input[type="password"], input[type="text"], input[type="number"], input[type="time"]'
  );
  textInputs.forEach((input) => {
    // Skip readonly inputs (hotkey displays) — they save after recording
    if (input.readOnly) return;
    input.addEventListener('input', () => scheduleAutoSave());
  });

  // Checkboxes and selects: immediate save
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((cb) => {
    cb.addEventListener('change', () => immediateAutoSave());
  });

  const selects = document.querySelectorAll('select');
  selects.forEach((sel) => {
    // Theme select has its own handler
    if (sel.id === 'theme-select') return;
    sel.addEventListener('change', () => immediateAutoSave());
  });
}

// --- Standalone mode UI toggle ---
function updateStandaloneUI(isStandalone) {
  if (isStandalone) {
    serverSettings.classList.add('hidden');
    // Hide server-dependent settings across all tabs
    document.querySelectorAll('.server-dependent').forEach((el) => el.classList.add('hidden'));
  } else {
    serverSettings.classList.remove('hidden');
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
  uploadDialog.hidden = true;
  wasStandaloneMode = false;
  immediateAutoSave();
});

// --- Theme live preview + auto-save ---
themeSelect.addEventListener('change', () => {
  window.settingsApi.previewTheme(themeSelect.value);
  immediateAutoSave();
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

// --- Integration toggles ---
obsidianMode.addEventListener('change', () => {
  obsidianFields.classList.toggle('hidden', obsidianMode.value === 'off');
});

browserLinkMode.addEventListener('change', () => {
  browserFields.classList.toggle('hidden', browserLinkMode.value === 'off');
});

toggleObsidianKeyBtn.addEventListener('click', () => {
  const isPassword = obsidianApiKey.type === 'password';
  obsidianApiKey.type = isPassword ? 'text' : 'password';
  toggleObsidianKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
});

testObsidianBtn.addEventListener('click', async () => {
  const key = obsidianApiKey.value.trim();
  const port = parseInt(obsidianPort.value, 10) || 27124;
  if (!key) {
    obsidianTestStatus.textContent = 'Enter an API key first.';
    obsidianTestStatus.className = 'status-text error';
    return;
  }
  obsidianTestStatus.textContent = 'Testing...';
  obsidianTestStatus.className = 'status-text';
  testObsidianBtn.disabled = true;

  const result = await window.settingsApi.testObsidianConnection(key, port);
  testObsidianBtn.disabled = false;

  if (result.reachable) {
    const note = result.noteName ? ` (active: ${result.noteName})` : '';
    obsidianTestStatus.textContent = `Connected${note}`;
    obsidianTestStatus.className = 'status-text success';
  } else {
    obsidianTestStatus.textContent = 'Could not connect. Check API key, port, and that Obsidian is running.';
    obsidianTestStatus.className = 'status-text error';
  }
});

registerBrowserBtn.addEventListener('click', async () => {
  const extId = browserExtensionId.value.trim();
  browserRegistrationStatus.textContent = 'Registering...';
  browserRegistrationStatus.className = 'status-text';
  registerBrowserBtn.disabled = true;

  const result = await window.settingsApi.registerBrowserHosts(extId);
  registerBrowserBtn.disabled = false;

  const parts = [];
  if (result.chrome) parts.push('Chrome');
  if (result.firefox) parts.push('Firefox');
  if (parts.length > 0) {
    browserRegistrationStatus.textContent = `Registered: ${parts.join(', ')}`;
    browserRegistrationStatus.className = 'status-text success';
  } else {
    browserRegistrationStatus.textContent = 'Registration failed. Check console for details.';
    browserRegistrationStatus.className = 'status-text error';
  }
});

openExtensionFolderBtn.addEventListener('click', () => {
  window.settingsApi.openBrowserExtensionFolder();
});

async function checkBrowserRegistration() {
  const status = await window.settingsApi.checkBrowserHostRegistration();
  const parts = [];
  if (status.chrome) parts.push('Chrome');
  if (status.firefox) parts.push('Firefox');
  if (parts.length > 0) {
    browserRegistrationStatus.textContent = `Registered: ${parts.join(', ')}`;
    browserRegistrationStatus.className = 'status-text success';
  }
}

// --- Load existing config ---
async function loadExistingConfig() {
  const config = await window.settingsApi.getFullConfig();
  if (!config) {
    initializing = false;
    return;
  }

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
    viewerSortBy.value = config.viewer_filter.sort_by || 'due_date';
    viewerOrderBy.value = config.viewer_filter.order_by || 'asc';
    viewerDueDateFilter.value = config.viewer_filter.due_date_filter || 'all';
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

  // Integration settings
  obsidianMode.value = config.obsidian_mode || 'off';
  obsidianFields.classList.toggle('hidden', obsidianMode.value === 'off');
  obsidianApiKey.value = config.obsidian_api_key || '';
  obsidianVaultName.value = config.obsidian_vault_name || '';
  obsidianPort.value = config.obsidian_port || 27124;
  browserLinkMode.value = config.browser_link_mode || 'off';
  browserFields.classList.toggle('hidden', browserLinkMode.value === 'off');
  browserExtensionId.value = config.browser_extension_id || '';

  // Check browser registration status
  if (browserLinkMode.value !== 'off') {
    checkBrowserRegistration();
  }

  // If we have URL and token, auto-load projects
  if (config.vikunja_url && config.api_token) {
    await loadProjects(config.default_project_id);

    // Load secondary projects
    if (config.secondary_projects && config.secondary_projects.length > 0) {
      secondaryProjects = config.secondary_projects.map(p => ({ id: p.id, title: p.title }));
      renderSecondaryProjects();
      refreshAddSecondaryDropdown();
    }

    // Populate viewer projects list with preselected IDs
    if (loadedProjects) {
      const selectedIds = config.viewer_filter ? config.viewer_filter.project_ids : [];
      populateViewerProjectsList(loadedProjects, selectedIds);
    }
  }

  // Done loading — enable auto-save
  initializing = false;
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
        immediateAutoSave();
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
        immediateAutoSave();
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
      immediateAutoSave();
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
  immediateAutoSave();
});

projectSelect.addEventListener('change', () => {
  const defaultId = String(projectSelect.value);
  secondaryProjects = secondaryProjects.filter(p => String(p.id) !== defaultId);
  renderSecondaryProjects();
  refreshAddSecondaryDropdown();
  immediateAutoSave();
});

function setProjectStatus(msg, type) {
  projectStatus.textContent = msg;
  projectStatus.className = 'status-text' + (type ? ` ${type}` : '');
}

// --- Viewer project multi-select ---
function populateViewerProjectsList(projects, selectedIds) {
  viewerProjectsList.innerHTML = '';
  const selectedSet = new Set((selectedIds || []).map(String));

  for (const project of projects) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = project.id;
    cb.checked = selectedSet.has(String(project.id));
    cb.addEventListener('change', () => immediateAutoSave());

    const span = document.createElement('span');
    span.textContent = project.title;

    label.appendChild(cb);
    label.appendChild(span);
    viewerProjectsList.appendChild(label);
  }
}

function getSelectedViewerProjectIds() {
  const ids = [];
  viewerProjectsList.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
    ids.push(Number(cb.value));
  });
  return ids;
}

loadViewerProjectsBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!url || !token) {
    viewerProjectStatus.textContent = 'Enter URL and API token in Server tab first.';
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
  populateViewerProjectsList(result.projects, []);
  viewerProjectStatus.textContent = `${result.projects.length} projects loaded.`;
  viewerProjectStatus.className = 'status-text success';
});

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
  immediateAutoSave();
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
  immediateAutoSave();
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
      sort_by: viewerSortBy.value || 'due_date',
      order_by: viewerOrderBy.value || 'asc',
      due_date_filter: viewerDueDateFilter.value || 'all',
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
    // Integration settings
    obsidian_mode: obsidianMode.value || 'off',
    obsidian_api_key: obsidianApiKey.value.trim(),
    obsidian_port: parseInt(obsidianPort.value, 10) || 27124,
    obsidian_vault_name: obsidianVaultName.value.trim(),
    browser_link_mode: browserLinkMode.value || 'off',
    browser_extension_id: browserExtensionId.value.trim(),
    ...overrides,
  };
  return settings;
}

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
  const displayMap = _isMac
    ? { 'ctrl': '\u2318 Cmd', 'alt': '\u2325 Option', 'ctrl+alt': '\u2318\u2325 Cmd+Option' }
    : { 'ctrl': 'Ctrl', 'alt': 'Alt', 'ctrl+alt': 'Ctrl+Alt' };
  const display = displayMap[modifier] || (_isMac ? '\u2318 Cmd' : 'Ctrl');
  cycleShortcutHint.textContent = display;
  const arrowDisplay = _isMac ? `${display}+\u2190/\u2192` : `${display}+Left/Right`;
  cycleShortcutDisplay.textContent = arrowDisplay;
}

projectCycleModifier.addEventListener('change', () => {
  updateCycleShortcutDisplay(projectCycleModifier.value);
});

// --- Init ---
loadExistingConfig().then(() => {
  setupAutoSave();
});
