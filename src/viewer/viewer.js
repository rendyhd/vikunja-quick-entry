const container = document.getElementById('container');
const taskList = document.getElementById('task-list');
const errorMessage = document.getElementById('error-message');

let errorTimeout = null;
let selectedIndex = -1;
// Map of taskId -> original task data for undo
const completedTasks = new Map();

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

  // Title
  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;
  title.addEventListener('click', (e) => {
    e.stopPropagation();
    window.viewerApi.openTaskInBrowser(task.id);
  });
  content.appendChild(title);

  // Due date
  const dueInfo = formatDueDate(task.due_date);
  if (dueInfo) {
    const due = document.createElement('div');
    due.className = `task-due ${dueInfo.cssClass}`;
    due.textContent = dueInfo.label;
    content.appendChild(due);
  }

  item.appendChild(content);
  return item;
}

function renderTasks(tasks) {
  taskList.innerHTML = '';
  completedTasks.clear();
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

function showCompletedMessage(item, taskId) {
  item.innerHTML = '';
  item.className = 'task-item completed-undo selected';
  item.dataset.taskId = taskId;

  const msg = document.createElement('span');
  msg.className = 'completed-message';
  msg.textContent = 'Task completed \u2014 press Enter to undo';
  item.appendChild(msg);
}

async function completeTask(taskId, itemElement, checkbox) {
  if (checkbox) checkbox.disabled = true;
  itemElement.classList.add('completing');

  const result = await window.viewerApi.markTaskDone(taskId);

  if (result.success) {
    // Store task data for undo (from the response or reconstruct from DOM)
    const taskData = result.task || { id: taskId };
    completedTasks.set(String(taskId), taskData);

    // Replace item content with undo message
    showCompletedMessage(itemElement, taskId);
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
  const result = await window.viewerApi.markTaskUndone(taskId);

  if (result.success) {
    // Restore task item from the returned task data or stored data
    const taskData = result.task || completedTasks.get(String(taskId)) || { id: taskId, title: 'Task' };
    completedTasks.delete(String(taskId));

    const newItem = buildTaskItemDOM(taskData);
    newItem.classList.add('selected');
    itemElement.replaceWith(newItem);
  } else {
    showError(result.error || 'Failed to undo completion');
  }
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

async function loadTasks() {
  taskList.innerHTML = '<div class="loading">Loading tasks...</div>';

  const result = await window.viewerApi.fetchTasks();

  if (result.success) {
    renderTasks(result.tasks);
  } else {
    taskList.innerHTML = '';
    showError(result.error || 'Failed to load tasks');
  }
}

// When the main process signals the window is shown
window.viewerApi.onShowWindow(async () => {
  await loadTasks();

  // Trigger fade-in animation
  container.classList.remove('visible');
  void container.offsetHeight;
  container.classList.add('visible');
});

// Keyboard handling
document.addEventListener('keydown', (e) => {
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
requestAnimationFrame(() => {
  container.classList.add('visible');
  loadTasks();
});
