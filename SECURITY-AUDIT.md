# Security Audit Report — Vikunja Quick Entry

**Date:** 2026-02-27
**Scope:** Full codebase review (all source files, dependencies, build config, extensions)
**Auditor:** Automated security audit

---

## Executive Summary

The application follows Electron security best practices in most areas: all renderer windows use `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and enforce a strict Content Security Policy. IPC channels are properly gated through `contextBridge`. Electron fuses are correctly configured to disable `RunAsNode`, `NodeOptions`, and CLI inspect arguments.

The audit identified **3 medium-severity**, **5 low-severity**, and **4 informational** findings. No critical or high-severity vulnerabilities were found. The most notable issue is that the API token and Obsidian API key are stored in plaintext on disk.

---

## Findings

### MEDIUM Severity

#### M1. Plaintext API Token Storage in Config File

**Location:** `src/config.js:56`, config.json on disk
**Description:** The Vikunja `api_token` and Obsidian `obsidian_api_key` are stored as plaintext strings in `config.json` (either in the app directory or `%APPDATA%`/`~/Library/Application Support/`). Any process or user with read access to the user profile can extract these credentials.
**Impact:** Credential theft by malware, other local users, or through backup file exposure.
**Recommendation:** Use the OS credential store via `safeStorage.encryptString()` / `safeStorage.decryptString()` (available in Electron) or the `keytar` package. At minimum, encrypt the token at rest and decrypt only in memory when needed.

#### M2. Obsidian Local REST API — TLS Certificate Validation Disabled

**Location:** `src/obsidian-client.js:9`
```js
const agent = new https.Agent({ rejectUnauthorized: false });
```
**Description:** The HTTPS agent used for all Obsidian Local REST API connections disables TLS certificate verification. This is intentional (the Obsidian plugin uses a self-signed certificate on localhost), but it means any localhost MITM or port-hijacking process could intercept the Obsidian API key and manipulate note data.
**Impact:** A malicious local process could intercept the Obsidian API key sent as a Bearer token, or inject/modify note content.
**Recommendation:** Pin the expected self-signed certificate at first connection ("trust on first use") or verify the certificate fingerprint matches what the Obsidian Local REST API plugin reports. Alternatively, restrict this agent to connections to `127.0.0.1` only (already done via hardcoded hostname, which is good).

#### M3. `get-full-config` IPC Handler Exposes API Token to Settings Renderer

**Location:** `src/main.js` (IPC handler for `get-full-config`), `src/settings-preload.js:3`
**Description:** The `get-full-config` handler returns the full config including `api_token` and `obsidian_api_key` to the settings renderer. While the settings renderer is sandboxed and has a strict CSP, exposing secrets to any renderer increases attack surface. If a CSP bypass or renderer vulnerability were ever found, these secrets could leak.
**Impact:** Renderer compromise would expose API credentials directly.
**Recommendation:** Never send the raw API token to any renderer. Instead, send a masked version (e.g., `tk_****...last4`) for display. When saving settings, have the renderer send only *changed* fields (or a sentinel like `"__unchanged__"` for the token field), and have the main process merge unchanged fields from the existing config.

---

### LOW Severity

#### L1. `innerHTML` Usage with Escaped Content

**Location:** `src/renderer/renderer-src.js:296-321,340-381`, `src/renderer/autocomplete.js:159-163`, `src/viewer/viewer.js:286,307,628`
**Description:** Multiple locations use `innerHTML` to render dynamic content. The values are consistently passed through `escapeHtml()` or `escapeHighlightText()` which properly encode `&`, `<`, `>`, and `"`. This is correctly handled, but `innerHTML` assignments are inherently riskier than DOM API methods — any future code change that inadvertently skips the escape function would introduce XSS.
**Impact:** Low — currently safe due to consistent escaping. Risk increases with future modifications.
**Recommendation:** Consider migrating high-risk innerHTML assignments to use `document.createElement()` + `textContent` for user-controlled data. The `escapeHtml()` functions are correct and provide adequate protection for now.

#### L2. No Input Length Limits on Task Title/Description

