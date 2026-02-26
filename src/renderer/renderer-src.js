import { parse, getParserConfig, recurrenceToVikunja, extractBangToday } from '../lib/task-parser/index.ts';
import { AutocompleteDropdown } from './autocomplete.js';
import { cache } from './vikunja-cache.js';

const input = document.getElementById('task-input');
const inputHighlight = document.getElementById('input-highlight');
const parsePreview = document.getElementById('parse-preview');
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

// NLP state
let parserConfig = null;
let cachedLabels = [];       // [{id, title}, ...]
let cachedProjects = [];     // [{id, title}, ...]
let lastParseResult = null;
let suppressedTypes = new Map(); // tokenType → raw text of suppressed token
let isComposing = false;

// Autocomplete dropdown
const autocomplete = new AutocompleteDropdown('autocomplete-container', (item, triggerStart, prefix) => {
  const val = input.value;
  // Check if title needs quoting (contains spaces or special chars)
  const needsQuote = item.title.includes(' ');
  const replacement = needsQuote ? `${prefix}"${item.title}" ` : `${prefix}${item.title} `;
  input.value = val.substring(0, triggerStart) + replacement + val.substring(input.selectionStart);
  const cursorPos = triggerStart + replacement.length;
  input.setSelectionRange(cursorPos, cursorPos);
  input.focus();
  handleInputChange();
});

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
  // When NLP parser is enabled, suppress legacy ! hints — parser handles dates
  if (parserConfig && parserConfig.enabled) {
    todayHintInline.classList.add('hidden');
    todayHintBelow.classList.add('hidden');
    return;
  }

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

function escapeHighlightText(text) {
  // Escape HTML and replace spaces with non-breaking spaces to match input rendering
  return escapeHtml(text).replace(/ /g, '\u00a0');
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

function clearNlpState() {
  inputHighlight.innerHTML = '';
  parsePreview.innerHTML = '';
  parsePreview.classList.add('hidden');
  lastParseResult = null;
  suppressedTypes = new Map();
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
  clearNlpState();
  autocomplete.hide();
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

// --- NLP rendering functions ---

function renderHighlights(inputValue, tokens) {
  if (!tokens || tokens.length === 0) {
    inputHighlight.innerHTML = escapeHighlightText(inputValue);
    return;
  }

  // Sort tokens by start position
  const sorted = [...tokens].sort((a, b) => a.start - b.start);
  let html = '';
  let pos = 0;

  for (const token of sorted) {
    // Text before this token
    if (token.start > pos) {
      html += escapeHighlightText(inputValue.slice(pos, token.start));
    }
    // Token itself
    html += `<span class="token-${token.type}">${escapeHighlightText(inputValue.slice(token.start, token.end))}</span>`;
    pos = token.end;
  }

  // Remaining text after last token
  if (pos < inputValue.length) {
    html += escapeHighlightText(inputValue.slice(pos));
  }

  inputHighlight.innerHTML = html;
}

function formatDateLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target - today) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 6) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PRIORITY_NAMES = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' };

function renderParsePreview(result) {
  if (!result) {
    parsePreview.innerHTML = '';
    parsePreview.classList.add('hidden');
    return;
  }

  const chips = [];

  if (result.dueDate && !suppressedTypes.has('date')) {
    chips.push(`<span class="parse-chip parse-chip-date">${escapeHtml(formatDateLabel(result.dueDate))}<button class="parse-chip-dismiss" data-type="date">&times;</button></span>`);
  }

  if (result.priority != null && !suppressedTypes.has('priority')) {
    const name = PRIORITY_NAMES[result.priority] || `P${result.priority}`;
    chips.push(`<span class="parse-chip parse-chip-priority">${escapeHtml(name)}<button class="parse-chip-dismiss" data-type="priority">&times;</button></span>`);
  }

  for (const label of result.labels) {
    if (!suppressedTypes.has('label')) {
      chips.push(`<span class="parse-chip parse-chip-label">${escapeHtml(label)}<button class="parse-chip-dismiss" data-type="label">&times;</button></span>`);
    }
  }

  if (result.project && !suppressedTypes.has('project')) {
    chips.push(`<span class="parse-chip parse-chip-project">${escapeHtml(result.project)}<button class="parse-chip-dismiss" data-type="project">&times;</button></span>`);
  }

  if (result.recurrence && !suppressedTypes.has('recurrence')) {
    const r = result.recurrence;
    const label = r.interval === 1 ? `Every ${r.unit}` : `Every ${r.interval} ${r.unit}s`;
    chips.push(`<span class="parse-chip parse-chip-recurrence">${escapeHtml(label)}<button class="parse-chip-dismiss" data-type="recurrence">&times;</button></span>`);
  }

  if (chips.length > 0) {
    parsePreview.innerHTML = chips.join('');
    parsePreview.classList.remove('hidden');
  } else {
    parsePreview.innerHTML = '';
    parsePreview.classList.add('hidden');
  }
}

function handleInputChange() {
  const val = input.value;

  if (!parserConfig || !parserConfig.enabled) {
    inputHighlight.innerHTML = '';
    parsePreview.innerHTML = '';
    parsePreview.classList.add('hidden');
    updateTodayHints();
    return;
  }

  // Build suppress list from dismissed chips
  const suppressTypes = [...suppressedTypes.keys()];

  const config = {
    ...parserConfig,
    suppressTypes,
  };

  const result = parse(val, config);
  lastParseResult = result;

  // Filter tokens to only show non-suppressed ones
  const visibleTokens = result.tokens.filter(t => !suppressedTypes.has(t.type));
  renderHighlights(val, visibleTokens);
  renderParsePreview(result);

  // Update autocomplete
  autocomplete.update(val, input.selectionStart);
}

