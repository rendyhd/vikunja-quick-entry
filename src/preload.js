const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveTask: (title, description, dueDate, projectId, priority, repeatAfter, repeatMode) => ipcRenderer.invoke('save-task', title, description, dueDate, projectId, priority, repeatAfter, repeatMode),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getPendingCount: () => ipcRenderer.invoke('get-pending-count'),
  fetchLabels: () => ipcRenderer.invoke('fetch-labels'),
  fetchProjects: () => ipcRenderer.invoke('fetch-projects-for-renderer'),
  addLabelToTask: (taskId, labelId) => ipcRenderer.invoke('add-label-to-task', taskId, labelId),
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
  onObsidianContext: (callback) => {
    ipcRenderer.on('obsidian-context', (_event, context) => callback(context));
  },
  onBrowserContext: (callback) => {
    ipcRenderer.on('browser-context', (_event, context) => callback(context));
  },
});
