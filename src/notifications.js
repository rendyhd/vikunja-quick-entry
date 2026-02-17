const { Notification, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const { fetchTasks } = require('./api');
const { getAllStandaloneTasks } = require('./cache');

const NULL_DATE = '0001-01-01T00:00:00Z';

let dailyTimer = null;
let secondaryTimer = null;
let getConfigFn = null;
let showMainWindowFn = null;
let icon = null;

/**
 * Initialize notification scheduler. Call after app.whenReady() and config load.
 * @param {Function} getConfig - function returning current config
 * @param {Function} showMainWindow - function to show/focus Quick View
 */
function initNotifications(getConfig, showMainWindow) {
  getConfigFn = getConfig;
  showMainWindowFn = showMainWindow;

  // Load icon once
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = undefined;
  } catch {
    icon = undefined;
  }

  powerMonitor.on('resume', () => {
    rescheduleNotifications();
  });

  rescheduleNotifications();
}

/**
 * Clear existing timers and schedule the next notification firings based on config.
 */
function rescheduleNotifications() {
  // Clear existing timers
  if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  if (secondaryTimer) { clearTimeout(secondaryTimer); secondaryTimer = null; }

  const config = getConfigFn ? getConfigFn() : null;
  if (!config || !config.notifications_enabled) return;

  if (config.notifications_daily_reminder_enabled) {
    dailyTimer = scheduleNextFiring(config.notifications_daily_reminder_time, () => {
      fireNotification();
    });
  }

  if (config.notifications_secondary_reminder_enabled) {
    secondaryTimer = scheduleNextFiring(config.notifications_secondary_reminder_time, () => {
      fireNotification();
    });
  }
}

/**
 * Stop all notification timers.
 */
function stopNotifications() {
  if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  if (secondaryTimer) { clearTimeout(secondaryTimer); secondaryTimer = null; }
}

/**
 * Schedule a setTimeout to fire at a specific HH:mm time.
 * If the time has passed today, schedules for tomorrow.
 * After firing, reschedules for the next day.
 */
function scheduleNextFiring(timeStr, callback) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // If target time already passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const ms = target.getTime() - now.getTime();
  return setTimeout(() => {
    callback();
    // After firing, reschedule for next day
    rescheduleNotifications();
  }, ms);
}

/**
 * Fetch tasks and show notifications based on current config.
 */
async function fireNotification() {
  const config = getConfigFn ? getConfigFn() : null;
  if (!config || !config.notifications_enabled) return;

  try {
    const tasks = await fetchNotificationTasks(config);
    showTaskNotifications(tasks, config);
  } catch (err) {
    console.error('Notification fetch failed:', err.message || err);
  }
}

/**
 * Fetch and categorize tasks by due date status.
 */
async function fetchNotificationTasks(config) {
  const tasks = { overdue: [], today: [], upcoming: [] };

  let allTasks = [];

  if (config.standalone_mode) {
    // Use local standalone tasks
    allTasks = getAllStandaloneTasks();
  } else {
    // Fetch from API — get all open tasks with due dates
    const result = await fetchTasks({
      per_page: 10000,
      page: 1,
      sort_by: 'due_date',
      order_by: 'asc',
      // Don't filter by project or due_date_filter — we want everything for notification categorization
    });
    if (result.success && Array.isArray(result.tasks)) {
      allTasks = result.tasks;
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  for (const task of allTasks) {
    if (task.done) continue;
    if (!task.due_date || task.due_date === NULL_DATE) continue;

    const due = new Date(task.due_date);
    if (due < todayStart) tasks.overdue.push(task);
    else if (due < todayEnd) tasks.today.push(task);
    else if (due < tomorrowEnd) tasks.upcoming.push(task);
  }

  return tasks;
}

/**
 * Display desktop notifications for task reminders.
 * Shows individual notifications for <=3 tasks, summary for more.
 */
function showTaskNotifications(tasks, config) {
  const allTasks = [];
  if (config.notifications_overdue_enabled) allTasks.push(...tasks.overdue);
  if (config.notifications_due_today_enabled) allTasks.push(...tasks.today);
  if (config.notifications_upcoming_enabled) allTasks.push(...tasks.upcoming);

  if (allTasks.length === 0) return;

  if (!Notification.isSupported()) return;

  if (allTasks.length <= 3) {
    // Individual notifications
    for (const task of allTasks) {
      const n = new Notification({
        title: task.title,
        body: formatDueLabel(task.due_date),
        silent: !config.notifications_sound,
        timeoutType: config.notifications_persistent ? 'never' : 'default',
        icon,
      });
      n.on('click', () => {
        if (showMainWindowFn) showMainWindowFn();
      });
      n.show();
    }
  } else {
    // Summary notification
    const parts = [];
    if (tasks.overdue.length > 0 && config.notifications_overdue_enabled) {
      parts.push(`${tasks.overdue.length} overdue`);
    }
    if (tasks.today.length > 0 && config.notifications_due_today_enabled) {
      parts.push(`${tasks.today.length} due today`);
    }
    if (tasks.upcoming.length > 0 && config.notifications_upcoming_enabled) {
      parts.push(`${tasks.upcoming.length} due tomorrow`);
    }

    if (parts.length === 0) return;

    const n = new Notification({
      title: 'Vikunja \u2014 Task Reminder',
      body: `You have ${parts.join(', ')}`,
      silent: !config.notifications_sound,
      timeoutType: config.notifications_persistent ? 'never' : 'default',
      icon,
    });
    n.on('click', () => {
      if (showMainWindowFn) showMainWindowFn();
    });
    n.show();
  }
}

/**
 * Format a due date into a human-readable label.
 */
function formatDueLabel(dueDate) {
  const due = new Date(dueDate);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((due - todayStart) / (1000 * 60 * 60 * 24));

  if (diff < 0) return `Overdue by ${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''}`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff} days`;
}

/**
 * Send a test notification to verify the system works.
 */
function sendTestNotification() {
  if (!Notification.isSupported()) return;

  const config = getConfigFn ? getConfigFn() : null;

  const n = new Notification({
    title: 'Vikunja \u2014 Test Notification',
    body: 'Notifications are working correctly.',
    silent: config ? !config.notifications_sound : false,
    timeoutType: config && config.notifications_persistent ? 'never' : 'default',
    icon,
  });
  n.on('click', () => {
    if (showMainWindowFn) showMainWindowFn();
  });
  n.show();
}

module.exports = { initNotifications, rescheduleNotifications, stopNotifications, sendTestNotification };
