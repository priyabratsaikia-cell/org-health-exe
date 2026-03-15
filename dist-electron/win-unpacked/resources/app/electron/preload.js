const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkSfCli: () => ipcRenderer.invoke('check-sf-cli'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  completeSetup: (config) => ipcRenderer.send('setup-complete', config),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  clearDevCache: () => ipcRenderer.invoke('clear-dev-cache'),
  getPlatformInfo: () => ({
    platform: process.platform,
    arch: process.arch,
    version: process.versions.electron,
  }),
});
