// preload-desktop.js — Scout Desktop 視窗專用（不要寫型態）
// 刻意不沿用 preload.js：那份 electronAPI 有刪檔、寫檔、選備份檔，Desktop 一個都用不到。
// Electron 37 預設 sandbox ⇒ 只能用 require('electron')，不能寫 ESM import。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  getSummary: () => ipcRenderer.invoke('desktop:get-summary'),
  onSummaryChanged: (callback) => {
    const listener = (_e, summary) => callback(summary)
    ipcRenderer.on('desktop:summary-changed', listener)
    return () => ipcRenderer.removeListener('desktop:summary-changed', listener)
  },
  sendCommand: (cmd) => ipcRenderer.invoke('desktop:command', cmd),
})
