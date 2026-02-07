const container = document.getElementById('container');
const taskList = document.getElementById('task-list');
const errorMessage = document.getElementById('error-message');
const statusBar = document.getElementById('status-bar');

let errorTimeout = null;
let selectedIndex = -1;
let isStandaloneMode = false;
// Cache: skip re-fetch if opened again within 30s
let lastFetchResult = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000;
// Map of taskId -> original task data for undo
const completedTasks = new Map();
// Track which completions were cached (offline) vs synced
const cachedCompletions = new Set();

function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.hidden = false;
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

function showStatusBar(text, type) {
  statusBar.textContent = text;
  statusBar.className = 'status-bar ' + (type || '');
  statusBar.classList.remove('hidden');
}

function hideStatusBar() {
  statusBar.classList.add('hidden');
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getTaskItems() {
  return taskList.querySelectorAll('.task-item');
}

function updateSelection(newIndex) {
  const items = getTaskItems();
  if (items.length === 0) return;

  // Clamp index
  if (newIndex < 0) newIndex = items.length - 1;
  if (newIndex >= items.length) newIndex = 0;

  // Remove old selection
  items.forEach((item) => item.classList.remove('selected'));

  selectedIndex = newIndex;
  items[selectedIndex].classList.add('selected');

  // Scroll into view if needed
  items[selectedIndex].scrollIntoView({ block: 'nearest' });
}

function formatDueDate(dueDateStr) {
  if (!dueDateStr || dueDateStr === '0001-01-01T00:00:00Z') {
    return null;
  }

  const due = new Date(dueDateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const tomorrowEnd = new Date(todayEnd.getTime() + 86400000);

  let label;
  let cssClass;

  if (due < todayStart) {
    // Overdue
    const diffDays = Math.ceil((todayStart - due) / 86400000);
    label = diffDays === 1 ? 'Yesterday' : `${diffDays} days overdue`;
    cssClass = 'overdue';
  } else if (due <= todayEnd) {
    label = 'Today';
    cssClass = 'today';
  } else if (due <= tomorrowEnd) {
    label = 'Tomorrow';
    cssClass = 'upcoming';
  } else {
    // Format as date
    const diffDays = Math.ceil((due - todayStart) / 86400000);
    if (diffDays <= 7) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      label = days[due.getDay()];
    } else {
      const month = due.toLocaleString('default', { month: 'short' });
      label = `${month} ${due.getDate()}`;
      if (due.getFullYear() !== now.getFullYear()) {
        label += `, ${due.getFullYear()}`;
      }
    }
    cssClass = 'upcoming';
  }

  return { label, cssClass };
}

function buildTaskItemDOM(task) {
  const item = document.createElement('div');
  item.className = 'task-item';
  item.dataset.taskId = task.id;
  // Store full task data for undo (preserves due_date, priority, etc.)
  item.dataset.task = JSON.stringify(task);

  // Priority indicator
  if (task.priority && task.priority > 0) {
    const priority = document.createElement('span');
    priority.className = `task-priority priority-${Math.min(task.priority, 5)}`;
    item.appendChild(priority);
  }

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.title = 'Mark as done';
  checkbox.addEventListener('change', () => completeTask(task.id, item, checkbox));
  item.appendChild(checkbox);

  // Content wrapper
  const content = document.createElement('div');
  content.className = 'task-content';

  // Title row (title + description icon)
  const titleRow = document.createElement('div');
  titleRow.className = 'task-title-row';

  const title = document.createElement('div');
  title.className = 'task-title' + (isStandaloneMode ? ' standalone' : '');
  title.textContent = task.title;
  if (!isStandaloneMode) {
    title.addEventListener('click', (e) => {
      e.stopPropagation();
      window.viewerApi.openTaskInBrowser(task.id);
    });
  }
  titleRow.appendChild(title);

  // Description indicator icon
  if (task.description) {
    const descIcon = document.createElement('span');
    descIcon.className = 'description-icon';
    descIcon.title = 'Toggle description';
    descIcon.textContent = '\u2261'; // ≡ (triple bar / hamburger icon)
    descIcon.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const desc = item.querySelector('.task-description');
      if (desc) desc.classList.toggle('hidden');
    });
    titleRow.appendChild(descIcon);
  }

  content.appendChild(titleRow);

  // Due date
  const dueInfo = formatDueDate(task.due_date);
  if (dueInfo) {
    const due = document.createElement('div');
    due.className = `task-due ${dueInfo.cssClass}`;
    due.textContent = dueInfo.label;
    content.appendChild(due);
  }

  // Description (hidden by default, toggled with Shift+Enter or icon click)
  if (task.description) {
    const desc = document.createElement('div');
    desc.className = 'task-description hidden';
    desc.textContent = task.description;
    content.appendChild(desc);
  }

  item.appendChild(content);
  return item;
}

