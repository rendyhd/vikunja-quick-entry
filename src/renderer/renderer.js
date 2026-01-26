const input = document.getElementById('task-input');
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

function resetInput() {
  input.value = '';
  input.disabled = false;
  clearError();
  input.focus();
}

// When the main process signals the window is shown
window.api.onShowWindow(() => {
  resetInput();

  // Trigger fade-in animation
  container.classList.remove('visible');
  void container.offsetHeight;
  container.classList.add('visible');
});

// Keyboard handling
input.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    window.api.closeWindow();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) return;

    input.disabled = true;
    clearError();

    const result = await window.api.saveTask(title);

    if (result.success) {
      window.api.closeWindow();
    } else {
      showError(result.error || 'Failed to save task');
      input.disabled = false;
      input.focus();
    }
  }
});

// Initial animation on first load
requestAnimationFrame(() => {
  container.classList.add('visible');
  input.focus();
});