**Location:** `src/renderer/renderer-src.js:439-442`, `src/api.js:82-97`
**Description:** There are no client-side length limits on the task title or description before sending to the Vikunja API. While the server likely enforces limits, extremely long inputs could cause performance issues in the app or API, or trigger unexpected server-side behavior.
**Impact:** Minor — potential performance degradation or unexpected server responses.
**Recommendation:** Add reasonable `maxlength` attributes to the input/textarea elements (e.g., 500 for title, 10000 for description).

#### L3. `shell.openExternal` with `obsidian://` Protocol

**Location:** `src/main.js` (IPC handler for `open-deep-link`)
**Description:** The `open-deep-link` handler allows opening URLs with the `obsidian://` protocol via `shell.openExternal()`. While the URL is validated with `new URL()` and the protocol is checked against an allowlist (`https:`, `http:`, `obsidian:`), the `obsidian://` scheme passes control to an external application (Obsidian) with URI parameters that could potentially trigger unintended actions. The URL originates from task descriptions stored on the Vikunja server.
**Impact:** If an attacker can write to task descriptions on the Vikunja server, they could craft `obsidian://` URIs that trigger actions in Obsidian (e.g., navigating to arbitrary vaults/files). However, this requires server-side compromise.
**Recommendation:** Consider further validating `obsidian://` URLs to only allow known safe paths (`obsidian://open`, `obsidian://advanced-uri`) before passing to `shell.openExternal`.

#### L4. Config File Race Condition

**Location:** `src/config.js:50-57`
**Description:** `saveConfig()` writes the config file non-atomically with `fs.writeFileSync()`. In contrast, `src/cache.js:34-37` correctly uses atomic write (write to `.tmp` then rename). If the app crashes or power is lost during `saveConfig()`, the config file could be left in a truncated/corrupted state.
**Impact:** Potential config file corruption leading to the app not starting until manually fixed.
**Recommendation:** Use the same atomic write pattern as `cache.js` — write to a `.tmp` file first, then `fs.renameSync()` to the final path.

#### L5. No Rate Limiting on IPC Calls from Renderers

**Location:** All IPC handlers in `src/main.js`
**Description:** Renderers can invoke IPC handlers like `save-task`, `mark-task-done`, `fetch-viewer-tasks`, etc. without any rate limiting. A compromised or malfunctioning renderer could flood the main process with requests.
**Impact:** DoS against the main process or excessive API calls to the Vikunja server.
**Recommendation:** Consider adding basic debouncing or rate limiting on sensitive IPC handlers, especially those that make API calls.

---

### INFORMATIONAL

#### I1. Electron Fuses Correctly Configured

**Location:** `scripts/afterPack.js`
**Status:** PASS
The following fuses are correctly disabled:
- `RunAsNode`: false — prevents `ELECTRON_RUN_AS_NODE` abuse
- `EnableNodeOptionsEnvironmentVariable`: false — prevents `NODE_OPTIONS` injection
- `EnableNodeCliInspectArguments`: false — prevents `--inspect` debugging

#### I2. Content Security Policy Is Strict

**Location:** All HTML files (`src/renderer/index.html`, `src/viewer/viewer.html`, `src/settings/settings.html`)
**Status:** PASS
All renderers enforce: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:`
No `unsafe-inline` or `unsafe-eval` directives. This effectively prevents XSS via injected scripts.

#### I3. URL Validation for HTTP Requests

**Location:** `src/api.js:56-66`
**Status:** PASS
All API functions validate URLs with `validateHttpUrl()` which checks for `http:` or `https:` protocols only. This prevents SSRF via `file://`, `javascript:`, or other dangerous protocols.

#### I4. Dependency Vulnerabilities (Build-time Only)

**Location:** `package.json`, `npm audit` output
**Status:** ACCEPTABLE
`npm audit` reports 2 vulnerabilities:
- **minimatch** (high severity, ReDoS) — in `electron-builder` build tooling, not in production runtime
- **ajv** (moderate severity, ReDoS) — in `dmg-license`/`@develar/schema-utils`, build tooling only

Both are in `devDependencies` used only during build/packaging. They do not ship in the production application. The runtime dependencies (`chrono-node`, `koffi`) have no known vulnerabilities.

---

## Architecture Security Review

