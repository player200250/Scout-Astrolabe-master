# 建置與發布

## 目的

說明 Scout Astrolabe 的本地開發環境設定、Vite 建置流程、Electron 封裝（Windows NSIS 安裝程式），以及已知的建置注意事項（winCodeSign 快取、userData 路徑等）。

## 適用範圍

`package.json`（npm scripts、electron-builder 設定）、`vite.config.ts`（Vite 建置）、`scripts/prepare-cache.mjs`（建置前置）、`main.js`（userData 路徑）。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `package.json` | npm scripts、依賴清單、electron-builder 設定 |
| `vite.config.ts` | Vite 7 設定（base、plugins、server middleware） |
| `scripts/prepare-cache.mjs` | 建置前下載 winCodeSign 快取 |
| `main.js` | Electron 主程序（userData 路徑、開發/封裝模式切換） |
| `preload.js` | contextBridge 橋接腳本 |

---

## 技術版本

| 工具 | 版本（`package.json`） |
|------|--------------------------------------|
| Electron | 37.x |
| Vite | 7.x |
| React | 19.x |
| TypeScript | 5.8.x |
| electron-builder | 26.x |
| tldraw | 3.x |
| Dexie.js | 4.x |

---

## npm Scripts

| script | 指令 | 說明 |
|--------|------|------|
| `dev` | `cross-env NODE_OPTIONS=--max-http-header-size=131072 vite` | 啟動 Vite dev server（port 5173） |
| `electron-dev` | `concurrently "npm run dev" "electron --icu-data-dir=node_modules/electron/dist ."` | 同時啟動 Vite + Electron（完整開發模式） |
| `build` | `tsc -b && vite build` | **先 `tsc -b` 型別檢查、再** Vite 建置（輸出 `dist/`）。**型別檢查即由此把關**（無獨立 typecheck script） |
| `build:win` | `node scripts/prepare-cache.mjs && vite build && cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --windows` | 完整 Windows 封裝流程 |
| `lint` | `eslint .` | ESLint |
| `test` / `test:watch` / `test:coverage` | `vitest run` / `vitest` / `vitest run --coverage` | 單元測試 |
| `preview` | `vite preview` | 預覽 `dist/` 建置結果（不含 Electron） |

> ⚠️ **沒有 `typecheck` script**（曾有的舊記載已移除）。型別檢查走 `npm run build`（`tsc -b`）；`tsc --noEmit` 對專案參照有盲點，勿改用。

### 開發模式啟動順序

```
npm run electron-dev
  → concurrently 同時執行：
      ① vite（啟動 dev server，port 5173）
      ② electron .（載入 main.js，等待 5173 ready 後開啟視窗）
```

Electron 在開發模式下偵測 `process.env.NODE_ENV === 'development'` 或 `!app.isPackaged`，載入 `http://localhost:5173` 而非 `dist/index.html`。

---

## Vite 設定重點

```typescript
// vite.config.ts
export default defineConfig({
    base: './',      // 必須，確保封裝後 file:// 相對路徑正確
    plugins: [react()],
    server: {
        // 自訂 middleware：攔截含 %3Csvg / %3csvg 的請求
        // 原因：早期版本將 SVG 縮圖存為 URL-encoded 字串，
        //       某些路徑會導致 Vite dev server 報 404 loop
        // 狀態：legacy bug workaround，新資料不再觸發
    }
})
```

**`base: './'` 的重要性**：封裝後 Electron 以 `file://` 協定載入 `dist/index.html`，若 `base` 為 `/`（預設值），所有靜態資源路徑會是絕對路徑（`/assets/index.js`），在 `file://` 下無法解析。

---

## Windows 封裝流程（`build:win`）

### 步驟 1：prepare-cache.mjs

```
node scripts/prepare-cache.mjs
  → 檢查 %LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\ 是否存在
  → 若不存在：
      從 GitHub electron-builder-binaries releases 下載 winCodeSign-2.6.0.7z
      解壓縮到上述路徑
  → exit code 2（macOS symlink 失敗）視為非致命，繼續
```

**winCodeSign 的用途**：electron-builder 在 Windows 上封裝 NSIS 安裝程式時，需要 `winCodeSign` 工具對可執行檔進行簽名。即使未設定程式碼簽名憑證（`forceCodeSigning: false`），electron-builder 仍需要此工具存在。

### 步驟 2：vite build

```
vite build
  → TypeScript 編譯 + 打包 → dist/
  → dist/index.html、dist/assets/（js、css、chunks）
```

### 步驟 3：electron-builder --windows

```
electron-builder --windows
  → 讀取 package.json 的 build 設定
  → 將 dist/**/*、main.js、preload.js、package.json 打包
  → 產出 release/Scout Astrolabe Setup x.x.x.exe（NSIS 安裝程式）
```

