// preload.js (這是一個 JS 檔案，不要寫型態)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 這裡也要補上 openLink
  openLink: (url) => ipcRenderer.send('open-external-link', url),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getLinkPreview: (url) => ipcRenderer.invoke('get-link-preview', url),
  selectAndCopyFile: () => ipcRenderer.invoke('select-and-copy-file'),
  openFile: (storedName) => ipcRenderer.invoke('open-file', storedName),
  deleteFile: (storedName) => ipcRenderer.invoke('delete-file', storedName),
  saveImage: (bytes, ext) => ipcRenderer.invoke('save-image', bytes, ext),
  // 圖片同步用（見 src/sync/imageSync.ts）。saveImage 會自己產生新 uuid 名字，
  // 「把雲端那張存回來、名字要一模一樣」得用 writeStoredFile。
  hasStoredFile: (storedName) => ipcRenderer.invoke('has-stored-file', storedName),
  readStoredFile: (storedName) => ipcRenderer.invoke('read-stored-file', storedName),
  writeStoredFile: (storedName, bytes) => ipcRenderer.invoke('write-stored-file', storedName, bytes),
  // N3 托盤／全域快捷鍵觸發快速捕捉。回傳 unsubscribe 供 React cleanup 用，
  // 不然每次 effect 重跑都會多疊一個 listener。
  onTriggerQuickCapture: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('trigger-quick-capture', listener)
    return () => ipcRenderer.removeListener('trigger-quick-capture', listener)
  },
})