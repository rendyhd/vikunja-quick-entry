const { net } = require('electron');
const { getConfig } = require('./config');

function describeHttpError(statusCode, responseBody) {
  // Try to extract server message first
  try {
    const parsed = JSON.parse(responseBody);
    if (parsed.message) return parsed.message;
  } catch {
    // fall through to status code mapping
  }

  switch (statusCode) {
    case 401:
      return 'Unauthorized \u2014 API token is invalid or expired. Check Settings.';
    case 403:
      return 'Forbidden \u2014 your API token lacks permission for this action.';
    case 404:
      return 'Not found \u2014 the task or project may have been deleted.';
    default:
      if (statusCode >= 500) {
        return 'Server error \u2014 Vikunja may be experiencing issues.';
      }
      return `HTTP ${statusCode}`;
  }
}

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

function createTask(title, description, dueDate) {
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
  if (dueDate) {
    body.due_date = dueDate;
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

function fetchTasks(filterParams) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const baseUrl = `${config.vikunja_url}/api/v1/tasks`;

  const validation = validateHttpUrl(baseUrl);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  // Build query parameters
  const params = new URLSearchParams();
  params.set('per_page', String(filterParams.per_page || 10));
  params.set('page', String(filterParams.page || 1));

  // Build filter string parts
  const filterParts = [];

  // Always filter for open tasks
  filterParts.push('done = false');

  // Project filter
  if (filterParams.project_ids && filterParams.project_ids.length > 0) {
    if (filterParams.project_ids.length === 1) {
      filterParts.push(`project_id = ${filterParams.project_ids[0]}`);
    } else {
      const projectConditions = filterParams.project_ids.map(id => `project_id = ${id}`).join(' || ');
      filterParts.push(`(${projectConditions})`);
    }
  }

  // Due date filter
  if (filterParams.due_date_filter && filterParams.due_date_filter !== 'all') {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (filterParams.due_date_filter) {
      case 'overdue':
        filterParts.push(`due_date < '${todayStart.toISOString()}'`);
        filterParts.push(`due_date != '0001-01-01T00:00:00Z'`);
        break;
      case 'today':
        filterParts.push(`due_date <= '${todayEnd.toISOString()}'`);
        filterParts.push(`due_date != '0001-01-01T00:00:00Z'`);
        break;
      case 'this_week': {
        const weekEnd = new Date(todayStart);
        weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
        weekEnd.setHours(23, 59, 59);
        filterParts.push(`due_date <= '${weekEnd.toISOString()}'`);
        filterParts.push(`due_date != '0001-01-01T00:00:00Z'`);
        break;
      }
      case 'this_month': {
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        filterParts.push(`due_date <= '${monthEnd.toISOString()}'`);
        filterParts.push(`due_date != '0001-01-01T00:00:00Z'`);
        break;
      }
      case 'has_due_date':
        filterParts.push(`due_date != '0001-01-01T00:00:00Z'`);
        break;
      case 'no_due_date':
        filterParts.push(`due_date = '0001-01-01T00:00:00Z'`);
        break;
    }
  }

  if (filterParts.length > 0) {
    params.set('filter', filterParts.join(' && '));
  }

  // Sort
  const sortBy = filterParams.sort_by || 'due_date';
  const orderBy = filterParams.order_by || 'asc';
  params.set('sort_by', sortBy);
  params.set('order_by', orderBy);

  // Include nulls at end when sorting by due_date
  if (sortBy === 'due_date') {
    params.set('filter_include_nulls', 'true');
  }

  const fullUrl = `${baseUrl}?${params.toString()}`;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Request timed out (5s)' });
    }, 5000);

    try {
      const request = net.request({
        method: 'GET',
        url: fullUrl,
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
              const tasks = JSON.parse(responseBody);
              resolve({ success: true, tasks });
            } catch {
              resolve({ success: false, error: 'Invalid response' });
            }
          } else {
            resolve({ success: false, error: describeHttpError(statusCode, responseBody) });
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

function markTaskDone(taskId) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const url = `${config.vikunja_url}/api/v1/tasks/${taskId}`;

  const validation = validateHttpUrl(url);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  const body = { done: true };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Request timed out (5s)' });
    }, 5000);

    try {
      const request = net.request({
        method: 'POST',
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
            resolve({ success: false, error: describeHttpError(statusCode, responseBody) });
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

function markTaskUndone(taskId) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const url = `${config.vikunja_url}/api/v1/tasks/${taskId}`;

  const validation = validateHttpUrl(url);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  const body = { done: false };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Request timed out (5s)' });
    }, 5000);

    try {
      const request = net.request({
        method: 'POST',
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
            resolve({ success: false, error: describeHttpError(statusCode, responseBody) });
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

module.exports = { createTask, fetchProjects, fetchTasks, markTaskDone, markTaskUndone };
