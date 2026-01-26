const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getFullConfig: () => ipcRenderer.invoke('get-full-config'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  fetchProjects: (url, token) => ipcRenderer.invoke('fetch-projects', url, token),
});
