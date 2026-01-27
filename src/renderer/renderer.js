const input = document.getElementById('task-input');
const descriptionHint = document.getElementById('description-hint');
const descriptionInput = document.getElementById('description-input');
const container = document.getElementById('container');
const errorMessage = document.getElementById('error-message');
const todayHintInline = document.getElementById('today-hint-inline');
const todayHintBelow = document.getElementById('today-hint-below');

let errorTimeout = null;
let exclamationTodayEnabled = true;

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

function clearError() {
  clearTimeout(errorTimeout);
  errorMessage.classList.remove('show');
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

function resetInput() {
  input.value = '';
  input.disabled = false;
  descriptionInput.disabled = false;
  collapseDescription();
  clearError();
  todayHintInline.classList.add('hidden');
  todayHintBelow.classList.add('hidden');
  input.focus();
}

async function saveTask() {
  let title = input.value.trim();
  if (!title) return;

  const description = descriptionInput.value.trim();

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

  const result = await window.api.saveTask(title, description, dueDate);

  if (result.success) {
    window.api.closeWindow();
  } else {
    showError(result.error || 'Failed to save task');
    input.disabled = false;
    descriptionInput.disabled = false;
    input.focus();
  }
}

// When the main process signals the window is shown
window.api.onShowWindow(async () => {
  // Reload config in case settings changed
  const cfg = await window.api.getConfig();
  if (cfg) {
    exclamationTodayEnabled = cfg.exclamation_today !== false;
  }

  resetInput();

  // Trigger fade-in animation
  container.classList.remove('visible');
  void container.offsetHeight;
  container.classList.add('visible');
});

// Keyboard handling on title input
input.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    window.api.closeWindow();
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

// Load config to check exclamation_today setting
async function loadConfig() {
  const cfg = await window.api.getConfig();
  if (cfg) {
    exclamationTodayEnabled = cfg.exclamation_today !== false;
  }
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
