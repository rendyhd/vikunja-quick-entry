'use strict';

const { app } = require('electron');
const { execSync } = require('child_process');
const { existsSync, writeFileSync, unlinkSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');

const HOST_NAME = 'com.vikunja-quick-entry.browser';

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

function registerChromeHost(extensionId) {
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
  if (process.platform !== 'win32') return;
  const chromePath = getChromeHostManifestPath();
  const firefoxPath = getFirefoxHostManifestPath();
  try { unlinkSync(chromePath); } catch { /* ignore */ }
  try { unlinkSync(firefoxPath); } catch { /* ignore */ }
  try { execSync(`reg delete "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /f`, { stdio: 'ignore' }); } catch { /* ignore */ }
  try { execSync(`reg delete "HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}" /f`, { stdio: 'ignore' }); } catch { /* ignore */ }
}

function isRegistered() {
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
