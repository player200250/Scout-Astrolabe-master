---
name: run-desktop
description: 啟動並驗證 Scout Astrolabe 這個 Electron 桌面 App 的畫面。當被要求「啟動 App / 截圖確認畫面 / 確認某變更在真實 App 中正常」時使用。Windows-only；用正式建置的 dist 啟動，不需要 Vite dev server。
---

# run-desktop — 啟動並驗證 Scout Astrolabe 畫面

Scout Astrolabe 是 Electron 桌面 App。agent 看不到彈出在使用者桌面的視窗，
所以「確認畫面正常」= **用正式建置的 `dist/` 啟動真實 App → 用 PrintWindow 截該視窗 → Read 那張 PNG 看**。

關鍵手法（都在 `main.js` 與本資料夾腳本內驗證過）：

- **不需要 Vite dev server**。`main.js` 支援 `ELECTRON_PROD_TEST=1`：改用 `file://` 載入
  `dist/index.html`（等同安裝版環境與 IndexedDB origin），可在不打包安裝程式的情況下驗畫面。
- **用 `PrintWindow` 抓「Scout Astrolabe」這個視窗**，不要抓全桌面截圖——全桌面只會抓到前景視窗
  （常常是 VS Code），PrintWindow 即使視窗不在前景也能抓到內容。

所有路徑相對於專案根目錄 `C:\Users\win11\Desktop\Scout-Astrolabe-master`。

## 前置：確保 dist 是新的

```powershell
npm run build     # tsc -b && vite build，產出 dist/
```

若剛改過原始碼，必須先重跑 build，否則 `file://` 載到的是舊的 `dist/`。

## 步驟

### 1. 背景啟動 App（Bash 工具，run_in_background）

```bash
cd "C:/Users/win11/Desktop/Scout-Astrolabe-master"
ELECTRON_PROD_TEST=1 ./node_modules/electron/dist/electron.exe \
  --icu-data-dir=node_modules/electron/dist . > /tmp/shots/electron.log 2>&1
```

`--icu-data-dir` 是這個專案 electron-dev 就在用的旗標，別漏。主程序輸出導到 log 供步驟 3 檢查。

### 2. 等載入 + 截圖（PowerShell 工具）

App 啟動約需 10~12 秒。等待後跑本資料夾的截圖腳本：

```powershell
Start-Sleep -Seconds 12
powershell -File .claude\skills\run-desktop\capture-window.ps1 -Title "Scout Astrolabe" -Out "$env:TEMP\shots_astro.png"
```

然後用 Read 工具開 `%TEMP%\shots_astro.png`（`C:\Users\win11\AppData\Local\Temp\shots_astro.png`）**實際看畫面**。
正常畫面應有：標題列「Scout Astrolabe」、頂部工具列（儀表板/白板/儲存/匯出匯入 JSON/匯出圖片）、
左側 tldraw 工具列、右側導覽（主頁/收件匣/卡片庫/任務中心/復盤中心/知識圖譜/垃圾桶）、主畫布的白板卡。
**空白/純色畫面 = 白屏失敗**。

### 3. 檢查主程序 log 有無錯誤

Read `/tmp/shots/electron.log`（或背景任務的 output 檔）。**log 應為空**。若出現以下代表出事：
- `render-process-gone` → renderer 崩潰（白屏元兇，見記憶 bug_renderer_oom_backups）
- `did-fail-load` → 頁面載入失敗（多半是 dist 沒建置或路徑錯）

### 4. 關閉 App

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
```

背景啟動任務會回報 exit 127 / 非 0 —— 那是被 kill 的正常結果，不是 App 崩潰。

## 要「操作」App（開面板、按快捷鍵、填表單）而不只是看首屏

**不要用 SendKeys。** SendKeys 送到的是當下的前景視窗；Electron 視窗一掉前景，
輸入就會跑進別的視窗（實測跑進過使用者的終端機）。改用 **CDP（Chrome DevTools Protocol）**，
它直接對 renderer 送事件，不依賴視窗焦點：

```bash
# 啟動時加 --remote-debugging-port=9222
ELECTRON_PROD_TEST=1 ./node_modules/electron/dist/electron.exe \
  --icu-data-dir=node_modules/electron/dist --remote-debugging-port=9222 . > /tmp/shots/electron.log 2>&1