async function refreshLabelsAndProjects() {
  try {
    const [labelsResult, projectsResult] = await Promise.all([
      window.api.fetchLabels(),
      window.api.fetchProjects(),
    ]);

    if (labelsResult && labelsResult.success) {
      cachedLabels = labelsResult.labels || [];
      cache.setLabels(cachedLabels);
    }

    if (projectsResult && projectsResult.success) {
      cachedProjects = (projectsResult.projects || []).map(p => ({
        id: p.id,
        title: p.title,
      }));
      cache.setProjects(cachedProjects);
    }
  } catch {
    // Silently fail — autocomplete just won't have data
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
  let priority = null;
  let repeatAfter = null;
  let repeatMode = null;
  let taskProjectId = null;

  if (parserConfig && parserConfig.enabled && lastParseResult) {
    // Use parsed values
    title = lastParseResult.title || title;

    if (lastParseResult.dueDate && !suppressedTypes.has('date')) {
      const d = new Date(lastParseResult.dueDate);
      d.setHours(23, 59, 59, 0);
      dueDate = d.toISOString();
    }

    if (lastParseResult.priority != null && !suppressedTypes.has('priority')) {
      priority = lastParseResult.priority;
    }

    if (lastParseResult.recurrence && !suppressedTypes.has('recurrence')) {
      const vik = recurrenceToVikunja(lastParseResult.recurrence);
      repeatAfter = vik.repeat_after;
      repeatMode = vik.repeat_mode;
    }

    if (lastParseResult.project && !suppressedTypes.has('project')) {
      // Resolve project name to ID
      const match = cachedProjects.find(
        p => p.title.toLowerCase() === lastParseResult.project.toLowerCase()
      );
      if (match) {
        taskProjectId = match.id;
      }
    }
  } else {
    // Legacy ! → today behavior
    if (exclamationTodayEnabled && title.includes('!')) {
      const bang = extractBangToday(title);
      if (bang.dueDate) {
        title = bang.title;
        if (!title) return;
        const today = new Date();
        today.setHours(23, 59, 59, 0);
        dueDate = today.toISOString();
      }
    }
  }

  if (!title.trim()) return;

  input.disabled = true;
  descriptionInput.disabled = true;
  clearError();

  const projectId = taskProjectId || (projectCycle.length > 0 ? projectCycle[currentProjectIndex].id : null);
  const result = await window.api.saveTask(title, description, dueDate, projectId, priority, repeatAfter, repeatMode);

  if (result.success) {
    // Attach labels if parser found any
    if (parserConfig && parserConfig.enabled && lastParseResult && result.task && result.task.id) {
      const labelNames = (lastParseResult.labels || []).filter(() => !suppressedTypes.has('label'));
      for (const labelName of labelNames) {
        const match = cachedLabels.find(
          l => l.title.toLowerCase() === labelName.toLowerCase()
        );
        if (match) {
          await window.api.addLabelToTask(result.task.id, match.id);
        }
      }
    }

    if (result.cached) {
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

    // Load NLP parser config
    parserConfig = getParserConfig(cfg);
    autocomplete.setSyntaxMode(parserConfig.syntaxMode);
    autocomplete.setEnabled(parserConfig.enabled);
  }

  // Refresh labels and projects for autocomplete
  refreshLabelsAndProjects();

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
  // Let autocomplete handle navigation keys first
  if (autocomplete.handleKeyDown(e)) return;

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

// Input change handler for NLP parsing
input.addEventListener('input', () => {
  if (isComposing) return;

  // Check if any suppressed token text was edited — lift that suppression
  if (lastParseResult && suppressedTypes.size > 0) {
    const val = input.value;
    for (const [type, raw] of suppressedTypes.entries()) {
      if (!val.includes(raw)) {
        suppressedTypes.delete(type);
      }
    }
  }

  handleInputChange();
  updateTodayHints();
});

// IME composition guards
input.addEventListener('compositionstart', () => { isComposing = true; });
input.addEventListener('compositionend', () => {
  isComposing = false;
  handleInputChange();
});

// Parse preview chip dismiss handler (event delegation)
parsePreview.addEventListener('click', (e) => {
  const btn = e.target.closest('.parse-chip-dismiss');
  if (!btn) return;
  const type = btn.dataset.type;
  if (!type) return;

  // Find the raw text of the token being suppressed
  if (lastParseResult) {
    const token = lastParseResult.tokens.find(t => t.type === type);
    if (token) {
      suppressedTypes.set(type, token.raw);
    }
  }

  // Re-run parse with updated suppressions
  handleInputChange();
  input.focus();
});

// Sync highlight scroll with input scroll
input.addEventListener('scroll', () => {
  inputHighlight.scrollLeft = input.scrollLeft;
});

// Load config to check exclamation_today setting and build project cycle
async function loadConfig() {
  const cfg = await window.api.getConfig();
  if (cfg) {
    exclamationTodayEnabled = cfg.exclamation_today !== false;
    projectCycleModifier = cfg.project_cycle_modifier || 'ctrl';
    buildProjectCycle(cfg);

    // Load NLP parser config
    parserConfig = getParserConfig(cfg);
    autocomplete.setSyntaxMode(parserConfig.syntaxMode);
    autocomplete.setEnabled(parserConfig.enabled);

    // Pre-fetch labels and projects
    refreshLabelsAndProjects();
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