function toggleSelectedDescription() {
  const items = getTaskItems();
  if (selectedIndex < 0 || selectedIndex >= items.length) return;
  const item = items[selectedIndex];
  const desc = item.querySelector('.task-description');
  if (!desc) return;
  desc.classList.toggle('hidden');
}

function renderTasks(tasks) {
  taskList.innerHTML = '';
  completedTasks.clear();
  cachedCompletions.clear();
  selectedIndex = -1;

  if (!tasks || tasks.length === 0) {
    taskList.innerHTML = '<div class="empty-state">No open tasks</div>';
    return;
  }

  for (const task of tasks) {
    const item = buildTaskItemDOM(task);
    taskList.appendChild(item);
  }

  // Auto-select first task
  updateSelection(0);
}

function showCompletedMessage(item, taskId, wasCached) {
  item.innerHTML = '';
  item.className = 'task-item completed-undo selected';
  item.dataset.taskId = taskId;

  const msg = document.createElement('span');
  msg.className = 'completed-message';
  if (wasCached) {
    msg.textContent = 'Queued offline \u2014 press Enter to undo';
  } else {
    msg.textContent = 'Task completed \u2014 press Enter to undo';
  }
  item.appendChild(msg);
}

async function completeTask(taskId, itemElement, checkbox) {
  // Get original task data from DOM BEFORE API call (API response may lose due_date)
  const originalTask = JSON.parse(itemElement.dataset.task || '{}');

  if (checkbox) checkbox.disabled = true;
  itemElement.classList.add('completing');

  // Pass original task data so the API preserves all fields (due_date, priority, etc.)
  const result = await window.viewerApi.markTaskDone(taskId, originalTask);

  if (result.success) {
    // Invalidate cache so next open fetches fresh data
    lastFetchResult = null;
    // Store ORIGINAL task data for undo (not from response which may have lost fields)
    completedTasks.set(String(taskId), originalTask);

    const wasCached = !!result.cached;
    if (wasCached) {
      cachedCompletions.add(String(taskId));
    }

    // Replace item content with undo message
    showCompletedMessage(itemElement, taskId, wasCached);
  } else {
    showError(result.error || 'Failed to complete task');
    if (checkbox) {
      checkbox.checked = false;
      checkbox.disabled = false;
    }
    itemElement.classList.remove('completing');
  }
}

async function undoComplete(taskId, itemElement) {
  // Get stored original task data to restore all fields (due_date, priority, etc.)
  const storedTask = completedTasks.get(String(taskId));
  const result = await window.viewerApi.markTaskUndone(taskId, storedTask);

  if (result.success) {
    // Invalidate cache so next open fetches fresh data
    lastFetchResult = null;
    // Use stored original data (most reliable) or fall back to API response
    const taskData = storedTask || result.task || { id: taskId, title: 'Task' };
    completedTasks.delete(String(taskId));
    cachedCompletions.delete(String(taskId));

    const newItem = buildTaskItemDOM(taskData);
    newItem.classList.add('selected');
    itemElement.replaceWith(newItem);
  } else {
    showError(result.error || 'Failed to undo completion');
  }
}

