# Electron IPC 架構

## 目的

說明 Scout Astrolabe 的 Electron 主程序（main.js）、preload 腳本（preload.js）與渲染程序（React）之間的 IPC 通訊架構，包括 contextBridge API 清單、各 channel 的用途與安全設定。

## 適用範圍

`main.js`（主程序）、`preload.js`（沙盒橋接）、`src/electron-api.d.ts`（TypeScript 型別）、以及任何直接呼叫 `window.electronAPI` 的渲染層元件。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `main.js` | Electron 主程序：建立 BrowserWindow、註冊 ipcMain handler、設定安全性 |
| `preload.js` | 在沙盒中以 contextBridge 暴露 API |
| `src/electron-api.d.ts` | TypeScript 型別宣告：`IElectronAPI` 介面 + CustomEvent WindowEventMap 擴充 |
| `src/components/card-shape/sub-components/LinkContent.tsx` | 唯一呼叫 `getLinkPreview` 的元件 |
| `src/hooks/useBoardManager.ts` | 透過 `window.electronAPI.saveDocument` 持久化 snapshot |

---

## 安全設定

```javascript
// main.js — BrowserWindow 設定
new BrowserWindow({
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,    // 渲染層無法直接存取 Node.js API
        nodeIntegration: false,    // 禁止在渲染層使用 require()
    }
})
```

**contextIsolation: true** — preload 腳本執行在獨立的 JavaScript context，渲染層無法污染或存取 preload 的 scope，也無法繞過 contextBridge。

**nodeIntegration: false** — 渲染層（React 程式碼）無法直接呼叫 `fs`、`path`、`require` 等 Node.js API，必須透過 contextBridge 暴露的方法。

---

## userData 路徑

```javascript
// main.js
app.setPath('userData', path.join(app.getPath('appData'), 'Scout-Astrolabe'))
```

實際路徑（Windows）：`C:\Users\<user>\AppData\Roaming\Scout-Astrolabe`

`electron-store` 的 JSON 設定檔（`config.json`，含 `tldraw-document` 欄位）存放於此目錄。開發與封裝版本共用同一個 userData 路徑（由 appId 決定）。

---

## IPC Channel 清單

### 單向（fire-and-forget）

| channel | 方向 | 說明 |
|---------|------|------|
| `save-document` | renderer → main | 將 tldraw snapshot JSON 字串寫入 electron-store |
| `open-external-link` | renderer → main | 以系統預設瀏覽器開啟外部 URL |

### 雙向（request / response）

| channel | 方向 | 回傳值 | 說明 |
|---------|------|--------|------|
| `load-document` | renderer → main | `{ snapshot: string } \| null` | 從 electron-store 讀取上次儲存的 snapshot |
| `open-document` | renderer → main | `string \| null` | 開啟系統檔案選擇器（.json），回傳內容字串 |
| `get-link-preview` | renderer → main | `{ title, description, thumbnail } \| null` | 以 `net.fetch` 抓取 URL 並用 regex 解析 og/meta tags |
| `select-and-copy-file` | renderer → main | `{ storedName, originalName, fileSize, fileExt } \| null` | 開啟系統檔案選擇器（所有格式），將選取的檔案複製到 `userData/files/`，以 UUID 命名 |
| `open-file` | renderer → main | `void` | 以系統預設程式開啟 `userData/files/` 中的指定檔案（`shell.openPath`） |
| `delete-file` | renderer → main | `void` | 刪除 `userData/files/` 中的指定檔案 |

---

## contextBridge API

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    saveDocument: (data) => ipcRenderer.send('save-document', data),
    loadDocument: () => ipcRenderer.invoke('load-document'),
    openDocument: () => ipcRenderer.invoke('open-document'),
    openLink: (url) => ipcRenderer.send('open-external-link', url),
    getLinkPreview: (url) => ipcRenderer.invoke('get-link-preview', url),
    selectAndCopyFile: () => ipcRenderer.invoke('select-and-copy-file'),
    openFile: (storedName) => ipcRenderer.invoke('open-file', storedName),
    deleteFile: (storedName) => ipcRenderer.invoke('delete-file', storedName),
})
```

### TypeScript 型別（`src/electron-api.d.ts`）

```typescript
interface LinkPreviewResult {
    title?: string
    description?: string
    thumbnail?: string
}

interface LoadDocumentResult {
    snapshot: string
}

interface FilePickResult {
    storedName: string      // userData/files/ 中的檔案名稱（UUID + ext）
    originalName: string    // 原始檔名
    fileSize: number        // 位元組
    fileExt: string         // 副檔名（含 '.'）
}

