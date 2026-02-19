'use strict';

function unescapeHtml(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function extractNoteLink(description) {
  if (!description) return null;
  const match = description.match(/<!-- notelink:(obsidian:\/\/[^">\s]+) -->/);
  if (!match) return null;
  const nameMatch = description.match(/\u{1F4CE}\s*([^<]+)<\/a>/u);
  const name = nameMatch ? nameMatch[1].trim() : 'Obsidian note';
  return { url: unescapeHtml(match[1]), name, app: 'obsidian' };
}

function extractPageLink(description) {
  if (!description) return null;
  const match = description.match(/<!-- pagelink:(https?:\/\/[^">\s]+) -->/);
  if (!match) return null;
  const titleMatch = description.match(/\u{1F517}\s*([^<]+)<\/a>/u);
  const title = titleMatch ? titleMatch[1].trim() : match[1];
  return { url: unescapeHtml(match[1]), title, app: 'browser' };
}

function extractTaskLink(description) {
  const noteLink = extractNoteLink(description);
  if (noteLink) return { ...noteLink, kind: 'note' };
  const pageLink = extractPageLink(description);
  if (pageLink) return { ...pageLink, kind: 'page' };
  return null;
}

module.exports = { extractNoteLink, extractPageLink, extractTaskLink };
