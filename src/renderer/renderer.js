const input = document.getElementById('task-input');
const descriptionHint = document.getElementById('description-hint');
const descriptionInput = document.getElementById('description-input');
const container = document.getElementById('container');
const errorMessage = document.getElementById('error-message');
const todayHintInline = document.getElementById('today-hint-inline');
const todayHintBelow = document.getElementById('today-hint-below');
const projectHint = document.getElementById('project-hint');
const projectName = document.getElementById('project-name');
const pendingIndicator = document.getElementById('pending-indicator');
const pendingCount = document.getElementById('pending-count');
const dragHandle = document.querySelector('.drag-handle');
const obsidianHint = document.getElementById('obsidian-hint');
const obsidianHintName = document.getElementById('obsidian-hint-name');
const obsidianBadge = document.getElementById('obsidian-badge');
const obsidianBadgeName = document.getElementById('obsidian-badge-name');
const obsidianBadgeRemove = document.getElementById('obsidian-badge-remove');
const browserHint = document.getElementById('browser-hint');
const browserHintTitle = document.getElementById('browser-hint-title');
const browserBadge = document.getElementById('browser-badge');
const browserBadgeTitle = document.getElementById('browser-badge-title');
const browserBadgeRemove = document.getElementById('browser-badge-remove');

let errorTimeout = null;
let exclamationTodayEnabled = true;
let projectCycle = [];      // [{id, title}, ...] — default at index 0
let currentProjectIndex = 0;
let projectCycleModifier = 'ctrl'; // 'ctrl', 'alt', or 'ctrl+alt'
let obsidianContext = null;  // { deepLink, noteName, vaultName, mode }
let obsidianLinked = false;
let browserContext = null;   // { url, title, displayTitle, mode }
let browserLinked = false;

function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.hidden = false;

  // Force reflow then add class for transition
  void errorMessage.offsetHeight;
  errorMessage.classList.add('show');

  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    errorMessage.classList.remove('show');
    setTimeout(() => {
      errorMessage.hidden = true;
    }, 200);
  }, 3000);
}

function showOfflineMessage() {
  errorMessage.textContent = 'Saved offline \u2014 will sync when connected';
  errorMessage.hidden = false;
  errorMessage.classList.add('offline');

  void errorMessage.offsetHeight;
  errorMessage.classList.add('show');

  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    errorMessage.classList.remove('show');
    setTimeout(() => {
      errorMessage.hidden = true;
      errorMessage.classList.remove('offline');
      window.api.closeWindow();
    }, 200);
  }, 1200);
}

function clearError() {
  clearTimeout(errorTimeout);
  errorMessage.classList.remove('show', 'offline');
  errorMessage.hidden = true;
}

function collapseDescription() {
  descriptionInput.classList.add('hidden');
  descriptionInput.value = '';
  descriptionHint.classList.remove('hidden');
  updateTodayHints();
}

function expandDescription() {
  descriptionHint.classList.add('hidden');
  descriptionInput.classList.remove('hidden');
  descriptionInput.focus();
  updateTodayHints();
}

function isDescriptionExpanded() {
  return !descriptionInput.classList.contains('hidden');
}

function updateTodayHints() {
  const hasExclamation = exclamationTodayEnabled && input.value.includes('!');

  if (hasExclamation && !isDescriptionExpanded()) {
    todayHintInline.classList.remove('hidden');
    todayHintBelow.classList.add('hidden');
  } else if (hasExclamation && isDescriptionExpanded()) {
    todayHintInline.classList.add('hidden');
    todayHintBelow.classList.remove('hidden');
  } else {
    todayHintInline.classList.add('hidden');
    todayHintBelow.classList.add('hidden');
  }
}

