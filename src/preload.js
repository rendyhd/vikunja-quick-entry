const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveTask: (title) => ipcRenderer.invoke('save-task', title),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  onShowWindow: (callback) => {
    ipcRenderer.on('window-shown', callback);
  },
});
