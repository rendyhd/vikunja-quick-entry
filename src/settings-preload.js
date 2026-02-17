const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getFullConfig: () => ipcRenderer.invoke('get-full-config'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  fetchProjects: (url, token) => ipcRenderer.invoke('fetch-projects', url, token),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getStandaloneTaskCount: () => ipcRenderer.invoke('get-standalone-task-count'),
  uploadStandaloneTasks: (url, token, projectId) => ipcRenderer.invoke('upload-standalone-tasks', url, token, projectId),
  previewTheme: (theme) => ipcRenderer.invoke('preview-theme', theme),
  testNotification: () => ipcRenderer.invoke('test-notification'),
});