---

## electron-builder 設定（`package.json`）

```json
{
    "build": {
        "appId": "com.player200250.scout-astrolabe",
        "productName": "Scout Astrolabe",
        "files": [
            "dist/**/*",
            "assets/**/*",
            "main.js",
            "preload.js",
            "package.json"
        ],
        "directories": {
            "output": "release"
        },
        "forceCodeSigning": false,
        "win": {
            "target": ["nsis"],
            "requestedExecutionLevel": "asInvoker"
        },
        "nsis": {
            "oneClick": false,
            "perMachine": false,
            "allowToChangeInstallationDirectory": true,
            "createDesktopShortcut": true,
            "createStartMenuShortcut": true
        }
    }
}
```

| 設定 | 值 | 說明 |
|------|-----|------|
| `appId` | `com.player200250.scout-astrolabe` | 用於 userData 路徑識別 |
| `target` | `nsis` | Windows NSIS 安裝程式（非 portable） |
| `oneClick` | `false` | 顯示安裝嚮導，讓使用者選擇目錄 |
| `perMachine` | `false` | 預設安裝至使用者目錄（不需管理員權限） |
| `forceCodeSigning` | `false` | 跳過程式碼簽名（開發版本，無 EV 憑證） |

---

## userData 路徑

```javascript
// main.js
app.setPath('userData', path.join(app.getPath('appData'), 'Scout-Astrolabe'))
// Windows 實際路徑：C:\Users\<user>\AppData\Roaming\Scout-Astrolabe
```

**覆寫預設路徑的原因**：Electron 預設 userData 以 `productName` 命名（含空格），在某些系統上可能有相容性問題。統一改為 `Scout-Astrolabe`（kebab-case）。

此路徑存放：
- `electron-store` 的 `config.json`（現僅存 `minimizeToTray` 等設定；舊 `tldraw-document` 快照欄位已隨「儲存」鈕於 2026-07-25 退場）
- Electron 的 crash dumps、IndexedDB（白板實際資料，Dexie `AstrolabeDB`）、`files/`（檔案卡附件）等

---

## 常見建置問題

### winCodeSign 下載失敗

**症狀**：`build:win` 在 `prepare-cache.mjs` 步驟失敗，錯誤訊息含 `winCodeSign`

**解法**：
1. 手動從 [electron-builder-binaries](https://github.com/electron-userland/electron-builder-binaries/releases) 下載 `winCodeSign-2.6.0.7z`
2. 解壓縮到 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`
3. 再次執行 `npm run build:win`

### Vite 建置後 Electron 白畫面

**症狀**：封裝後雙擊執行，視窗空白

**排查**：
1. 確認 `vite.config.ts` 的 `base: './'` 存在
2. 確認 `dist/index.html` 的 script/link 標籤路徑為相對路徑（`./assets/...`）
3. 開啟 DevTools（`Ctrl+Shift+I` 或 `F12`）查看 console 錯誤

### TypeScript 型別錯誤阻擋建置

Vite 預設不執行型別檢查（只做 transpile）。本專案的 `build` script 已在 `vite build` 前串 `tsc -b`，故 `npm run build` 本身就會因型別錯誤而失敗（無獨立 `typecheck` script）。若只想單獨檢查型別：

```bash
npx tsc -b        # 用 -b（專案參照），勿用 tsc --noEmit（有盲點會漏抓）
```

CI（`.github/workflows/ci.yml`）在 push/PR 時跑 `npm run lint`、`npx tsc -b`、`npm run test:coverage`。

---

## 維護注意事項

- 升級 electron-builder 時，需確認 `winCodeSign` 版本號碼是否變更；若版本變更，`prepare-cache.mjs` 的下載 URL 和目標路徑需同步更新。
- `dist/` 和 `release/` 目錄均不應提交到版本控制（已在 `.gitignore` 中）。
- `forceCodeSigning: false` 僅適用於開發版本；若未來需要正式發布，需申請 EV Code Signing 憑證並更新 electron-builder 設定。
- `perMachine: false` 代表每位 Windows 使用者有獨立的安裝，預設安裝至 `%LOCALAPPDATA%\Programs\`，不需管理員權限。

## 待確認

- `prepare-cache.mjs` 的 winCodeSign 版本（`2.6.0`）是否與目前 `electron-builder` 版本相容？版本升級時需同步確認。
- `concurrently` 是否有設定等待 Vite dev server 就緒的延遲或 health check？若 Electron 比 Vite 更快啟動，可能開啟空白視窗。

## 外部參考

- [electron-builder NSIS 文件](https://www.electron.build/configuration/nsis)
- [electron-builder winCodeSign](https://github.com/electron-userland/electron-builder-binaries)
- [Vite 靜態資源基礎路徑](https://vitejs.dev/config/shared-options.html#base)
