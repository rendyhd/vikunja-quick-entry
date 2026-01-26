const urlInput = document.getElementById('vikunja-url');
const tokenInput = document.getElementById('api-token');
const toggleTokenBtn = document.getElementById('toggle-token');
const projectSelect = document.getElementById('default-project');
const loadProjectsBtn = document.getElementById('load-projects');
const projectStatus = document.getElementById('project-status');
const hotkeyDisplay = document.getElementById('hotkey-display');
const recordHotkeyBtn = document.getElementById('record-hotkey');
const launchStartup = document.getElementById('launch-startup');
const settingsError = document.getElementById('settings-error');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');

let recordingHotkey = false;

// --- Load existing config ---
async function loadExistingConfig() {
  const config = await window.settingsApi.getFullConfig();
  if (!config) return;

  urlInput.value = config.vikunja_url || '';
  tokenInput.value = config.api_token || '';
  hotkeyDisplay.value = config.hotkey || 'Alt+Shift+V';
  launchStartup.checked = config.launch_on_startup === true;

  // If we have URL and token, auto-load projects
  if (config.vikunja_url && config.api_token) {
    await loadProjects(config.default_project_id);
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
}

loadProjectsBtn.addEventListener('click', () => loadProjects());

function setProjectStatus(msg, type) {
  projectStatus.textContent = msg;
  projectStatus.className = 'status-text' + (type ? ` ${type}` : '');
}

// --- Hotkey recording ---
function keyEventToAccelerator(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Ignore modifier-only presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;

  // Require at least one modifier
  if (parts.length === 0) return null;

  let key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(key);
  return parts.join('+');
}

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
  if (!accelerator) return; // still waiting for non-modifier key

  hotkeyDisplay.value = accelerator;
  recordingHotkey = false;
  recordHotkeyBtn.textContent = 'Record';
});

// Cancel recording on blur
hotkeyDisplay.addEventListener('blur', () => {
  if (recordingHotkey) {
    recordingHotkey = false;
    recordHotkeyBtn.textContent = 'Record';
    if (!hotkeyDisplay.value) {
      hotkeyDisplay.value = 'Alt+Shift+V';
    }
  }
});

// --- Save ---
btnSave.addEventListener('click', async () => {
  hideError();

  const settings = {
    vikunja_url: urlInput.value.trim(),
    api_token: tokenInput.value.trim(),
    default_project_id: projectSelect.value,
    hotkey: hotkeyDisplay.value || 'Alt+Shift+V',
    launch_on_startup: launchStartup.checked,
  };

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

  btnSave.disabled = true;
  btnSave.textContent = 'Saving...';

  const result = await window.settingsApi.saveSettings(settings);

  btnSave.disabled = false;
  btnSave.textContent = 'Save';

  if (result.success) {
    window.close();
  } else {
    showError(result.error || 'Failed to save settings.');
  }
});

// --- Cancel ---
btnCancel.addEventListener('click', () => {
  window.close();
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

// --- Init ---
loadExistingConfig();
