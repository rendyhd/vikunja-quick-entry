const { net } = require('electron');
const { getConfig } = require('./config');

// Friendly error overrides for known unhelpful server messages
const FRIENDLY_ERROR_OVERRIDES = [
  {
    pattern: /missing,?\s*malformed,?\s*expired\s*or\s*otherwise\s*invalid\s*token/i,
    message: 'API token is invalid or expired. Generate a new token in Vikunja (Settings > API Tokens).',
  },
  {
    pattern: /token.*(?:lacks?|insufficient|no)\s*permission/i,
    message: 'API token has insufficient permissions. Create a new token with read/write access to tasks and projects.',
  },
];

function getFriendlyError(serverMessage) {
  if (!serverMessage) return null;
  for (const { pattern, message } of FRIENDLY_ERROR_OVERRIDES) {
    if (pattern.test(serverMessage)) return message;
  }
  return null;
}

function describeHttpError(statusCode, responseBody) {
  // Try to extract server message first
  let serverMessage = null;
  try {
    const parsed = JSON.parse(responseBody);
    if (parsed.message) serverMessage = parsed.message;
  } catch {
    // fall through to status code mapping
  }

  // Check for friendly override first
  const friendly = getFriendlyError(serverMessage);
  if (friendly) return friendly;

  // Fall back to status code messages
  switch (statusCode) {
    case 401:
      return 'API token is invalid or expired. Check Settings or generate a new token in Vikunja.';
    case 403:
      return 'API token lacks permission. Ensure your token has read/write access to tasks and projects.';
    case 404:
      return 'Not found \u2014 the task or project may have been deleted.';
    default:
      // If server message exists but no override, show it
      if (serverMessage) return serverMessage;
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

function createTask(title, description, dueDate, projectId) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const targetProjectId = projectId || config.default_project_id;
  const url = `${config.vikunja_url}/api/v1/projects/${targetProjectId}/tasks`;

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

  // Date calculations for filters
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const hasProjects = filterParams.project_ids && filterParams.project_ids.length > 0;
  const includeTodayAllProjects = filterParams.include_today_all_projects === true;

  // Build project filter clause
  let projectClause = null;
  if (hasProjects) {
    if (filterParams.project_ids.length === 1) {
      projectClause = `project_id = ${filterParams.project_ids[0]}`;
    } else {
      const projectConditions = filterParams.project_ids.map(id => `project_id = ${id}`).join(' || ');
      projectClause = `(${projectConditions})`;
    }
  }

  // Build due date filter clause
  let dueDateClause = null;
  if (filterParams.due_date_filter && filterParams.due_date_filter !== 'all') {
    switch (filterParams.due_date_filter) {
      case 'overdue':
        dueDateClause = `due_date < '${todayStart.toISOString()}' && due_date != '0001-01-01T00:00:00Z'`;
        break;
      case 'today':
        dueDateClause = `due_date <= '${todayEnd.toISOString()}' && due_date != '0001-01-01T00:00:00Z'`;
        break;
      case 'this_week': {
        const weekEnd = new Date(todayStart);
        weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
        weekEnd.setHours(23, 59, 59);
        dueDateClause = `due_date <= '${weekEnd.toISOString()}' && due_date != '0001-01-01T00:00:00Z'`;
        break;
      }
      case 'this_month': {
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        dueDateClause = `due_date <= '${monthEnd.toISOString()}' && due_date != '0001-01-01T00:00:00Z'`;
        break;
      }
      case 'has_due_date':
        dueDateClause = `due_date != '0001-01-01T00:00:00Z'`;
        break;
      case 'no_due_date':
        dueDateClause = `due_date = '0001-01-01T00:00:00Z'`;
        break;
    }
  }

  // Build "due today" clause for union mode
  // Must exclude null due dates (0001-01-01T00:00:00Z) to prevent showing tasks without due dates
  const dueTodayClause = `due_date >= '${todayStart.toISOString()}' && due_date <= '${todayEnd.toISOString()}' && due_date != '0001-01-01T00:00:00Z'`;

  // Build the final filter string
  // Normal mode: done = false && project_filter && due_date_filter
  // Union mode (when include_today_all_projects && hasProjects):
  //   done = false && ((project_filter && due_date_filter) || due_today_clause)
  let filterString = 'done = false';

  // Track if we're in union mode (affects filter_include_nulls handling)
  let isUnionMode = false;

  if (includeTodayAllProjects && hasProjects) {
    // Union mode: combine normal filters with "due today from any project"
    isUnionMode = true;
    const normalFilterParts = [];
    if (projectClause) normalFilterParts.push(projectClause);
    if (dueDateClause) normalFilterParts.push(dueDateClause);

    // Build clause to include tasks with null due_date from selected project
    // (needed because we'll disable filter_include_nulls in union mode)
    const nullDueDateFromProject = projectClause
      ? `(${projectClause} && due_date = '0001-01-01T00:00:00Z')`
      : null;

    if (normalFilterParts.length > 0) {
      const normalFilter = normalFilterParts.join(' && ');
      // Include: normal filter results OR null due dates from selected project OR due today from any project
      if (nullDueDateFromProject && !dueDateClause) {
        // Only add null clause when due_date_filter is "All" (no dueDateClause)
        filterString += ` && ((${normalFilter}) || ${nullDueDateFromProject} || (${dueTodayClause}))`;
      } else {
        filterString += ` && ((${normalFilter}) || (${dueTodayClause}))`;
      }
    } else {
      // No project or due date filter, just add due today clause
      filterString += ` && (${dueTodayClause})`;
    }
  } else {
    // Normal mode: just chain the filters
    if (projectClause) filterString += ` && ${projectClause}`;
    if (dueDateClause) filterString += ` && ${dueDateClause}`;
  }

  params.set('filter', filterString);

  // Sort
  const sortBy = filterParams.sort_by || 'due_date';
  const orderBy = filterParams.order_by || 'asc';
  params.set('sort_by', sortBy);
  params.set('order_by', orderBy);

  // Include nulls at end when sorting by due_date
  // BUT disable in union mode - we handle nulls explicitly in the filter to prevent
  // tasks without due dates from other projects being included
  if (sortBy === 'due_date' && !isUnionMode) {
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

function markTaskDone(taskId, taskData) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const url = `${config.vikunja_url}/api/v1/tasks/${taskId}`;

  const validation = validateHttpUrl(url);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  // Include original task data to prevent Vikunja from zeroing fields (Go zero-value problem).
  // When only { done: true } is sent, fields like due_date and priority get reset to zero values.
  const body = { ...taskData, done: true };

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

function markTaskUndone(taskId, taskData) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const url = `${config.vikunja_url}/api/v1/tasks/${taskId}`;

  const validation = validateHttpUrl(url);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  // Include original task data to restore all fields including due_date.
  // Sending only { done: false } would leave fields zeroed from the markDone call.
  const body = { ...taskData, done: false };

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

function updateTaskDueDate(taskId, taskData, dueDate) {
  const config = getConfig();
  if (!config) {
    return Promise.resolve({ success: false, error: 'Configuration not loaded' });
  }

  const url = `${config.vikunja_url}/api/v1/tasks/${taskId}`;

  const validation = validateHttpUrl(url);
  if (!validation.valid) {
    return Promise.resolve({ success: false, error: validation.error });
  }

  // Include original task data to prevent Vikunja from zeroing fields (Go zero-value problem).
  const body = { ...taskData, due_date: dueDate };

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

module.exports = { createTask, fetchProjects, fetchTasks, markTaskDone, markTaskUndone, updateTaskDueDate };
