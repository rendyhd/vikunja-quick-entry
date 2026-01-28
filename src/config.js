const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_FILENAME = 'config.json';

function getConfigPath() {
  // First check portable location (next to the executable / project root)
  const portablePath = path.join(app.getAppPath(), CONFIG_FILENAME);
  if (fs.existsSync(portablePath)) {
    return portablePath;
  }

  // Then check %APPDATA%/vikunja-quick-entry/
  const appDataPath = path.join(app.getPath('userData'), CONFIG_FILENAME);
  if (fs.existsSync(appDataPath)) {
    return appDataPath;
  }

  // Default to appData location (will be created on first setup)
  return appDataPath;
}

function loadConfig() {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    return validateConfig(config) ? config : null;
  } catch {
    return null;
  }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') return false;
  if (!config.vikunja_url || typeof config.vikunja_url !== 'string') return false;
  if (!config.api_token || typeof config.api_token !== 'string') return false;
  if (!config.default_project_id && config.default_project_id !== 0) return false;
  return true;
}

function saveConfig(config) {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function getConfig() {
  const config = loadConfig();
  if (!config) return null;

  return {
    vikunja_url: config.vikunja_url.replace(/\/+$/, ''), // strip trailing slashes
    api_token: config.api_token,
    default_project_id: Number(config.default_project_id),
    hotkey: config.hotkey || 'Alt+Shift+V',
    launch_on_startup: config.launch_on_startup === true,
    exclamation_today: config.exclamation_today !== false,
    auto_check_updates: config.auto_check_updates !== false,
    // Quick View settings
    viewer_hotkey: config.viewer_hotkey || 'Alt+Shift+B',
    viewer_position: config.viewer_position || null,
    viewer_filter: {
      project_ids: (config.viewer_filter && config.viewer_filter.project_ids) || [],
      sort_by: (config.viewer_filter && config.viewer_filter.sort_by) || 'due_date',
      order_by: (config.viewer_filter && config.viewer_filter.order_by) || 'asc',
      due_date_filter: (config.viewer_filter && config.viewer_filter.due_date_filter) || 'all',
    },
    secondary_projects: Array.isArray(config.secondary_projects) ? config.secondary_projects : [],
  };
}

module.exports = { getConfig, saveConfig, getConfigPath, validateConfig };
