const { net } = require('electron');
const { getConfig } = require('./config');

function validateHttpUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP(S) URLs are supported' };
    }
    return { valid: true, parsed };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}

function createTask(title, description) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const url = `${config.vikunja_url}/api/v1/projects/${config.default_project_id}/tasks`;

  const validation = validateHttpUrl(url);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  const body = { title };
  if (description) {
    body.description = description;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Request timed out (5s)' });
    }, 5000);

    try {
      const request = net.request({
        method: 'PUT',
        url,
      });

      request.setHeader('Authorization', `Bearer ${config.api_token}`);
      request.setHeader('Content-Type', 'application/json');

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
              const task = JSON.parse(responseBody);
              resolve({ success: true, task });
            } catch {
              resolve({ success: true, task: null });
            }
          } else {
            let errorMsg = `HTTP ${statusCode}`;
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed.message) errorMsg = parsed.message;
            } catch {
              // use status code message
            }
            resolve({ success: false, error: errorMsg });
          }
        });
      });

      request.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message || 'Network error' });
      });

      request.write(JSON.stringify(body));
      request.end();
    } catch (err) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message || 'Request failed' });
    }
  });
}

function fetchProjects(url, token) {
  const validation = validateHttpUrl(url);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  const apiUrl = `${url.replace(/\/+$/, '')}/api/v1/projects`;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Request timed out (5s)' });
    }, 5000);

    try {
      const request = net.request({
        method: 'GET',
        url: apiUrl,
      });

      request.setHeader('Authorization', `Bearer ${token}`);
      request.setHeader('Content-Type', 'application/json');

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
              const projects = JSON.parse(responseBody);
              resolve({
                success: true,
                projects: projects.map((p) => ({ id: p.id, title: p.title })),
              });
            } catch {
              resolve({ success: false, error: 'Invalid response' });
            }
          } else {
            let errorMsg = `HTTP ${statusCode}`;
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed.message) errorMsg = parsed.message;
            } catch {
              // use status code message
            }
            resolve({ success: false, error: errorMsg });
          }
        });
      });

      request.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message || 'Network error' });
      });

      request.end();
    } catch (err) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message || 'Request failed' });
    }
  });
}

module.exports = { createTask, fetchProjects };
