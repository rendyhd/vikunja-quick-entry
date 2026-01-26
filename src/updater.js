const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');

const CACHE_FILE = 'update-cache.json';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const GITHUB_API_URL =
  'https://api.github.com/repos/rendyhd/vikunja-quick-entry/releases/latest';

function parseVersion(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.replace(/^v/, '');
  const parts = cleaned.split('.');
  if (parts.length !== 3) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0)) return null;
  return { major: nums[0], minor: nums[1], patch: nums[2] };
}

function isNewerVersion(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  if (!r || !l) return false;
  if (r.major !== l.major) return r.major > l.major;
  if (r.minor !== l.minor) return r.minor > l.minor;
  return r.patch > l.patch;
}

function getCachePath() {
  return path.join(app.getPath('userData'), CACHE_FILE);
}

function readCache() {
  try {
    const data = fs.readFileSync(getCachePath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(data), 'utf-8');
  } catch {
    // Silently ignore write failures
  }
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, 10000);

    try {
      const request = net.request({
        method: 'GET',
        url: GITHUB_API_URL,
      });

      request.setHeader('User-Agent', 'vikunja-quick-entry-updater');
      request.setHeader('Accept', 'application/vnd.github.v3+json');

      let responseBody = '';
      let statusCode = 0;

      request.on('response', (response) => {
        statusCode = response.statusCode;

        response.on('data', (chunk) => {
          responseBody += chunk.toString();
        });

        response.on('end', () => {
          clearTimeout(timeout);
          if (statusCode >= 200 && statusCode < 300) {
            try {
              const data = JSON.parse(responseBody);
              resolve({
                tagName: data.tag_name,
                htmlUrl: data.html_url,
              });
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            reject(new Error(`GitHub API returned HTTP ${statusCode}`));
          }
        });
      });

      request.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      request.end();
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

/**
 * Check for updates from GitHub releases.
 * @param {object} callbacks - { onUpdateAvailable(version, url) }
 * @param {boolean} force - Skip cache and fetch fresh data
 */
async function checkForUpdates(callbacks, force = false) {
  const localVersion = app.getVersion();

  if (!force) {
    const cache = readCache();
    if (cache && cache.timestamp) {
      const age = Date.now() - cache.timestamp;
      if (age < CACHE_MAX_AGE_MS && cache.tagName) {
        if (isNewerVersion(cache.tagName, localVersion)) {
          callbacks.onUpdateAvailable(cache.tagName, cache.htmlUrl);
        }
        return;
      }
    }
  }

  const release = await fetchLatestRelease();

  writeCache({
    tagName: release.tagName,
    htmlUrl: release.htmlUrl,
    timestamp: Date.now(),
  });

  if (isNewerVersion(release.tagName, localVersion)) {
    callbacks.onUpdateAvailable(release.tagName, release.htmlUrl);
  }
}

module.exports = { checkForUpdates };
