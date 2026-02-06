const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewerApi', {
  fetchTasks: () => ipcRenderer.invoke('fetch-viewer-tasks'),
  markTaskDone: (taskId, taskData) => ipcRenderer.invoke('mark-task-done', taskId, taskData),
  markTaskUndone: (taskId, taskData) => ipcRenderer.invoke('mark-task-undone', taskId, taskData),
  openTaskInBrowser: (taskId) => ipcRenderer.invoke('open-task-in-browser', taskId),
  closeWindow: () => ipcRenderer.invoke('close-viewer'),
  getPendingCount: () => ipcRenderer.invoke('get-pending-count'),
  onShowWindow: (callback) => {
    ipcRenderer.on('viewer-shown', callback);
  },
  onSyncCompleted: (callback) => {
    ipcRenderer.on('sync-completed', callback);
  },
});
