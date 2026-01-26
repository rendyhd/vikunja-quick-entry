const input = document.getElementById('task-input');
const descriptionHint = document.getElementById('description-hint');
const descriptionInput = document.getElementById('description-input');
const container = document.getElementById('container');
const errorMessage = document.getElementById('error-message');

let errorTimeout = null;

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
  descriptionInput.style.display = 'none';
  descriptionInput.value = '';
  descriptionHint.style.display = '';
}

function expandDescription() {
  descriptionHint.style.display = 'none';
  descriptionInput.style.display = '';
  descriptionInput.focus();
}

function resetInput() {
  input.value = '';
  input.disabled = false;
  descriptionInput.disabled = false;
  collapseDescription();
  clearError();
  input.focus();
}

async function saveTask() {
  const title = input.value.trim();
  if (!title) return;

  const description = descriptionInput.value.trim();

  input.disabled = true;
  descriptionInput.disabled = true;
  clearError();

  const result = await window.api.saveTask(title, description);

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
window.api.onShowWindow(() => {
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

// Initial animation on first load
requestAnimationFrame(() => {
  container.classList.add('visible');
  input.focus();
});
