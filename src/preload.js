const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveTask: (title, description, dueDate) => ipcRenderer.invoke('save-task', title, description, dueDate),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  onShowWindow: (callback) => {
    ipcRenderer.on('window-shown', callback);
  },
});
