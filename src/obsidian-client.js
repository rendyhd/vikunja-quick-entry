'use strict';

const https = require('node:https');
const crypto = require('node:crypto');

const OBSIDIAN_TIMEOUT = 300;

// Use Node https with rejectUnauthorized:false scoped to Obsidian only
const agent = new https.Agent({ rejectUnauthorized: false });

function obsidianRequest(method, apiKey, port, reqPath, body, contentType) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), OBSIDIAN_TIMEOUT);

    try {
      const options = {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        agent,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/vnd.olrapi.note+json',
          ...(contentType ? { 'Content-Type': contentType } : {}),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          clearTimeout(timeout);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          } else {
            if (res.statusCode === 401) console.warn('Obsidian: bad API key');
            resolve(null);
          }
        });
      });

      req.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });

      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

function getActiveNote(apiKey, port = 27124) {
  return obsidianRequest('GET', apiKey, port, '/active/');
}

function injectUID(apiKey, uid, port = 27124) {
  return obsidianRequest(
    'PATCH',
    apiKey,
    port,
    '/active/',
    { frontmatter: { uid } },
    'application/vnd.olrapi.note+json'
  ).then((result) => result !== null);
}

function testObsidianConnection(apiKey, port = 27124) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ reachable: false }), OBSIDIAN_TIMEOUT * 2);

    try {
      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/active/',
        method: 'GET',
        agent,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/vnd.olrapi.note+json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          clearTimeout(timeout);
          if (res.statusCode === 401) {
            resolve({ reachable: false });
            return;
          }
          // 404 means server is reachable but no note is open
          if (res.statusCode === 404) {
            resolve({ reachable: true });
            return;
          }
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(data);
              resolve({ reachable: true, noteName: parsed.path });
            } catch {
              resolve({ reachable: true });
            }
          } else {
            resolve({ reachable: false });
          }
        });
      });

      req.on('error', () => {
        clearTimeout(timeout);
        resolve({ reachable: false });
      });

      req.end();
    } catch {
      clearTimeout(timeout);
      resolve({ reachable: false });
    }
  });
}

// --- macOS foreground detection via osascript/JXA ---
const { execFile } = require('child_process');

const JXA_FOREGROUND_SCRIPT = `(() => {
  const se = Application("System Events");
  const procs = se.processes.whose({frontmost: true});
  if (procs.length === 0) return "null";
  const proc = procs[0];
  const name = proc.displayedName();
  let bid = ""; try { bid = proc.bundleIdentifier(); } catch(e) {}
  return JSON.stringify({ processName: name, bundleId: bid });
})()`;

function getForegroundAppMacOS() {
  return new Promise((resolve) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', JXA_FOREGROUND_SCRIPT],
      { timeout: 2000 }, (err, stdout) => {
        if (err) { resolve(null); return; }
        try {
          const result = JSON.parse(stdout.trim());
          if (result === null) { resolve(null); return; }
          resolve(result);
        } catch { resolve(null); }
      });
  });
}

// --- Win32 FFI for foreground window detection ---
let _fgCheckLoaded = false;
let _GetForegroundWindow = null;
let _GetWindowThreadProcessId = null;
let _OpenProcess = null;
let _QueryFullProcessImageNameW = null;
let _CloseHandle = null;

function loadForegroundCheck() {
  if (_fgCheckLoaded) return _GetForegroundWindow !== null;
  _fgCheckLoaded = true;
  if (process.platform !== 'win32') return false;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    _GetForegroundWindow = user32.func('void* __stdcall GetForegroundWindow()');
    _GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)');
    _OpenProcess = kernel32.func('void* __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)');
    _QueryFullProcessImageNameW = kernel32.func('int __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, _Out_ str16 *lpExeName, _Inout_ uint32_t *lpdwSize)');
    _CloseHandle = kernel32.func('int __stdcall CloseHandle(void *hObject)');
    return true;
  } catch (err) {
    console.warn('Failed to load koffi for foreground window check:', err);
    return false;
  }
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

// Internal sync helper — Windows only, used by the async exports
function getForegroundProcessNameSync() {
  if (!loadForegroundCheck()) return '';
  try {
    const hwnd = _GetForegroundWindow();
    if (!hwnd) return '';

    const pidOut = [0];
    _GetWindowThreadProcessId(hwnd, pidOut);
    const pid = pidOut[0];
    if (!pid) return '';

    const hProcess = _OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if (!hProcess) return '';

    const pathBuf = Buffer.alloc(520); // MAX_PATH * 2 for UTF-16
    const sizeOut = [260]; // MAX_PATH
    const ok = _QueryFullProcessImageNameW(hProcess, 0, pathBuf, sizeOut);
    _CloseHandle(hProcess);

    if (!ok) return '';
    const exePath = pathBuf.toString('utf16le', 0, sizeOut[0] * 2).replace(/\0+$/, '');
    const exeName = exePath.split('\\').pop() || '';
    return exeName.replace(/\.exe$/i, '').toLowerCase();
  } catch {
    return '';
  }
}

// Async on all platforms — Windows wraps sync koffi (~1μs), macOS uses osascript (~50ms)
async function getForegroundProcessName() {
  if (process.platform === 'win32') {
    return getForegroundProcessNameSync();
  }

  if (process.platform === 'darwin') {
    const app = await getForegroundAppMacOS();
    return app ? app.processName : '';
  }

  return '';
}

async function isObsidianForeground() {
  if (process.platform === 'win32') {
    return getForegroundProcessNameSync() === 'obsidian';
  }

  if (process.platform === 'darwin') {
    const app = await getForegroundAppMacOS();
    if (!app) return false;
    return app.processName === 'Obsidian' || app.bundleId === 'md.obsidian';
  }

  return false;
}

async function getObsidianContext(config) {
  if (!config) return null;
  if (config.obsidian_mode === 'off') return null;
  if (!config.obsidian_api_key) return null;

  const port = config.obsidian_port || 27124;
  const note = await getActiveNote(config.obsidian_api_key, port);
  if (!note) return null;

  const vaultName = config.obsidian_vault_name || '';
  const notePath = note.path || '';
  const noteName = notePath.replace(/\.md$/i, '').split('/').pop() || 'Untitled';

  let uid = (note.frontmatter && note.frontmatter.uid) || '';
  let isUidBased = false;

  if (uid) {
    isUidBased = true;
  } else {
    // Try to inject a UID
    uid = crypto.randomUUID();
    const injected = await injectUID(config.obsidian_api_key, uid, port);
    if (injected) {
      isUidBased = true;
    } else {
      // Fall back to path-based URI
      uid = '';
      isUidBased = false;
    }
  }

  let deepLink;
  if (isUidBased) {
    deepLink = `obsidian://advanced-uri?vault=${encodeURIComponent(vaultName)}&uid=${encodeURIComponent(uid)}`;
  } else {
    const pathWithoutMd = notePath.replace(/\.md$/i, '');
    deepLink = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(pathWithoutMd)}`;
  }

  return { deepLink, noteName, vaultName, isUidBased };
}

module.exports = {
  getForegroundProcessName,
  isObsidianForeground,
  getActiveNote,
  injectUID,
  testObsidianConnection,
  getObsidianContext,
};
