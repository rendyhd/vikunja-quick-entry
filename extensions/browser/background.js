'use strict';

// Cross-browser compatibility: Firefox uses browser.*, Chrome uses chrome.*
const api = typeof browser !== 'undefined' ? browser : chrome;

const HOST_NAME = 'com.vikunja_quick_entry.browser';

let port = null;
let reconnectTimeout = null;
let reconnectDelay = 5000;
let heartbeatTimer = null;

// Heartbeat: re-send current tab every 2s so the context file stays fresh.
// The Electron reader (browser-client.js) rejects context older than 3s,
// so without this, detection fails when the user sits on one tab.
const HEARTBEAT_INTERVAL = 2000;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => sendCurrentTab(), HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function connect() {
  try {
    port = api.runtime.connectNative(HOST_NAME);
    reconnectDelay = 5000; // reset on successful connect

    port.onDisconnect.addListener(() => {
      const error = api.runtime.lastError;
      if (error) {
        console.debug('Native host disconnected:', error.message || error);
      }
      port = null;
      stopHeartbeat();
      scheduleReconnect();
    });

    // Send current tab immediately on connect, then keep it fresh
    sendCurrentTab();
    startHeartbeat();
  } catch (err) {
    console.debug('Native host connect failed:', err);
    port = null;
    stopHeartbeat();
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, reconnectDelay);
  // Exponential backoff: 5s → 10s, capped at 60s
  reconnectDelay = Math.min(reconnectDelay * 2, 60000);
}

function isInternalUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|about|edge|moz-extension|brave|devtools|view-source):/i.test(url);
}

function sendMessage(msg) {
  if (!port) return;
  try {
    port.postMessage(msg);
  } catch {
    port = null;
  }
}

function sendCurrentTab() {
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Check lastError to prevent "unchecked runtime.lastError" warnings
    if (api.runtime.lastError || !tabs || tabs.length === 0) {
      sendMessage({ type: 'clear' });
      return;
    }
    const tab = tabs[0];
    if (!tab.url || isInternalUrl(tab.url)) {
      sendMessage({ type: 'clear' });
    } else {
      sendMessage({ type: 'tab', url: tab.url, title: tab.title || '' });
    }
  });
}

// Track tab switches
api.tabs.onActivated.addListener(() => sendCurrentTab());

// Track URL/title changes on the active tab
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.title) {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (api.runtime.lastError) return;
      if (tabs && tabs[0] && tabs[0].id === tabId) {
        sendCurrentTab();
      }
    });
  }
});

// Track window focus changes — stop heartbeat when browser loses focus
// so the context file stays cleared and doesn't leak into other apps.
api.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === api.windows.WINDOW_ID_NONE) {
    stopHeartbeat();
    sendMessage({ type: 'clear' });
  } else {
    sendCurrentTab();
    startHeartbeat();
  }
});

connect();
