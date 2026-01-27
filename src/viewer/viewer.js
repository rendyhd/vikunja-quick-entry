const container = document.getElementById('container');
const taskList = document.getElementById('task-list');
const errorMessage = document.getElementById('error-message');

let errorTimeout = null;

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

function renderTasks(tasks) {
  taskList.innerHTML = '';

  if (!tasks || tasks.length === 0) {
    taskList.innerHTML = '<div class="empty-state">No open tasks</div>';
    return;
  }

  for (const task of tasks) {
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
    taskList.appendChild(item);
  }
}

async function completeTask(taskId, itemElement, checkbox) {
  checkbox.disabled = true;
  itemElement.classList.add('completing');

  const result = await window.viewerApi.markTaskDone(taskId);

  if (result.success) {
    // Animate removal
    itemElement.style.opacity = '0';
    itemElement.style.transform = 'translateX(-20px)';
    itemElement.style.transition = 'opacity 300ms ease, transform 300ms ease';
    setTimeout(() => {
      itemElement.remove();
      // Check if list is now empty
      if (taskList.children.length === 0) {
        taskList.innerHTML = '<div class="empty-state">No open tasks</div>';
      }
    }, 300);
  } else {
    showError(result.error || 'Failed to complete task');
    checkbox.checked = false;
    checkbox.disabled = false;
    itemElement.classList.remove('completing');
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
  }
});

// Close window when clicking outside the container (transparent area)
document.addEventListener('mousedown', (e) => {
  if (!container.contains(e.target)) {
    window.viewerApi.closeWindow();
  }
});

// Initial load
requestAnimationFrame(() => {
  container.classList.add('visible');
  loadTasks();
});
