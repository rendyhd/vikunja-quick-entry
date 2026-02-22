'use strict';

const { app } = require('electron');
const { execSync } = require('child_process');
const { existsSync, writeFileSync, unlinkSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const os = require('os');

const HOST_NAME = 'com.vikunja_quick_entry.browser';
const homedir = os.homedir();

function getBridgePath() {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'native-messaging-host', 'vqe-bridge.js');
  }
  return join(app.getAppPath(), 'resources', 'native-messaging-host', 'vqe-bridge.js');
}

function getBatWrapperPath() {
  return join(dirname(getBridgePath()), 'vqe-bridge.bat');
}

function ensureBatWrapper() {
  const batPath = getBatWrapperPath();
  if (!existsSync(batPath)) {
    const dir = dirname(batPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(batPath, '@echo off\r\nnode "%~dp0\\vqe-bridge.js"\r\n', 'utf-8');
  }
  return batPath;
}

function getChromeHostManifestPath() {
  return join(app.getPath('userData'), `${HOST_NAME}.json`);
}

function getFirefoxHostManifestPath() {
  return join(app.getPath('userData'), `${HOST_NAME}.firefox.json`);
}

// --- macOS manifest paths ---
function getMacChromeHostDir() {
  return join(homedir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
}

function getMacFirefoxHostDir() {
  return join(homedir, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts');
}

function getMacEdgeHostDir() {
  return join(homedir, 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts');
}

function getMacManifestPath(browserDir) {
  return join(browserDir, `${HOST_NAME}.json`);
}

function ensureShellWrapper() {
  // On macOS, create wrapper in userData (outside app bundle to preserve code signature)
  // Resolve full node path at registration time — macOS GUI apps (like Firefox) have a
  // minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that won't find node installed via
  // Homebrew, nvm, fnm, etc.
  const shPath = join(app.getPath('userData'), 'vqe-bridge.sh');
  const bridgeJs = getBridgePath();
  let nodePath = '/usr/bin/env node';
  try {
    const resolved = execSync('which node', { timeout: 3000 }).toString().trim();
    if (resolved) nodePath = resolved;
  } catch { /* fallback to env node */ }
  const content = `#!/bin/bash\nexec "${nodePath}" "${bridgeJs}"\n`;
  writeFileSync(shPath, content, { mode: 0o755 });
  return shPath;
}

function registerChromeHost(extensionId) {
  if (process.platform === 'darwin') {
    const hostPath = ensureShellWrapper();
    const manifest = {
      name: HOST_NAME,
      description: 'Vikunja Quick Entry Browser Link native messaging bridge',
      path: hostPath,
      type: 'stdio',
      allowed_origins: extensionId ? [`chrome-extension://${extensionId}/`] : [],
    };

    // Register for Chrome
    const chromeDir = getMacChromeHostDir();
    mkdirSync(chromeDir, { recursive: true });
    writeFileSync(getMacManifestPath(chromeDir), JSON.stringify(manifest, null, 2), 'utf-8');

    // Also register for Edge (same manifest format)
    const edgeDir = getMacEdgeHostDir();
    mkdirSync(edgeDir, { recursive: true });
    writeFileSync(getMacManifestPath(edgeDir), JSON.stringify(manifest, null, 2), 'utf-8');
    return;
  }

  if (process.platform !== 'win32') return;
  const hostPath = ensureBatWrapper();
  const manifestPath = getChromeHostManifestPath();
  const manifest = {
    name: HOST_NAME,
    description: 'Vikunja Quick Entry Browser Link native messaging bridge',
    path: hostPath,
    type: 'stdio',
    allowed_origins: extensionId ? [`chrome-extension://${extensionId}/`] : [],
  };
  const dir = dirname(manifestPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  try {
    execSync(`reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /ve /d "${manifestPath}" /f`, { stdio: 'ignore' });
  } catch { /* ignore */ }
}

function registerFirefoxHost() {
  if (process.platform === 'darwin') {
    const hostPath = ensureShellWrapper();
    const manifest = {
      name: HOST_NAME,
      description: 'Vikunja Quick Entry Browser Link native messaging bridge',
      path: hostPath,
      type: 'stdio',
      allowed_extensions: ['browser-link@vikunja-quick-entry.app'],
    };

    const firefoxDir = getMacFirefoxHostDir();
    mkdirSync(firefoxDir, { recursive: true });
    writeFileSync(getMacManifestPath(firefoxDir), JSON.stringify(manifest, null, 2), 'utf-8');
    return;
  }

  if (process.platform !== 'win32') return;
  const hostPath = ensureBatWrapper();
  const manifestPath = getFirefoxHostManifestPath();
  const manifest = {
    name: HOST_NAME,
    description: 'Vikunja Quick Entry Browser Link native messaging bridge',
    path: hostPath,
    type: 'stdio',
    allowed_extensions: ['browser-link@vikunja-quick-entry.app'],
  };
  const dir = dirname(manifestPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  try {
    execSync(`reg add "HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}" /ve /d "${manifestPath}" /f`, { stdio: 'ignore' });
  } catch { /* ignore */ }
}

function unregisterHosts() {
  if (process.platform === 'darwin') {
    // Remove manifests
    try { unlinkSync(getMacManifestPath(getMacChromeHostDir())); } catch { /* ignore */ }
    try { unlinkSync(getMacManifestPath(getMacFirefoxHostDir())); } catch { /* ignore */ }
    try { unlinkSync(getMacManifestPath(getMacEdgeHostDir())); } catch { /* ignore */ }
    // Remove shell wrapper
    try { unlinkSync(join(app.getPath('userData'), 'vqe-bridge.sh')); } catch { /* ignore */ }
    return;
  }

  if (process.platform !== 'win32') return;
  const chromePath = getChromeHostManifestPath();
  const firefoxPath = getFirefoxHostManifestPath();
  try { unlinkSync(chromePath); } catch { /* ignore */ }
  try { unlinkSync(firefoxPath); } catch { /* ignore */ }
  try { execSync(`reg delete "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /f`, { stdio: 'ignore' }); } catch { /* ignore */ }
  try { execSync(`reg delete "HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}" /f`, { stdio: 'ignore' }); } catch { /* ignore */ }
}

function isRegistered() {
  if (process.platform === 'darwin') {
    return {
      chrome: existsSync(getMacManifestPath(getMacChromeHostDir())),
      firefox: existsSync(getMacManifestPath(getMacFirefoxHostDir())),
    };
  }

  if (process.platform !== 'win32') return { chrome: false, firefox: false };
  return {
    chrome: existsSync(getChromeHostManifestPath()),
    firefox: existsSync(getFirefoxHostManifestPath()),
  };
}

function registerHosts(opts) {
  if (opts.chromeExtensionId) registerChromeHost(opts.chromeExtensionId);
  registerFirefoxHost();
}

module.exports = { getBridgePath, registerChromeHost, registerFirefoxHost, unregisterHosts, isRegistered, registerHosts };