### Electron Process Model — PASS
- All three renderers (Quick Entry, Quick View, Settings) correctly use `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Each renderer has its own minimal preload script using `contextBridge.exposeInMainWorld()`
- No renderer has direct access to Node.js APIs or the filesystem

### IPC Surface — PASS (with notes)
- Preload scripts expose only the minimum required API surface
- The `get-config` handler (for Quick Entry/Quick View) correctly omits sensitive fields (`api_token`, `obsidian_api_key`)
- The `get-full-config` handler (for Settings) does expose secrets — see M3 above
- `open-external` correctly validates URL protocol (http/https only)
- `open-deep-link` validates against an allowlist of protocols
- `fetch-projects` accepts URL/token from the renderer (needed for settings validation), which is appropriate since it's the settings renderer providing user-input credentials

### HTTP Communication — PASS
- All HTTP calls use Electron's `net.request()` with proper timeout handling
- URL validation prevents non-HTTP(S) requests
- Bearer token is sent via `Authorization` header (not in URL query strings)
- Response bodies are properly parsed with try/catch

### Native Messaging Bridge — PASS
- The `vqe-bridge.js` native messaging host correctly implements the Chrome/Firefox native messaging protocol
- It only writes URL/title data to a file in the app's userData directory
- Context data expires after 3 seconds (`MAX_AGE_MS` in `browser-client.js`)
- The bridge clears context on disconnect/error

### Child Process Execution — ACCEPTABLE
- `window-url-reader.js`: Uses `spawn` with explicit arguments (not shell interpolation) for PowerShell on Windows
- `obsidian-client.js`: Uses `execFile` (not `exec`) for osascript — arguments are hardcoded JXA scripts, not user-controlled
- `browser-host-registration.js`: Uses `execSync` with hardcoded registry paths for Windows native messaging host registration. The `HOST_NAME` constant is hardcoded and safe.

### Data at Rest — SEE M1
- Config file (with API tokens) stored in plaintext
- Cache file (`offline-cache.json`) stores task data in plaintext — acceptable for local task caching
- Both use the standard Electron `userData` directory with OS-default permissions

### Browser Extension — PASS
- Minimal permissions: `tabs` and `nativeMessaging` only
- Properly filters internal browser URLs (chrome://, about:, etc.)
- Heartbeat mechanism ensures context data stays fresh and is cleared when browser loses focus
- Extension communicates only via native messaging to the local bridge process

---

## Summary Table

| ID  | Severity      | Title                                          | Status    |
|-----|---------------|------------------------------------------------|-----------|
| M1  | Medium        | Plaintext API Token Storage                    | Open      |
| M2  | Medium        | Obsidian TLS Validation Disabled               | Open      |
| M3  | Medium        | API Token Exposed to Settings Renderer         | Open      |
| L1  | Low           | innerHTML Usage (properly escaped)             | Acceptable|
| L2  | Low           | No Input Length Limits                          | Open      |
| L3  | Low           | shell.openExternal with obsidian:// Protocol   | Open      |
| L4  | Low           | Config File Non-Atomic Write                   | Open      |
| L5  | Low           | No IPC Rate Limiting                           | Open      |
| I1  | Informational | Electron Fuses Correctly Configured            | Pass      |
| I2  | Informational | CSP Is Strict                                  | Pass      |
| I3  | Informational | URL Validation for HTTP Requests               | Pass      |
| I4  | Informational | Dependency Vulns (Build-time Only)             | Acceptable|

---

## Remediation Priority

1. **M1 — Plaintext API Token Storage** — Highest priority. Use `safeStorage` to encrypt credentials at rest.
2. **L4 — Config File Non-Atomic Write** — Quick fix. Copy the atomic write pattern from `cache.js`.
3. **M3 — Token Exposed to Renderer** — Mask the token in the `get-full-config` response.
4. **M2 — Obsidian TLS Validation** — Consider certificate pinning (complexity vs. risk tradeoff).
5. **L2 — Input Length Limits** — Add `maxlength` attributes to inputs.
6. **L3 — obsidian:// Protocol Validation** — Restrict to known safe URI patterns.
7. **L5 — IPC Rate Limiting** — Add basic debouncing on API-calling IPC handlers.
