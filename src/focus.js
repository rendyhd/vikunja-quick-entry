const { BrowserWindow } = require('electron');

/**
 * Attempts to return focus to the previously active window after hiding
 * the quick entry window. On Windows, simply hiding the window usually
 * returns focus. If it doesn't, we create a tiny transparent dummy window,
 * focus it, then immediately destroy it — triggering Windows to cycle
 * focus back to the previously active app.
 */
function returnFocusToPreviousWindow() {
  const dummy = new BrowserWindow({
    width: 1,
    height: 1,
    x: -100,
    y: -100,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
  });

  dummy.showInactive();
  dummy.focus();

  setImmediate(() => {
    dummy.destroy();
  });
}

module.exports = { returnFocusToPreviousWindow };
