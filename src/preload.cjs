const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  load: () => ipcRenderer.invoke('library:load'),
  ready: () => ipcRenderer.send('app:ready'),
  save: data => ipcRenderer.invoke('library:save', data),
  restore: data => ipcRenderer.invoke('library:restore', data),
  libraryItem: key => ipcRenderer.invoke('library:item', key),
  libraryPreview: key => ipcRenderer.invoke('library:preview', key),
  libraryThumbnail: data => ipcRenderer.invoke('library:thumbnail', data),
  libraryMissingMedia: hashes => ipcRenderer.invoke('library:missing-media', hashes),
  librarySnapshot: () => ipcRenderer.invoke('library:snapshot'),
  exportPackage: payload => ipcRenderer.invoke('package:save', payload),
  exportPNG: payload => ipcRenderer.invoke('png:save', payload),
  exportPDF: payload => ipcRenderer.invoke('pdf:save', payload),
  convertVector: payload => ipcRenderer.invoke('vector:convert', payload),
  onClosing: callback => ipcRenderer.on('app:closing', callback),
  closeReady: () => ipcRenderer.send('app:close-ready')
});