async function updatePendingIndicator() {
  const count = await window.api.getPendingCount();
  if (count > 0) {
    pendingCount.textContent = count;
    pendingIndicator.classList.remove('hidden');
  } else {
    pendingIndicator.classList.add('hidden');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildNoteLinkHtml(deepLink, noteName) {
  const safeUrl = escapeHtml(deepLink);
  const safeName = escapeHtml(noteName);
  return `<!-- notelink:${safeUrl} --><p><a href="${safeUrl}">\u{1F4CE} ${safeName}</a></p>`;
}

function buildPageLinkHtml(url, title) {
  const safeUrl = escapeHtml(url);
  const safeTitle = escapeHtml(title);
  return `<!-- pagelink:${safeUrl} --><p><a href="${safeUrl}">\u{1F517} ${safeTitle}</a></p>`;
}

function updateObsidianUI() {
  if (obsidianLinked && obsidianContext) {
    obsidianHint.classList.add('hidden');
    obsidianBadgeName.textContent = obsidianContext.noteName;
    obsidianBadge.classList.remove('hidden');
  } else if (obsidianContext && obsidianContext.mode === 'ask') {
    obsidianHintName.textContent = obsidianContext.noteName;
    obsidianHint.classList.remove('hidden');
    obsidianBadge.classList.add('hidden');
  } else {
    obsidianHint.classList.add('hidden');
    obsidianBadge.classList.add('hidden');
  }
}

function updateBrowserUI() {
  if (browserLinked && browserContext) {
    browserHint.classList.add('hidden');
    browserBadgeTitle.textContent = browserContext.displayTitle;
    browserBadge.classList.remove('hidden');
  } else if (browserContext && browserContext.mode === 'ask') {
    browserHintTitle.textContent = browserContext.displayTitle;
    browserHint.classList.remove('hidden');
    browserBadge.classList.add('hidden');
  } else {
    browserHint.classList.add('hidden');
    browserBadge.classList.add('hidden');
  }
}

function toggleContextLink() {
  if (obsidianContext && !obsidianLinked) {
    obsidianLinked = true;
    updateObsidianUI();
    return;
  }
  if (browserContext && !browserLinked) {
    browserLinked = true;
    updateBrowserUI();
    return;
  }
}

function resetContextState() {
  obsidianContext = null;
  obsidianLinked = false;
  browserContext = null;
  browserLinked = false;
  obsidianHint.classList.add('hidden');
  obsidianBadge.classList.add('hidden');
  browserHint.classList.add('hidden');
  browserBadge.classList.add('hidden');
}

function resetInput() {
  input.value = '';
  input.disabled = false;
  descriptionInput.disabled = false;
  collapseDescription();
  clearError();
  todayHintInline.classList.add('hidden');
  todayHintBelow.classList.add('hidden');
  currentProjectIndex = 0;
  updateProjectHint();
  resetContextState();
  input.focus();
}

function buildProjectCycle(cfg) {
  projectCycle = [{ id: cfg.default_project_id, title: null }];
  if (cfg.secondary_projects && cfg.secondary_projects.length > 0) {
    for (const p of cfg.secondary_projects) {
      projectCycle.push({ id: p.id, title: p.title });
    }
  }
  currentProjectIndex = 0;
  updateProjectHint();
}

function updateProjectHint() {
  if (currentProjectIndex === 0 || projectCycle.length <= 1) {
    projectHint.classList.add('hidden');
  } else {
    projectName.textContent = projectCycle[currentProjectIndex].title;
    projectHint.classList.remove('hidden');
  }
}

function cycleProject(direction) {
  if (projectCycle.length <= 1) return;
  currentProjectIndex += direction;
  if (currentProjectIndex >= projectCycle.length) currentProjectIndex = 0;
  if (currentProjectIndex < 0) currentProjectIndex = projectCycle.length - 1;
  updateProjectHint();
}

function isProjectCycleModifierPressed(e) {
  switch (projectCycleModifier) {
    case 'alt':
      return e.altKey && !e.ctrlKey;
    case 'ctrl+alt':
      return e.ctrlKey && e.altKey;
    case 'ctrl':
    default:
      return e.ctrlKey && !e.altKey;
  }
}

async function saveTask() {
  let title = input.value.trim();
  if (!title) return;

  let description = descriptionInput.value.trim();

  // Append context link to description
  if (obsidianLinked && obsidianContext) {
    const linkHtml = buildNoteLinkHtml(obsidianContext.deepLink, obsidianContext.noteName);
    description = description ? description + '\n' + linkHtml : linkHtml;
  } else if (browserLinked && browserContext) {
    const linkHtml = buildPageLinkHtml(browserContext.url, browserContext.title);
    description = description ? description + '\n' + linkHtml : linkHtml;
  }

  let dueDate = null;
  if (exclamationTodayEnabled && title.includes('!')) {
    title = title.replace(/!/g, '').trim();
    if (!title) return;
    const today = new Date();
    today.setHours(23, 59, 59, 0);
    dueDate = today.toISOString();
  }

  input.disabled = true;
  descriptionInput.disabled = true;
  clearError();

  const projectId = projectCycle.length > 0 ? projectCycle[currentProjectIndex].id : null;
  const result = await window.api.saveTask(title, description, dueDate, projectId);

  if (result.success) {
    if (result.cached) {
      // Task saved to offline cache — show brief indicator then close
      showOfflineMessage();
    } else {
      window.api.closeWindow();
    }
  } else {
    showError(result.error || 'Failed to save task');
    input.disabled = false;
    descriptionInput.disabled = false;
    input.focus();
  }
}

// When the window is hidden, reset state immediately so next show starts clean
window.api.onHideWindow(() => {
  container.classList.remove('visible');
  resetInput();
});

// When the main process signals the window is shown
window.api.onShowWindow(async () => {
  // Safety net: ensure clean state in case hide handler didn't fire
  resetInput();

  // Reload config in case settings changed
  const cfg = await window.api.getConfig();
  if (cfg) {
    exclamationTodayEnabled = cfg.exclamation_today !== false;
    projectCycleModifier = cfg.project_cycle_modifier || 'ctrl';
    buildProjectCycle(cfg);
  }

  // Update pending sync indicator
  await updatePendingIndicator();

  input.focus();

  // Trigger fade-in animation
  container.classList.remove('visible');
  void container.offsetHeight;
  container.classList.add('visible');
});

// When background sync completes, update the pending count
window.api.onSyncCompleted(async () => {
  await updatePendingIndicator();
});

window.api.onDragHover((_, hovering) => {
  if (dragHandle) dragHandle.classList.toggle('hover', hovering);
});

// Badge remove button handlers
obsidianBadgeRemove.addEventListener('click', () => {
  obsidianLinked = false;
  updateObsidianUI();
  input.focus();
});

browserBadgeRemove.addEventListener('click', () => {
  browserLinked = false;
  updateBrowserUI();
  input.focus();
});

// Context link listeners from main process
window.api.onObsidianContext((context) => {
  obsidianContext = context;
  if (context.mode === 'always') {
    obsidianLinked = true;
  }
  updateObsidianUI();
});

window.api.onBrowserContext((context) => {
  browserContext = context;
  if (context.mode === 'always') {
    browserLinked = true;
  }
  updateBrowserUI();
});

// Keyboard handling on title input
input.addEventListener('keydown', async (e) => {
  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowRight') {
    e.preventDefault();
    cycleProject(1);
    return;
  }

  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowLeft') {
    e.preventDefault();
    cycleProject(-1);
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    window.api.closeWindow();
    return;
  }

  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    toggleContextLink();
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    expandDescription();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    await saveTask();
  }
});

