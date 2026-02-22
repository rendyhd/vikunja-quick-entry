'use strict';

const { app } = require('electron');
const { readFileSync } = require('fs');
const { join } = require('path');

const MAX_AGE_MS = 3000;

function getContextFilePath() {
  return join(app.getPath('userData'), 'browser-context.json');
}

function getBrowserContext() {
  try {
    const raw = readFileSync(getContextFilePath(), 'utf-8');
    const data = JSON.parse(raw);
    if (!data.url || typeof data.url !== 'string') return null;
    if (typeof data.timestamp === 'number' && Date.now() - data.timestamp > MAX_AGE_MS) return null;

    const title = typeof data.title === 'string' ? data.title : data.url;
    const displayTitle = title.length > 40 ? title.slice(0, 37) + '...' : title;

    return { url: data.url, title, displayTitle };
  } catch {
    return null;
  }
}

module.exports = { getBrowserContext };
