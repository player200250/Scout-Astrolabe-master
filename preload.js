// preload.js (這是一個 JS 檔案，不要寫型態)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  saveDocument: (data) => ipcRenderer.send('save-document', data),
  loadDocument: () => ipcRenderer.invoke('load-document'),
  openDocument: () => ipcRenderer.invoke('open-document'),
  // 這裡也要補上 openLink 
  openLink: (url) => ipcRenderer.send('open-external-link', url),
  getLinkPreview: (url) => ipcRenderer.invoke('get-link-preview', url)
})