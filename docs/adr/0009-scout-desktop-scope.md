# ADR 0009：Scout Desktop 是主視窗的「今日入口」，不是第二個資料來源

## 狀態

已採用（2026-10-08），v0.1 同日在分支 `feat/scout-desktop` 實作。

研究與實作前審查的原始報告留在作者本機、不進 repo（其中含尚未修補的既有安全問題細節）；決策與外觀規格整理在本文。
補充 [0001 使用 Electron](0001-use-electron.md)、[0003 使用 Dexie／IndexedDB](0003-use-dexie-indexeddb.md)。

---

## 背景

想要一個「打開電腦就看得到今天要做什麼」的入口。參考對象是 Seelen UI（Windows 桌面 shell，AGPL-3.0，只借概念不抄程式碼）。

研究發現 Seelen 九成複雜度在 Windows shell 整合（取代工作列、WorkerW 桌面層、AppBar、注入 DLL），而這些正是 Scout 不需要的。真正需要的只有：時鐘、今天到期的待辦、最近的白板、日記寫了沒、快速記一筆。

風險在資料。Scout 的寫入方式是「整塊 snapshot `put`」（`boardDb.ts`），主視窗把 boards 放在 React state、由 editor 自動存檔。**任何第二個寫入者寫進去的東西，都會被主視窗手上的舊 state 蓋掉。** 2026-10-05 的 vault 清空事故就是多個寫入來源互相覆蓋造成的。

---

## 決策

**Scout Desktop 是同一個 App 的第二個 BrowserWindow。主視窗是唯一的資料來源與寫入者；Desktop 只收一份小摘要、送白名單指令回主視窗執行。**

五條規則：

1. **Desktop 沒有自己的資料**。electron-store 只存 `desktopBounds`（位置）與 `desktopOpen`（下次啟動要不要自動開）。
2. **Desktop 不碰 Dexie、snapshot、tldraw**。它看到的只有 `DesktopSummary`（`src/utils/desktopSummary.ts`）：數字、待辦文字、白板名稱，沒有縮圖、卡片 HTML、日記內容。
3. **每個動作都是「打開 Scout 某處」或「呼叫主視窗既有的 handler」**。指令白名單：`open-board`／`open-task-center`／`open-journal`／`quick-capture`／`refresh`。快速筆記走 `handleAddCardToInbox`，和 Ctrl+Shift+Space 同一條路。
4. **計算放 `src/utils/` 的純函式並測試**。`buildDesktopSummary` 零 runtime 依賴，node 環境就能測。
5. **元件固定、不做 registry、沒有第三方 plugin**。v0.1 是 4 張卡（見附錄）。之後加卡上限 6 張；要超過就重新評估本 ADR。

---

## 理由

- **分 App 等於兩份 IndexedDB**。IndexedDB 依 origin 分隔；同一個 App 從 `dist/` 載入的第二個頁面才會是同一個 origin（主題的 localStorage 也因此能共用）。
- **讓 Desktop 直接讀 Dexie 也不行**。讀可以做到，但下一步一定是「反正只是勾一個待辦」就寫進去，然後被主視窗蓋掉。邊界要畫在讀的地方，不是寫的地方。
- **摘要由主視窗算**。主視窗手上的 `boards` 就是使用者眼前看到的狀態（已排除垃圾桶、已套用雲端同步），從這裡算出來的數字才一致；而且不需要任何新的 DB 查詢。
- **不做 Windows 整合**。置底、WorkerW、AppBar 需要 native module，又脆弱（Seelen 自己的程式註解記錄了無限建立／銷毀迴圈），而且置底視窗不能輸入，和快速筆記衝突。先驗證「每天會不會想打開它」。
- **不換 Tauri／Rust**。等於重寫，資料還要搬家。

---

## 怎麼守住（實作上的執行機制）

規則寫在文件裡守不住，以下四道是程式在擋：

| 防線 | 位置 | 擋什麼 |
|------|------|--------|
| ESLint `no-restricted-imports` | `eslint.config.js`，範圍 `src/desktop/**` | runtime import `dexie`、`tldraw`、`db`、`hooks/*`、`boardDb`、`snapshot*`、`sync/*`（`import type` 允許） |
| 獨立 preload | `preload-desktop.js` | Desktop 只拿得到 `getSummary`／`onSummaryChanged`／`sendCommand`，拿不到刪檔、寫檔、還原備份 |
| sender 檢查＋指令白名單 | `desktopWindow.js` | 摘要只收主視窗送的；指令只收 Desktop 送的，型別不在白名單、文字超過 5000 字、boardId 格式不對一律拒絕 |
| 主視窗再驗一次 | `useDesktopBridge.ts` | boardId 必須存在、不在垃圾桶；日誌板與資料夾不能切進去（RC17） |

另外有**就緒判斷**：主視窗送來第一份摘要才算就緒；重載、崩潰、關閉就清掉。未就緒時 Desktop 顯示「等待 Scout…」，指令回 `not-ready`，快速筆記的文字保留不清空。

---

## 後果

- 主視窗關閉時 Desktop 跟著關（資料來源沒了，留著只會顯示過時資料）。
- 主視窗每次存檔都會多掃一次全部白板算摘要；和上一份相同就不送 IPC。和 `useOverdueStats` 同一量級，可接受。
- 跨過午夜時摘要的「今天」會過期：Desktop 每 10 秒比對日期，不同就送 `refresh` 請主視窗重算。
- Dashboard 與 `buildDesktopSummary` 有一段重複的待辦統計，暫時接受；Dashboard 另有兩個已知不一致（只看第一塊日誌板、列表排除首頁與收件匣），之後再收斂。

---

## 明確不做

- 在 Desktop 直接勾待辦、編輯卡片、顯示日記內容（第二寫入者／隱私）。
- WorkerW 置底、AppBar、隱藏或取代工作列、列舉開始功能表。
- 每個 widget 一個視窗（每個 Electron 視窗 100 MB 以上，Scout 有 OOM 前科）。
- 第三方 plugin、主題系統、settings schema。
- 開機自動啟動：v0.1 之後再做。dev 模式會把 `electron.exe` 註冊進開機項目，必須先在安裝版驗證。

---

## 未來若要重新評估

出現以下任一情況時，回來重看本 ADR，而不是直接改程式：

- 想在 Desktop 做任何**寫入**（勾待辦、改卡片）。可行方向是「Desktop 送指令、主視窗執行」，絕不是讓 Desktop 碰 Dexie。
- 卡片要超過 6 張，或想讓使用者自訂 widget。
- 需要 Windows API（置底、多螢幕各一份）。

---

## 附錄：外觀規格（2026-10-08 使用者拍板）

- 2×2 卡片格、無邊框、不置頂、不透明。預設 560×480，最小 480×420
- 頂端 28px 拖曳列，只有 ✕（關閉＝收起，可從側邊欄／Ctrl+Alt+D／系統匣再開）
- 卡片：底色 `--bg-panel`、1px `--border-light`、圓角 `--radius-card`；間距 12px、內距 16px
- 左上時鐘（40px）＋日期＋週次＋日記寫了沒；右上今日任務最多 5 筆＋「還有 N 項」；左下最近白板最多 5 個；右下快速筆記
- 字級比 Dashboard 大一級（使用者眼睛不好）：清單 14px、標題 15px，最小 13px；輔助字用 `--text-secondary`，不用對比太低的 `--text-muted`
- 清單一行 26px：5 行＋標題＋「還有 N 項」剛好塞進預設尺寸的一格
- 外圈圓角與陰影交給 Windows 11（不透明視窗做不出 CSS 外圈圓角）
