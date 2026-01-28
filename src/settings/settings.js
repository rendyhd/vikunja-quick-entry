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

// --- Quick View elements ---
const viewerHotkeyDisplay = document.getElementById('viewer-hotkey-display');
const recordViewerHotkeyBtn = document.getElementById('record-viewer-hotkey');
const viewerProjectsList = document.getElementById('viewer-projects-list');
const loadViewerProjectsBtn = document.getElementById('load-viewer-projects');
const viewerProjectStatus = document.getElementById('viewer-project-status');
const viewerSortBy = document.getElementById('viewer-sort-by');
const viewerOrderBy = document.getElementById('viewer-order-by');
const viewerDueDateFilter = document.getElementById('viewer-due-date-filter');

// --- Shared elements ---
const githubLink = document.getElementById('github-link');
const settingsError = document.getElementById('settings-error');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');

let recordingHotkey = false;
let recordingViewerHotkey = false;
let loadedProjects = null; // Cache projects for Quick View tab
let secondaryProjects = []; // [{id, title}, ...]

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

  urlInput.value = config.vikunja_url || '';
  tokenInput.value = config.api_token || '';
  hotkeyDisplay.value = config.hotkey || 'Alt+Shift+V';
  launchStartup.checked = config.launch_on_startup === true;
  exclamationToday.checked = config.exclamation_today !== false;
  autoCheckUpdates.checked = config.auto_check_updates !== false;

  // Quick View settings
  viewerHotkeyDisplay.value = config.viewer_hotkey || 'Alt+Shift+B';

  if (config.viewer_filter) {
    viewerSortBy.value = config.viewer_filter.sort_by || 'due_date';
    viewerOrderBy.value = config.viewer_filter.order_by || 'asc';
    viewerDueDateFilter.value = config.viewer_filter.due_date_filter || 'all';
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

    // Populate viewer projects with preselected IDs
    if (loadedProjects) {
      populateViewerProjects(
        loadedProjects,
        config.viewer_filter ? config.viewer_filter.project_ids : []
      );
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

// --- Viewer project loading ---
function populateViewerProjects(projects, selectedIds) {
  viewerProjectsList.innerHTML = '';
  const selectedSet = new Set((selectedIds || []).map(String));

  for (const project of projects) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = project.id;
    cb.checked = selectedSet.size === 0 || selectedSet.has(String(project.id));
    const span = document.createElement('span');
    span.textContent = project.title;
    label.appendChild(cb);
    label.appendChild(span);
    viewerProjectsList.appendChild(label);
  }
}

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
  populateViewerProjects(result.projects, []);
  viewerProjectStatus.textContent = `${result.projects.length} projects loaded.`;
  viewerProjectStatus.className = 'status-text success';
});

function getSelectedViewerProjectIds() {
  const checkboxes = viewerProjectsList.querySelectorAll('input[type="checkbox"]');
  if (checkboxes.length === 0) return [];

  const selected = [];
  let allChecked = true;
  for (const cb of checkboxes) {
    if (cb.checked) {
      selected.push(Number(cb.value));
    } else {
      allChecked = false;
    }
  }
  // If all are selected, return empty array (means "all projects")
  return allChecked ? [] : selected;
}

// --- Hotkey recording (shared utility) ---
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

// --- Save ---
btnSave.addEventListener('click', async () => {
  hideError();

  const settings = {
    vikunja_url: urlInput.value.trim(),
    api_token: tokenInput.value.trim(),
    default_project_id: projectSelect.value,
    hotkey: hotkeyDisplay.value || 'Alt+Shift+V',
    launch_on_startup: launchStartup.checked,
    exclamation_today: exclamationToday.checked,
    auto_check_updates: autoCheckUpdates.checked,
    viewer_hotkey: viewerHotkeyDisplay.value || 'Alt+Shift+B',
    viewer_filter: {
      project_ids: getSelectedViewerProjectIds(),
      sort_by: viewerSortBy.value,
      order_by: viewerOrderBy.value,
      due_date_filter: viewerDueDateFilter.value,
    },
    secondary_projects: secondaryProjects.map(p => ({ id: p.id, title: p.title })),
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

// --- Init ---
loadExistingConfig();