interface IElectronAPI {
    saveDocument: (document: string) => void
    loadDocument: () => Promise<LoadDocumentResult | null>
    openDocument: () => Promise<string | null>
    openLink: (url: string) => void
    getLinkPreview?: (url: string) => Promise<LinkPreviewResult | null>
    selectAndCopyFile?: () => Promise<FilePickResult | null>
    openFile?: (storedName: string) => Promise<void>
    deleteFile?: (storedName: string) => Promise<void>
}

declare global {
    interface Window {
        electronAPI?: IElectronAPI
    }
}
```

注意：`getLinkPreview` 標記為 optional（`?`），因為 Web 版本（非 Electron）不會有此 API。

---

## getLinkPreview 完整流程

```
使用者在 LinkContent 確認 URL（onBlur 或 Enter）
  → LinkContent.tsx：isFinal && inputUrl && window.electronAPI?.getLinkPreview
  → ipcRenderer.invoke('get-link-preview', url)
  → main.js ipcMain.handle：
      net.fetch(url, { method: 'GET', headers: { 'User-Agent': ... } })
      → 解析 HTML 以 regex 提取：
          og:title / og:description / og:image
          twitter:card / twitter:image
          <title> / <meta name="description">
      → 回傳 { title, description, thumbnail }
  → LinkContent 收到後 editor.updateShape({ props: { title, description, thumbnail } })
```

**注意**：`net.fetch` 在 Electron 主程序執行（非渲染層），可跨 CORS；但部分網站有 bot 防護，可能回傳 403/429。

---

## 視窗開啟攔截（Window Open Handler）

```javascript
// main.js
win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url)
    }
    return { action: 'deny' }
})
```

確保 tldraw 或任何子元件試圖開啟新視窗（含外部連結）時，均以系統瀏覽器開啟而非建立新的 Electron 視窗。

---

## 開發 vs 封裝模式

```javascript
// main.js（2026-06-21 校正）
const prodTest = process.env.ELECTRON_PROD_TEST === '1';
if (app.isPackaged || prodTest) {
    win.loadFile(path.join(__dirname, 'dist/index.html'));  // file:// 載入正式 dist
    if (prodTest) win.webContents.openDevTools();           // 診斷用；正式安裝版不開
} else {
    win.loadURL('http://localhost:5173');                   // Vite dev server
    win.webContents.openDevTools();
}
```

封裝版本載入 `dist/index.html`（相對路徑），因此 `vite.config.ts` 必須設定 `base: './'`。

### 診斷與 OOM 止血（2026-06-21）

排查「大型 vault 白屏」時於 `main.js` 加入：

- **`ELECTRON_PROD_TEST=1`**：不打包整個安裝程式，即以 `file://` 載入正式 `dist`（重現只在安裝版/正式建置才發生的問題，例如與 dev origin 不同的 IndexedDB 資料）。用法：`set ELECTRON_PROD_TEST=1 && npx electron --icu-data-dir=node_modules/electron/dist .`
- **renderer 診斷掛鉤**：`console-message`（轉發 renderer console 到主程序終端，相容 Electron 35+ 單一 event 物件簽名）、`render-process-gone`（攔截 renderer 崩潰，`reason:'oom'` 即記憶體耗盡）、`did-fail-load`。
- **V8 heap 上限**：`app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')` —— 大型 vault 把所有 snapshot 載入記憶體時的止血（治本見 `maintenance/bugs.md` TD-IMG）。

---

## 維護注意事項

- 新增 IPC channel 時，需同步更新：`main.js`（ipcMain handler）、`preload.js`（contextBridge 暴露）、`src/electron-api.d.ts`（TypeScript 型別）。
- `ipcRenderer.send` 對應 `ipcMain.on`（單向）；`ipcRenderer.invoke` 對應 `ipcMain.handle`（雙向）。兩者不可混用，否則回傳 Promise 會永不 resolve。
- 渲染層呼叫 `window.electronAPI` 前應先做 null check（`window.electronAPI?.method`），以確保非 Electron 環境（純 Web 版本）不會拋錯。
- `net.fetch` 在主程序執行，不受渲染層 CSP 限制，但仍受目標網站的 CORS / bot 防護影響。

## 待確認

- `load-document` 回傳的 `snapshot` 欄位名稱是否與 `saveDocument(data)` 存入的格式一致？（`data` 存入時似為直接的 JSON 字串，而非包在物件中）
- 目前 `getLinkPreview` 的 regex meta tag 解析是否有 fallback 順序文件？

## 外部參考

- [Electron contextBridge 文件](https://www.electronjs.org/docs/latest/api/context-bridge)
- [Electron ipcMain / ipcRenderer](https://www.electronjs.org/docs/latest/api/ipc-main)
- [Electron net.fetch](https://www.electronjs.org/docs/latest/api/net#netfetchinput-init)
