const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

const CACHE_FILENAME = 'offline-cache.json';

function getCachePath() {
  return path.join(app.getPath('userData'), CACHE_FILENAME);
}

function loadCache() {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf-8');
    const cache = JSON.parse(raw);
    // Ensure required fields exist
    return {
      pendingActions: Array.isArray(cache.pendingActions) ? cache.pendingActions : [],
      cachedTasks: Array.isArray(cache.cachedTasks) ? cache.cachedTasks : null,
      cachedTasksTimestamp: cache.cachedTasksTimestamp || null,
    };
  } catch {
    return { pendingActions: [], cachedTasks: null, cachedTasksTimestamp: null };
  }
}

function saveCache(cache) {
  const cachePath = getCachePath();
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Write atomically: write to temp file then rename
  const tmpPath = cachePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2), 'utf-8');
  fs.renameSync(tmpPath, cachePath);
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Add a pending action to the offline queue.
 * Actions have a `type` field: 'create', 'complete', or 'uncomplete'.
 */
function addPendingAction(action) {
  const cache = loadCache();
  action.id = generateId();
  action.createdAt = new Date().toISOString();
  cache.pendingActions.push(action);
  saveCache(cache);
  return action.id;
}

function removePendingAction(actionId) {
  const cache = loadCache();
  cache.pendingActions = cache.pendingActions.filter((a) => a.id !== actionId);
  saveCache(cache);
}

/**
 * Remove the first pending action matching a taskId and type.
 * Returns true if an action was removed.
 */
function removePendingActionByTaskId(taskId, type) {
  const cache = loadCache();
  const index = cache.pendingActions.findIndex(
    (a) => String(a.taskId) === String(taskId) && a.type === type,
  );
  if (index !== -1) {
    cache.pendingActions.splice(index, 1);
    saveCache(cache);
    return true;
  }
  return false;
}

function getPendingActions() {
  return loadCache().pendingActions;
}

function getPendingCount() {
  return loadCache().pendingActions.length;
}

/**
 * Save the latest task list from a successful API fetch.
 */
function setCachedTasks(tasks) {
  const cache = loadCache();
  cache.cachedTasks = tasks;
  cache.cachedTasksTimestamp = new Date().toISOString();
  saveCache(cache);
}

/**
 * Get cached tasks, filtering out any tasks with pending 'complete' actions.
 */
function getCachedTasks() {
  const cache = loadCache();
  if (!cache.cachedTasks) {
    return { tasks: null, timestamp: null };
  }

  // Filter out tasks that the user has already marked as done offline
  const pendingCompleteIds = cache.pendingActions
    .filter((a) => a.type === 'complete')
    .map((a) => String(a.taskId));

  const tasks = cache.cachedTasks.filter(
    (t) => !pendingCompleteIds.includes(String(t.id)),
  );

  return { tasks, timestamp: cache.cachedTasksTimestamp };
}

/**
 * Check if an error message indicates a retriable network error
 * (as opposed to a permanent server-side error like 401/403/404).
 */
function isRetriableError(error) {
  if (!error) return false;
  const retriablePatterns = [
    'timed out',
    'Network error',
    'network error',
    'net::',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'fetch failed',
    'socket hang up',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_NETWORK_CHANGED',
    'ERR_NAME_NOT_RESOLVED',
    'ERR_CONNECTION_REFUSED',
    'ERR_CONNECTION_TIMED_OUT',
    'ERR_ADDRESS_UNREACHABLE',
    'Server error',
  ];
  return retriablePatterns.some((pattern) => error.includes(pattern));
}

/**
 * Check if an error indicates an authentication/authorization problem.
 * These should stop sync processing but NOT discard the queued action,
 * since the user can fix their token in Settings.
 */
function isAuthError(error) {
  if (!error) return false;
  return (
    error.includes('API token is invalid') ||
    error.includes('API token has insufficient') ||
    error.includes('API token lacks')
  );
}

module.exports = {
  addPendingAction,
  removePendingAction,
  removePendingActionByTaskId,
  getPendingActions,
  getPendingCount,
  setCachedTasks,
  getCachedTasks,
  isRetriableError,
  isAuthError,
};