async function toggleDueDate() {
  const items = getTaskItems();
  if (selectedIndex < 0 || selectedIndex >= items.length) return;

  const item = items[selectedIndex];
  // Don't modify completed/undo items
  if (item.classList.contains('completed-undo')) return;

  const taskId = item.dataset.taskId;
  const taskData = JSON.parse(item.dataset.task || '{}');

  const hasDueDate = taskData.due_date && taskData.due_date !== '0001-01-01T00:00:00Z';

  if (hasDueDate) {
    // Remove due date
    const result = await window.viewerApi.removeDueDate(taskId, taskData);

    if (result.success) {
      lastFetchResult = null;

      // Update stored task data
      taskData.due_date = '0001-01-01T00:00:00Z';
      item.dataset.task = JSON.stringify(taskData);

      // Remove the due date element from the DOM
      const dueEl = item.querySelector('.task-due');
      if (dueEl) dueEl.remove();
    } else {
      showError(result.error || 'Failed to remove due date');
    }
  } else {
    // Schedule to today (existing behavior)
    const result = await window.viewerApi.scheduleTaskToday(taskId, taskData);

    if (result.success) {
      lastFetchResult = null;

      // Update the due date in the stored task data
      const now = new Date();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
      taskData.due_date = todayEnd;
      item.dataset.task = JSON.stringify(taskData);

      // Update the due date badge in the DOM
      const content = item.querySelector('.task-content');
      let dueEl = item.querySelector('.task-due');
      if (dueEl) {
        dueEl.textContent = 'Today';
        dueEl.className = 'task-due today';
      } else if (content) {
        // Task had no due date — create the badge
        dueEl = document.createElement('div');
        dueEl.className = 'task-due today';
        dueEl.textContent = 'Today';
        // Insert after .task-title-row
        const titleRow = content.querySelector('.task-title-row');
        if (titleRow && titleRow.nextSibling) {
          content.insertBefore(dueEl, titleRow.nextSibling);
        } else {
          content.appendChild(dueEl);
        }
      }
    } else {
      showError(result.error || 'Failed to schedule task');
    }
  }
}

// --- Inline Editing ---
let editingItem = null; // the .task-item currently in edit mode

function enterEditMode() {
  const items = getTaskItems();
  if (selectedIndex < 0 || selectedIndex >= items.length) return;

  const item = items[selectedIndex];
  if (item.classList.contains('completed-undo')) return;
  if (item.classList.contains('editing')) return;

  const taskData = JSON.parse(item.dataset.task || '{}');
  editingItem = item;
  item.classList.add('editing');

  // Save original content for cancel
  item._originalHTML = item.innerHTML;

  // Build edit UI
  item.innerHTML = '';

  const editWrapper = document.createElement('div');
  editWrapper.className = 'task-edit-wrapper';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'task-edit-title';
  titleInput.value = taskData.title || '';
  titleInput.placeholder = 'Task title';

  const descTextarea = document.createElement('textarea');
  descTextarea.className = 'task-edit-description';
  descTextarea.value = taskData.description || '';
  descTextarea.placeholder = 'Description (optional)';
  descTextarea.rows = 3;

  editWrapper.appendChild(titleInput);
  editWrapper.appendChild(descTextarea);

  const hint = document.createElement('div');
  hint.className = 'task-edit-hint';
  hint.textContent = 'Enter to save \u00b7 Shift+Enter for new line \u00b7 Esc to cancel';
  editWrapper.appendChild(hint);

  item.appendChild(editWrapper);

  // Stop propagation on inputs so global keyboard handlers don't interfere
  const stopGlobal = (e) => {
    e.stopPropagation();
  };
  titleInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit(item, titleInput.value, descTextarea.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit(item);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      descTextarea.focus();
    }
  });

  descTextarea.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit(item, titleInput.value, descTextarea.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit(item);
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      titleInput.focus();
    }
  });

  titleInput.addEventListener('keypress', stopGlobal);
  descTextarea.addEventListener('keypress', stopGlobal);

  titleInput.focus();
  titleInput.select();
}

async function saveEdit(item, newTitle, newDescription) {
  const trimmedTitle = newTitle.trim();
  if (!trimmedTitle) {
    showError('Title cannot be empty');
    return;
  }

  const taskId = item.dataset.taskId;
  const taskData = JSON.parse(item.dataset.task || '{}');

  // Build updated task data (include all original fields to prevent zero-value problem)
  const updatedData = { ...taskData, title: trimmedTitle, description: newDescription };

  const result = await window.viewerApi.updateTask(taskId, updatedData);

  if (result.success) {
    lastFetchResult = null;

    // Update stored task data
    taskData.title = trimmedTitle;
    taskData.description = newDescription;
    item.dataset.task = JSON.stringify(taskData);

    // Rebuild the task DOM
    exitEditMode(item);
    const newItem = buildTaskItemDOM(taskData);
    newItem.classList.add('selected');
    newItem.dataset.taskId = item.dataset.taskId;
    newItem.dataset.task = item.dataset.task;
    item.replaceWith(newItem);
    editingItem = null;
  } else {
    showError(result.error || 'Failed to update task');
  }
}

