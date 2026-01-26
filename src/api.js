const { net } = require('electron');
const { getConfig } = require('./config');

function createTask(title) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const url = `${config.vikunja_url}/api/v1/projects/${config.default_project_id}/tasks`;

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
              const body = JSON.parse(responseBody);
              if (body.message) errorMsg = body.message;
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

      request.write(JSON.stringify({ title }));
      request.end();
    } catch (err) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message || 'Request failed' });
    }
  });
}

module.exports = { createTask };
