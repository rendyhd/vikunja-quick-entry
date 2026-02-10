const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveTask: (title, description, dueDate, projectId) => ipcRenderer.invoke('save-task', title, description, dueDate, projectId),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getPendingCount: () => ipcRenderer.invoke('get-pending-count'),
  onShowWindow: (callback) => {
    ipcRenderer.on('window-shown', callback);
  },
  onHideWindow: (callback) => {
    ipcRenderer.on('window-hidden', callback);
  },
  onSyncCompleted: (callback) => {
    ipcRenderer.on('sync-completed', callback);
  },
  onDragHover: (callback) => {
    ipcRenderer.on('drag-hover', callback);
  },
});
