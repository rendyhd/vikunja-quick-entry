const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewerApi', {
  fetchTasks: () => ipcRenderer.invoke('fetch-viewer-tasks'),
  markTaskDone: (taskId, taskData) => ipcRenderer.invoke('mark-task-done', taskId, taskData),
  markTaskUndone: (taskId, taskData) => ipcRenderer.invoke('mark-task-undone', taskId, taskData),
  scheduleTaskToday: (taskId, taskData) => ipcRenderer.invoke('schedule-task-today', taskId, taskData),
  removeDueDate: (taskId, taskData) => ipcRenderer.invoke('remove-task-due-date', taskId, taskData),
  updateTask: (taskId, taskData) => ipcRenderer.invoke('update-task', taskId, taskData),
  openTaskInBrowser: (taskId) => ipcRenderer.invoke('open-task-in-browser', taskId),
  closeWindow: () => ipcRenderer.invoke('close-viewer'),
  setHeight: (height) => ipcRenderer.invoke('set-viewer-height', height),
  getPendingCount: () => ipcRenderer.invoke('get-pending-count'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  onShowWindow: (callback) => {
    ipcRenderer.on('viewer-shown', callback);
  },
  onSyncCompleted: (callback) => {
    ipcRenderer.on('sync-completed', callback);
  },
});
