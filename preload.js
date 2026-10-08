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
  // N10 孤兒檔清理：列出 userData/files/ 內的檔案 metadata（不含內容）。
  listStoredFiles: () => ipcRenderer.invoke('list-stored-files'),
  // 硬碟備份（文件\Scout Astrolabe 備份）：節流與保留規則都在主程序，見 main.js 的 write-backup-file
  writeBackupFile: (json, imageNames) => ipcRenderer.invoke('write-backup-file', json, imageNames),
  getBackupDir: () => ipcRenderer.invoke('get-backup-dir'),
  openBackupDir: () => ipcRenderer.invoke('open-backup-dir'),
  getBackupStatus: () => ipcRenderer.invoke('get-backup-status'),
  pickBackupFile: () => ipcRenderer.invoke('pick-backup-file'),
  // N3 托盤／全域快捷鍵觸發快速捕捉。回傳 unsubscribe 供 React cleanup 用，
  // 不然每次 effect 重跑都會多疊一個 listener。
  onTriggerQuickCapture: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('trigger-quick-capture', listener)
    return () => ipcRenderer.removeListener('trigger-quick-capture', listener)
  },
  // Scout Desktop：主視窗發布摘要、接收 Desktop 轉來的指令（見 desktopWindow.js）
  publishDesktopSummary: (summary) => ipcRenderer.send('desktop:publish-summary', summary),
  onDesktopCommand: (callback) => {
    const listener = (_e, cmd) => callback(cmd)
    ipcRenderer.on('desktop:main-command', listener)
    return () => ipcRenderer.removeListener('desktop:main-command', listener)
  },
  toggleDesktop: () => ipcRenderer.invoke('desktop:toggle'),
  isDesktopOpen: () => ipcRenderer.invoke('desktop:is-open'),
  onDesktopOpenChanged: (callback) => {
    const listener = (_e, open) => callback(open)
    ipcRenderer.on('desktop:open-changed', listener)
    return () => ipcRenderer.removeListener('desktop:open-changed', listener)
  },
})