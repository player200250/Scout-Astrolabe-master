# ADR 0001：選用 Electron 作為桌面應用框架

## 狀態

已採用（截至 2026-05-08）

---

## 背景

Scout Astrolabe 的核心需求是：

1. **本地優先（Local-first）**：所有資料儲存在使用者本機，不依賴雲端服務
2. **大型 Canvas 效能**：tldraw 的無限白板需要現代 Chromium 引擎和足夠的記憶體
3. **系統整合**：需要讀寫本地檔案（JSON 匯入/匯出）、以系統瀏覽器開啟外部連結
4. **跨平台潛力**：主要目標 Windows，但架構上希望保留 macOS 擴展的可能

評估時的技術選項：
- **Electron**：Chromium + Node.js，最成熟的生態系
- **Tauri**：Rust 後端 + 系統 WebView，體積小但 API 成熟度較低
- **純 Web App（PWA）**：最簡單，但無法存取完整 File System API 和原生功能
- **Neutralinojs**：Electron 替代品，生態系小

---

## 決策

選用 **Electron 37** 作為桌面應用框架。

---

## 後果

### 正面

- tldraw v3 在 Chromium 上的相容性有完整測試，無需擔心非 Chromium WebView 的差異
- Node.js 環境讓本地檔案操作（`fs.readFileSync`）、`electron-store` 設定檔管理和 `net.fetch` 跨域抓取均可直接使用
- `contextIsolation: true, nodeIntegration: false` 的安全模型（contextBridge）是 Electron 37 的預設推薦設定，安全性可控
- electron-builder NSIS 封裝成熟，可產生 Windows 安裝程式（`release/Scout Astrolabe Setup x.x.x.exe`）
- 開發體驗好：`npm run electron-dev` 直接使用 Vite dev server，HMR 即時刷新

### 負面

- 安裝包體積大：Electron App 通常 100–200 MB（含完整 Chromium）
- 記憶體佔用高：每個 Electron 視窗至少消耗 100–200 MB RAM
- 升級 Electron 版本可能帶來破壞性變更（Node.js API、安全政策異動）
- winCodeSign 快取問題：Windows 封裝需要預先下載 `winCodeSign-2.6.0.7z`（已用 `scripts/prepare-cache.mjs` 處理）

### 引入的設計約束

- 渲染層不能直接使用 Node.js API，必須透過 `contextBridge` 暴露（`window.electronAPI`）
- TypeScript 型別宣告需手動維護 `src/electron-api.d.ts`
- `vite.config.ts` 必須設定 `base: './'`，確保封裝後 `file://` 協定的相對路徑正確
- userData 路徑需手動設定（`app.setPath('userData', ...)`）以避免空格問題

---

## 替代方案分析

| 方案 | 主要優勢 | 排除原因 |
|------|---------|---------|
| **Tauri** | 體積小（~5 MB）、更低記憶體佔用 | Rust 後端對前端開發者門檻高；WebView 版本差異導致 tldraw 相容性不確定；2024 年 API 成熟度不如 Electron |
| **PWA（純 Web）** | 最簡單、無安裝程式 | File System Access API 仍有瀏覽器相容性問題；無法存取 `net.fetch` 繞過 CORS；tldraw 在 Safari/Firefox 上的相容性不如 Chromium |
| **Neutralinojs** | 比 Electron 輕量 | 社群小、文件少、長期維護不確定 |

---

## 相關文件

- [docs/electron-ipc.md](../electron-ipc.md) — IPC 架構詳情
- [docs/build-and-release.md](../build-and-release.md) — 封裝流程
- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)
