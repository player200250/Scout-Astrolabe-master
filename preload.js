// preload.js (這是一個 JS 檔案，不要寫型態)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  saveDocument: (data) => ipcRenderer.send('save-document', data),
  loadDocument: () => ipcRenderer.invoke('load-document'),
  openDocument: () => ipcRenderer.invoke('open-document'),
  // 這裡也要補上 openLink 
  openLink: (url) => ipcRenderer.send('open-external-link', url),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getLinkPreview: (url) => ipcRenderer.invoke('get-link-preview', url),
  selectAndCopyFile: () => ipcRenderer.invoke('select-and-copy-file'),
  openFile: (storedName) => ipcRenderer.invoke('open-file', storedName),
  deleteFile: (storedName) => ipcRenderer.invoke('delete-file', storedName),
})