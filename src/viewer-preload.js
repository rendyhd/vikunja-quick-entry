const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewerApi', {
  fetchTasks: () => ipcRenderer.invoke('fetch-viewer-tasks'),
  markTaskDone: (taskId) => ipcRenderer.invoke('mark-task-done', taskId),
  markTaskUndone: (taskId) => ipcRenderer.invoke('mark-task-undone', taskId),
  openTaskInBrowser: (taskId) => ipcRenderer.invoke('open-task-in-browser', taskId),
  closeWindow: () => ipcRenderer.invoke('close-viewer'),
  onShowWindow: (callback) => {
    ipcRenderer.on('viewer-shown', callback);
  },
});
