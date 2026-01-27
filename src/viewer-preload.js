const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewerApi', {
  fetchTasks: () => ipcRenderer.invoke('fetch-viewer-tasks'),
  markTaskDone: (taskId) => ipcRenderer.invoke('mark-task-done', taskId),
  closeWindow: () => ipcRenderer.invoke('close-viewer'),
  onShowWindow: (callback) => {
    ipcRenderer.on('viewer-shown', callback);
  },
});