function cancelEdit(item) {
  if (item._originalHTML) {
    item.innerHTML = item._originalHTML;
    delete item._originalHTML;
  }
  item.classList.remove('editing');
  editingItem = null;
}

function exitEditMode(item) {
  delete item._originalHTML;
  item.classList.remove('editing');
  editingItem = null;
}

function openSelectedTaskInBrowser() {
  const items = getTaskItems();
  if (selectedIndex < 0 || selectedIndex >= items.length) return;
  const taskId = items[selectedIndex].dataset.taskId;
  window.viewerApi.openTaskInBrowser(Number(taskId));
}

async function handleEnterOnSelected() {
  const items = getTaskItems();
  if (selectedIndex < 0 || selectedIndex >= items.length) return;

  const item = items[selectedIndex];
  const taskId = item.dataset.taskId;

  if (item.classList.contains('completed-undo')) {
    // Undo
    await undoComplete(taskId, item);
  } else {
    // Complete
    await completeTask(taskId, item, item.querySelector('.task-checkbox'));
  }
}

async function loadConfig() {
  const cfg = await window.viewerApi.getConfig();
  if (cfg) {
    isStandaloneMode = cfg.standalone_mode === true;
  }
}

async function loadTasks(forceRefresh = false) {
  const now = Date.now();
  const cacheValid = !forceRefresh && lastFetchResult && (now - lastFetchTime < CACHE_TTL_MS);

  if (cacheValid) {
    applyFetchResult(lastFetchResult);
    return;
  }

  taskList.innerHTML = '<div class="loading">Loading tasks...</div>';
  hideStatusBar();

  const result = await window.viewerApi.fetchTasks();

  if (result.success) {
    lastFetchResult = result;
    lastFetchTime = Date.now();
  }

  applyFetchResult(result);
}

async function applyFetchResult(result) {
  if (result.success) {
    renderTasks(result.tasks);

    if (result.cached) {
      // Show indicator that we're showing cached data
      const timeAgo = formatRelativeTime(result.cachedAt);
      showStatusBar(`Offline \u2014 cached ${timeAgo}`, 'offline');
    } else if (result.standalone) {
      showStatusBar('Standalone mode', 'standalone');
    } else {
      // Check for pending actions to show subtle indicator
      const pendingCount = await window.viewerApi.getPendingCount();
      if (pendingCount > 0) {
        showStatusBar(`${pendingCount} action(s) pending sync`, 'pending');
      }
    }
  } else {
    taskList.innerHTML = '';
    showError(result.error || 'Failed to load tasks');
  }
}

// When the main process signals the window is shown
window.viewerApi.onShowWindow(async () => {
  await loadConfig();
  await loadTasks();

  // Trigger fade-in animation
  container.classList.remove('visible');
  void container.offsetHeight;
  container.classList.add('visible');
});

// When background sync completes, refresh the task list if visible
window.viewerApi.onSyncCompleted(async () => {
  // Reload tasks to reflect synced state
  await loadTasks(true);
});

// Keyboard handling
document.addEventListener('keydown', (e) => {
  // If in edit mode, only handle Escape at the document level (inputs handle the rest)
  if (editingItem) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit(editingItem);
    }
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    window.viewerApi.closeWindow();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    updateSelection(selectedIndex + 1);
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    updateSelection(selectedIndex - 1);
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    enterEditMode();
    return;
  }

  if (e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    toggleSelectedDescription();
    return;
  }

  if (e.key === '!') {
    e.preventDefault();
    toggleDueDate();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    handleEnterOnSelected();
    return;
  }
});

// Close window when clicking outside the container (transparent area)
document.addEventListener('mousedown', (e) => {
  if (!container.contains(e.target)) {
    window.viewerApi.closeWindow();
  }
});

// Click on a task item to select it
taskList.addEventListener('click', (e) => {
  const item = e.target.closest('.task-item');
  if (!item) return;
  const items = getTaskItems();
  const index = Array.from(items).indexOf(item);
  if (index >= 0) {
    updateSelection(index);
  }
});

// Initial load
requestAnimationFrame(async () => {
  await loadConfig();
  container.classList.add('visible');
  loadTasks();
});