// Keyboard handling on description textarea
descriptionInput.addEventListener('keydown', async (e) => {
  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowRight') {
    e.preventDefault();
    cycleProject(1);
    return;
  }

  if (isProjectCycleModifierPressed(e) && e.key === 'ArrowLeft') {
    e.preventDefault();
    cycleProject(-1);
    return;
  }

  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    toggleContextLink();
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    window.api.closeWindow();
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    await saveTask();
  }
  // Shift+Enter = default newline behavior in textarea
});

// Detect ! in task title to show today scheduling hint
input.addEventListener('input', () => {
  updateTodayHints();
});

// Load config to check exclamation_today setting and build project cycle
async function loadConfig() {
  const cfg = await window.api.getConfig();
  if (cfg) {
    exclamationTodayEnabled = cfg.exclamation_today !== false;
    projectCycleModifier = cfg.project_cycle_modifier || 'ctrl';
    buildProjectCycle(cfg);
  }
  // Show pending count on initial load
  await updatePendingIndicator();
}
loadConfig();

// Close window when clicking outside the container (transparent area)
document.addEventListener('mousedown', (e) => {
  if (!container.contains(e.target)) {
    window.api.closeWindow();
  }
});

// Initial animation on first load
requestAnimationFrame(() => {
  container.classList.add('visible');
  input.focus();
});
