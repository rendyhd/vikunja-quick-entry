const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const CONFIG_FILENAME = 'config.json';
const ENCRYPTED_PREFIX = 'enc:';
const SENSITIVE_KEYS = ['api_token', 'obsidian_api_key'];

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

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptValue(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext; // already encrypted
  if (!isEncryptionAvailable()) return plaintext;
  try {
    const encrypted = safeStorage.encryptString(plaintext);
    return ENCRYPTED_PREFIX + encrypted.toString('base64');
  } catch {
    return plaintext;
  }
}

function decryptValue(storedValue) {
  if (!storedValue || typeof storedValue !== 'string') return storedValue;
  if (!storedValue.startsWith(ENCRYPTED_PREFIX)) return storedValue; // plaintext passthrough
  try {
    const ciphertext = Buffer.from(storedValue.slice(ENCRYPTED_PREFIX.length), 'base64');
    return safeStorage.decryptString(ciphertext);
  } catch {
    return ''; // decryption failed — user must re-enter token
  }
}

function loadConfig() {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);

    // Decrypt sensitive fields in memory
    let needsMigration = false;
    for (const key of SENSITIVE_KEYS) {
      if (config[key] && typeof config[key] === 'string') {
        if (!config[key].startsWith(ENCRYPTED_PREFIX) && isEncryptionAvailable()) {
          needsMigration = true;
        }
        config[key] = decryptValue(config[key]);
      }
    }

    if (!validateConfig(config)) return null;

    // Auto-migrate plaintext tokens to encrypted form
    if (needsMigration) {
      saveConfig(config);
    }

    return config;
  } catch {
    return null;
  }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') return false;
  // Standalone mode doesn't require server credentials
  if (config.standalone_mode === true) return true;
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

  // Shallow copy to avoid mutating the caller's object
  const toWrite = { ...config };
  for (const key of SENSITIVE_KEYS) {
    if (toWrite[key] && typeof toWrite[key] === 'string') {
      toWrite[key] = encryptValue(toWrite[key]);
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(toWrite, null, 2), 'utf-8');
}

function getConfig() {
  const config = loadConfig();
  if (!config) return null;

  return {
    vikunja_url: config.vikunja_url ? config.vikunja_url.replace(/\/+$/, '') : '', // strip trailing slashes
    api_token: config.api_token || '',
    default_project_id: config.default_project_id ? Number(config.default_project_id) : 0,
    hotkey: config.hotkey || 'Alt+Shift+V',
    launch_on_startup: config.launch_on_startup === true,
    exclamation_today: config.exclamation_today !== false,
    auto_check_updates: config.auto_check_updates !== false,
    standalone_mode: config.standalone_mode === true,
    // Quick Entry settings
    project_cycle_modifier: config.project_cycle_modifier || 'ctrl',
    entry_position: config.entry_position || null,
    // Quick View settings
    viewer_hotkey: config.viewer_hotkey || 'Alt+Shift+B',
    viewer_position: config.viewer_position || null,
    viewer_filter: {
      project_ids: (config.viewer_filter && config.viewer_filter.project_ids) || [],
      sort_by: (config.viewer_filter && config.viewer_filter.sort_by) || 'due_date',
      order_by: (config.viewer_filter && config.viewer_filter.order_by) || 'asc',
      due_date_filter: (config.viewer_filter && config.viewer_filter.due_date_filter) || 'all',
      include_today_all_projects: (config.viewer_filter && config.viewer_filter.include_today_all_projects) === true,
    },
    secondary_projects: Array.isArray(config.secondary_projects) ? config.secondary_projects : [],
    theme: config.theme || 'system',
    // Obsidian integration
    obsidian_mode: config.obsidian_mode || 'off',
    obsidian_api_key: config.obsidian_api_key || '',
    obsidian_port: config.obsidian_port || 27124,
    obsidian_vault_name: config.obsidian_vault_name || '',
    // NLP parser
    nlp_enabled: config.nlp_enabled !== false,
    nlp_syntax_mode: config.nlp_syntax_mode || 'todoist',
    // Browser integration
    browser_link_mode: config.browser_link_mode || 'off',
    browser_extension_id: config.browser_extension_id || '',
    // Notification settings
    notifications_enabled: config.notifications_enabled === true,
    notifications_persistent: config.notifications_persistent === true,
    notifications_daily_reminder_enabled: config.notifications_daily_reminder_enabled !== false,
    notifications_daily_reminder_time: config.notifications_daily_reminder_time || '08:00',
    notifications_secondary_reminder_enabled: config.notifications_secondary_reminder_enabled === true,
    notifications_secondary_reminder_time: config.notifications_secondary_reminder_time || '16:00',
    notifications_overdue_enabled: config.notifications_overdue_enabled !== false,
    notifications_due_today_enabled: config.notifications_due_today_enabled !== false,
    notifications_upcoming_enabled: config.notifications_upcoming_enabled === true,
    notifications_sound: config.notifications_sound !== false,
  };
}

module.exports = { getConfig, saveConfig, getConfigPath, validateConfig, isEncryptionAvailable };