```

```js
// 取得頁面目標（排除 devtools:// 目標）後連 webSocketDebuggerUrl（Node 22 有原生 WebSocket）
const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'))
```

- 送鍵：`Input.dispatchKeyEvent`（`rawKeyDown` + `keyUp`）。**必須帶正確的 `windowsVirtualKeyCode`**，
  否則 React 收不到；修飾鍵 bitmask：alt=1 / ctrl=2 / shift=8。
- 打字：`Input.insertText`（比逐鍵送可靠）。
- 斷言：`Runtime.evaluate` 讀 `document.body.innerText`，或直接查 IndexedDB 驗資料真的寫進去。

### 要雙擊畫布上的卡片（進編輯模式）

2026-07-15 驗 WO4 時定出的可靠流程——**前兩次實測失敗都是腳本自己的錯，不是 App**：

1. **先傾印座標，別猜**：`[...document.querySelectorAll('[data-shape-type="card"]')]` 取
   `getBoundingClientRect()`，用**明確的中心座標**點。（前次失敗原因之一＝選擇器抓錯卡片。）
2. **雙擊前先點空白畫布清掉選取**——殘留的選取狀態會讓 tldraw 對雙擊的反應不同（實測會進不了編輯模式）。
3. 送 `mouseMoved` → `mousePressed/mouseReleased` with `clickCount: 1` → 再一組 `clickCount: 2`，中間隔 ~60ms。
4. **全程不要用 Escape**：Escape 會被 tldraw 吃掉、直接退出編輯模式（前次失敗原因之二）。
   要離開編輯模式改點空白畫布（走 `onBlur`，會正常存檔）。
5. 斷言用 `document.querySelector('.ProseMirror')` 是否存在。

**改卡片內容後要還原**：`Ctrl+A` 選的是**整份文件**（H1 標題會一起被洗掉）。重建結構靠 Markdown input rule：
`insertText('#')` → `insertText(' ')` **分兩次送**（input rule 要靠空格觸發），再送標題 → Enter → 內文。

### 用 eval 抓 DOM 的兩個坑

- **`document.querySelector('input')` 會抓到隱藏的檔案上傳 input**（丟 InvalidStateError）。用 `x.type === 'text'` 過濾。
- **`[...divs].filter(d => d.textContent.includes('某字'))` 會同時命中祖先與後代**；`[0]` 是最外層、
  `.pop()` 是最內層（常常是那段文字自己的 div）。抓面板根請用特徵：`d.style.position === 'fixed' && d.textContent.includes(...)`。
- 卡片上的標籤 chip 與面板裡的 chip 文字相同 → 一定要先 scope 到面板再查，否則點到畫布上的卡。

## Gotchas（實際踩過的）

- **殘留的 electron 行程會佔住 userData** → 新實例的 IndexedDB 開不起來，畫面變成
  「未處理的 Promise 錯誤 / UnknownError: Internal error」，log 有 `Could not open the quota database`。
  **啟動前先 `Get-Process electron | Stop-Process -Force`**，別誤判成程式碼壞掉。
- **全桌面截圖抓到的是 VS Code 不是本 App** → 一定要用 `capture-window.ps1` 的 PrintWindow 針對視窗抓。
- **`capture-window.ps1` 靠 `MainWindowTitle` 找窗，視窗被隱藏（收進托盤）時會報 NO WINDOW** —— 不代表 App 掛了。
  要分辨「隱藏」與「不存在」，用 `EnumWindows` 列舉（PowerShell 閉包內累加陣列要用 `$script:` 作用域，
  否則永遠是空的、會誤判成沒有視窗）。
- **`Add-Type -ReferencedAssemblies` 拼錯會報參數錯**，但若型別已被定義則不影響；腳本已用
  `[PSTypeName]'Win'` 檢查避免重複定義。
- **改了程式忘了 rebuild** → `file://` 載到舊 dist，畫面對不上。先 `npm run build`。
- App 用 Dexie/IndexedDB 存白板資料，`ELECTRON_PROD_TEST=1` 的 origin 與安裝版一致，
  所以能重現「只在安裝版發生」的問題（例如白屏 OOM）。

## 驗證基線（順手一起跑）

```powershell
npm run build     # 期望 exit 0
npm test          # vitest run，期望全綠（2026-07-15 為 349 案例）
```
