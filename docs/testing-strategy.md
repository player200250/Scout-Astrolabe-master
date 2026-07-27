# 測試策略

## 目的

說明 Scout Astrolabe 目前的測試現況、已識別的高風險脆弱點、手動測試重點區域，以及未來擴大自動化測試的建議方向。

## 適用範圍

整個 `src/` 目錄。單元測試已導入（Vitest），覆蓋純函式工具、資料層、兩個核心 hook（`useBoardManager` 全 handler、`useBacklinks`）與純 UI 元件（含一個吃 Context 的元件）；尚無整合（fake-indexeddb）與 E2E（Playwright）測試。重綁 tldraw Editor 的元件（`*Content`、`WhiteboardTools` 等）刻意不做單元測試，留待 E2E。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/hooks/useBoardManager.ts` | 最複雜的業務邏輯、最高測試優先度 |
| `src/utils/snapshot.ts` | 純函式工具集，最易單元測試 |
| `src/utils/exportMarkdown.ts` | 純函式，適合 snapshot 測試 |
| `src/db.ts` | Dexie schema 升級，最難模擬 |

---

## 目前測試現況

**單元測試已導入（Vitest 3.2.6），目前 49 檔 599 案例全綠（快照日期 2026-07-28；持續成長，以 `npm test` 實跑為準）。** 設定寫在 `vite.config.ts` 的 `test` 區塊（`include: src/**/*.{test,spec}.{ts,tsx}`）；指令 `npm test`（`vitest run`）、`npm run test:watch`、`npm run test:coverage`。已裝 `jsdom`、`@testing-library/react`、`@testing-library/dom`（未裝 `@testing-library/jest-dom`，斷言用 `.toBeTruthy()`/`.toBeNull()`）。純函式測試跑 node 環境、需要 DOM 的單檔以 `// @vitest-environment jsdom` 切換。

> **下表是 2026-06-21 的快照（約 24 檔）**；此後隨功能陸續新增，現已 49 檔 599 案例。表未逐一列出的新增檔包括：`cardLinks`／`slashCommands`／`knowledgeGraph`／`tagManager`／`tagColors`／`commands`／`inboxTriage`／`dataSafetyStats`／`homeBoardMigration`／`imageMigration`／`exampleBoard`（utils）、`platform/imageStore`、`card-shape/extensions/Toggle`，以及 2026-07-26 新增的 `components/ui/{InlineEdit,ToastHost,PromptHost}`（TD9 primitive）。**雲端同步與手機端的 8 個測試檔另見下方獨立章節。** 逐檔案例數會漂移，以 `npm test` 實跑為準。

已覆蓋的測試檔（2026-06-21 快照）：

**純函式 / 工具（utils）**

| 檔案 | 案例 | 重點 |
|------|------|------|
| `utils/weeklyReviewUtils.test.ts` | 9 | `getISOWeekKey`、`getWeekRange`（含 ISO 8601 年界邊界）|
| `utils/trashUtils.test.ts` | 14 | `getCardPreview`（HTML 剝除/截斷/fallback）|
| `utils/snapshot.test.ts` | 24 | `sanitizeCardProps`、`getSnapshotStore`、`withUpdatedStore`、`toMutableSnapshot`、`getCardShapes`、`sanitizePageRecords`/`sanitizeDocumentRecord`、`sanitizeSnapshot`（frame/arrow 補值）|
| `utils/colorSwatchUtils.test.ts` | 5 | `getContrastColor` |
| `utils/date.test.ts` | 10 | `toDateStr`/`formatDueDate`/`formatRelativeDate`（fake timers 凍結時間）|
| `utils/appEvents.test.ts` | 5 | `emitAppEvent`/`onAppEvent`（jsdom + `vi.fn()` 間諜）|
| `utils/exportMarkdown.test.ts` | 15 | `htmlToMarkdown`/`cardToMarkdown`（jsdom）|
| `utils/boardExport.test.ts` | 3 | `exportJSON`/`importJSON`（Blob/FileReader/URL 副作用替身）|
| `utils/boardDb.test.ts` | 11 | `generateId`/`isRasterThumbnail` + `loadAllBoards` 四分支（注入 home/inbox、SVG 縮圖遷移、排序）|
| `utils/snapshotCards.test.ts` | 10 | `ensurePageScaffold`/`nextAppendX`/`lastShapeIndex`（空 store、不覆蓋既有 page/document、缺 x/w 預設、忽略非 shape）|
| `utils/stringUtils.test.ts` | 7 | `stripHtml`（區塊邊界插空格、行內不插、具名/數值 entity 解碼、collapse/trim、`[[wiki]]` 保留）|
| `components/card-shape/utils/embedUtils.test.ts` | 14 | `getEmbedData`（YouTube/Bilibili/Vimeo/一般網域/邊界）|
| `SearchPanel.test.ts`（2026-07-28 新增） | 25 | **每種 CardType 各一條**（曾經有 6 種搜不到）＋型別篩選與 chip 計數 |

**Hooks**

| 檔案 | 案例 | 重點 |
|------|------|------|
| `hooks/useBoardManager.test.ts` | 45 | **全 handler 覆蓋**：建立/重新命名/切換/導航/資料夾/軟刪/永久刪/搬卡（單卡 Inbox＋泛化來源批次＋移到自己無操作）/跳轉/排序/垃圾桶/還原（`vi.mock` 換掉 Dexie 層，`renderHook`+`act`）|
| `hooks/useBacklinks.test.ts` | 20 | `extractCardName` + 掃描 + 增量更新（快取命中回同 reference、snapshot 換新重掃、刪板/改名）|

**元件（@testing-library/react，jsdom）**

| 檔案 | 案例 | 重點 |
|------|------|------|
| `components/MoveCardModal.test.tsx` | 5 | 目標白板過濾、點選回呼、空狀態、Esc |
| `components/QuickCapture.test.tsx` | 4 | Enter 送出/純空白不送/Shift+Enter 換行/Esc |
| `components/TrashDialog.test.tsx` | 4 | 預設/自訂 label、確認取消、Enter/Esc |
| `components/SidebarFooter.test.tsx` | 3 | 工具鈕回呼、主題鈕、更多選單 |
| `components/OnboardingModal.test.tsx` | 5 | 步驟導覽、跳過寫 localStorage、最後一步、方向鍵 |
| `components/ErrorBoundary.test.tsx` | 5 | 正常渲染/丟錯 fallback/name 標題/自訂 fallback/重試 reset |
| `components/DeleteBoardDialog.test.tsx` | 6 | 卡片數提示、moveToInbox 勾選回傳、取消/Esc、展開收起 |
| `components/card-shape/sub-components/BacklinksPanel.test.tsx` | 6 | Context Provider 注入、摘要/展開、點連結 emit jump-to-card、去重 |

`useBoardManager`/`boardDb` 測試以 `vi.hoisted` 建立鏈式 Dexie 替身，`vi.mock('../utils/boardDb')` 與 `vi.mock('../db')` 換掉 DB 層，hook 在純記憶體裡跑。`useBacklinks` 不碰 DB，直接捏假 snapshot。元件測試用 `render`/`screen`/`fireEvent`；吃 Context 者用 `<Context.Provider>` 包，吃 tldraw `useIsDarkMode` 者用 `vi.mock('@tldraw/editor')` 換掉。

開發驗證目前依賴：
1. **單元測試**（`npm test`）— 純函式、資料層、`useBoardManager` 全 handler、`useBacklinks`、純 UI 元件
2. **TypeScript 型別檢查**（`npm run build` 走 `tsc -b`；用 `-b` 而非 `tsc --noEmit`——後者對專案參照有盲點會漏抓）
3. **手動操作測試**（開發者本地驗證，見下方重點清單）
4. **代碼審查**（BUGS.md 中的全面驗證報告，2026-05-07）

尚未覆蓋：Dexie schema 升級（待 fake-indexeddb）、Ctrl+Z 與垃圾桶的多板同步、重綁 tldraw Editor 的元件（`*Content`、`WhiteboardTools`、`CardShapeUtil` 等）—— 後兩者屬 E2E（Playwright）範疇。**同步層另有一塊自動化測不到的**：真實 service worker、真實行動網路、真實手機瀏覽器（見下方獨立章節的手動流程）。

---

## 雲端同步與手機端（PWA）的測試

> 快照日期 2026-07-28。相關程式碼見 [roadmap-mobile.md](roadmap-mobile.md)（同步設計）與 [mobile-pwa.md](mobile-pwa.md)（手機端）。

同步是這個專案第一個**跨裝置、跨網路、且失敗會靜默丟資料**的功能，測試策略也因此與其他部分不同：
**不去測網路層，專測「決策規則」**——什麼時候該推什麼、拉回來的東西怎麼套用、失敗了會怎樣。

### 自動化覆蓋

| 檔案 | 案例 | 重點 |
|------|------|------|
| `sync/boardSync.test.ts` | 15 | `toRemoteRow`/`fromRemoteRow` 欄位對映、`decideSync`（整板 LWW 判斷） |
| `sync/syncConfig.test.ts` | 25 | URL 正規化（`/rest/v1` 那個真實踩過的坑）、`autoSync` 開關、舊設定無欄位視為開啟、**手機設定連結**往返與壞輸入 |
| `sync/syncState.test.ts` | 23 | dirty 判斷、換帳號作廢、縮圖指紋（省流量的安全條件） |
| `sync/syncStatus.test.ts` | 7 | 各階段顯示文字、`signed-out` 與 `disabled` 的區分、相對時間 |
| `sync/syncEngine.test.ts` | 24 | **引擎決策規則**（見下） |
| `hooks/useCloudSync.test.ts` | 7 | `mergeSyncedBoards`（拉回的板併進清單、另一端刪除的要移除） |
| `mobile/mobileSyncCore.test.ts` | 13 | 手機送出的完整路徑：拉→追加→推、省流量、token 換新、失敗不丟東西 |
| `mobile/mobileCapture.test.ts` | 8 | **flush 互斥**（曾經的真 bug） |

### 挑這些來測的理由

同步的 bug 有個共同特徵：**症狀出現的時間與地點，離出錯的地方很遠**。所以測試集中在
「真機上很難驗、驗錯了又很傷」的規則上，以下五條都對應過真實或差點發生的資料損失：

1. **推送失敗不能記成已推**（`syncEngine.test.ts`）——記錯的話那塊板從此再也不會上傳，
   而且完全沒有徵兆，雲端就是默默少一塊板。
2. **本機刪掉的板不能被拉回來**——「雲端有、本機沒有 ⇒ 拉回」的直覺會讓刪掉的板自己長回來。
   判斷依據是 `state.pushed[id]` 有紀錄＝我們曾經有過它；安全閥是遠端版本比我們最後推的還新
   就照常拉回（代表另一台裝置在我們刪除之後又改過它）。
3. **正在編輯的板不能被靜默覆蓋**——引擎跳過活躍板、只發提示事件。
4. **一塊壞板不能卡住全部**——早期版本第一個失敗就中止整輪，連拉取都不跑。
5. **手機 flush 必須互斥**——四個觸發點（開啟 App／回前台／恢復連線／按送出）並發時，
   兩輪會各自拉同一份雲端收件匣、各自追加後推上去：後推的蓋掉先推的，且若前一輪已清 outbox，
   後一輪會把同一則再追加一次＝**雲端出現重複卡片**。

### 為什麼 mock 儲存層而不引入 fake-indexeddb

手機端的 outbox 與憑證存在 IndexedDB（service worker 讀不到 localStorage，見 mobile-pwa.md）。
測試改用 `vi.mock('./mobileStore')` 換掉整層，而**不是**為此裝 `fake-indexeddb`——
要測的是同步決策，不是 IndexedDB 本身能不能存東西。`fake-indexeddb` 仍列在藍圖裡，
用途是測 Dexie schema 升級（那才真的需要一個會跑 upgrade 的 IndexedDB）。

`mobileSyncCore` 走原生 `fetch`，測試用 `vi.stubGlobal('fetch', …)` 依序回應，
因此連「401 → 換 token → 重試」這種多段流程都測得到，不必碰真實 Supabase。

### 手機端手動測試流程

自動化測不到的部分：真實的 service worker、真實的行動網路、真實的手機瀏覽器。

```bash
npm run build:mobile     # ⚠️ 一定要重新 build，preview 吃的是 dist-mobile/ 的檔案
npx vite preview --config vite.config.mobile.ts --host 0.0.0.0 --port 4173
```

手機連同一個 Wi-Fi，開 `http://<桌機區網IP>:4173/`（用 `ipconfig` 查，IP 會變）。
逐項驗：

- [ ] 填設定 → 登入 → 進入速記畫面
- [ ] 打字 → 送出 → 出現「已送出 N 則，收件匣現在有 M 張卡」
- [ ] 桌機開 App → 收件匣多出那張卡（自動同步最慢 60 秒，或按「⟳ 立即完整同步」）
- [ ] **卡片來源可辨識**：手機建的 shape id 前綴是 `m_`，桌機速記是 `qc_`
- [ ] 開飛航模式 → 送出 → 出現「N 待送」與待送清單、速記沒有消失
- [ ] 關閉飛航模式 → 回到前台 → 自動補送
- [ ] 登出 → **待送清單仍看得見**（這是刻意的，見 mobile-pwa.md）

### 已知陷阱（都實際踩過）

| 陷阱 | 說明 |
|------|------|
| **service worker 會快取舊版** | 改完程式重測時載到的可能是舊 app shell。手機上重新整理兩次，或清掉該網站資料 |
| **區網是 http，SW 註冊不了** | Service worker 需要安全來源。區網只測得到功能，**測不到離線開啟與 Android 背景同步**；要驗那些得先部署到 HTTPS 主機 |
| **忘了 `npm run build:mobile`** | `vite preview` 服務的是已建置的檔案，不是原始碼 |
| **背景同步只有 Android 有** | iOS Safari 沒有 Background Sync API。iOS 上只驗得到「回到前台就補送」 |

### 用 Electron 視窗當手機測試載體（可複用手法）

不想每次都拿手機測時，可以用專案已有的 Electron 開一個視窗載入 PWA，再用 CDP 驅動——
好處是**截得到圖、讀得到 IndexedDB 與 service worker 狀態**：

```bash
# 一個最小的 Electron app（main.cjs + package.json），BrowserWindow 載入 preview 網址
electron.exe --icu-data-dir=node_modules/electron/dist --remote-debugging-port=9333 <該資料夾>
```

接 `http://127.0.0.1:9333/json` 拿頁面目標後即可 `Runtime.evaluate`。實測可驗到：
`navigator.serviceWorker.getRegistrations()`（註冊成功與否）、`'sync' in registration`
（Background Sync 可用性）、直接讀 `astrolabe-mobile` 這個 IndexedDB 確認 outbox 內容。

⚠️ **Electron 的 browser-level `Target.createTarget` 不支援**（回 `Not supported`），
不能用它在既有實例裡開新分頁，必須另外起一個 Electron 實例。

---

## 高風險脆弱點（測試優先度排序）

以下區域在代碼審查中發現了多個 bug，邏輯複雜，建議優先引入測試覆蓋。標註 ✅ 者已有單元測試覆蓋（至少部分）。

### 1. `useBoardManager` 非同步操作序列（最高優先）✅ 已全覆蓋

**脆弱原因**：多個 async handler 有精確的操作順序依賴（await → setState → await），順序錯誤會造成 UI 與 DB 不一致。

過去發生的 bug：
- C1：`deleteBoard` 未 await 導致 fire-and-forget
- C2：迴圈並發刪除導致 `setTrashCount(0)` 過早執行
- M1：`setBoards` 在 `saveBoard` 完成前執行，`refreshTrashCount` 讀到舊資料

**建議測試**：mock Dexie + 測試 async 序列；驗證 `setBoards` 在正確時機被呼叫。

**現況**：`useBoardManager.test.ts` 已覆蓋**所有 handler**，包含先前缺口 `handleSoftDeleteBoardWithInboxMove`、`handleMoveCardToBoard`、`handleSaveJournal`（snapshot 搬卡/寫入）、`handleSetParent`（含 400ms setTimeout 發事件，用 fake timers）、`handleJump`/`handleGoToWeeklyCard`（jumpRef spy）、`handleRestore`/`handleEmptyTrash`/`handleRestoreBoard` 等。

### 2. `snapshot.ts` 工具函式（高優先）✅ 已全覆蓋

**脆弱原因**：操作不透明的 tldraw `TLEditorSnapshot` 格式，型別為 opaque，必須手動 cast。

過去發生的 bug：
- M11：`sanitizeSnapshot` 未處理 frame/arrow shape
- M6：存入垃圾桶前未 sanitize，導致還原失敗

**建議測試**：純函式，無副作用，最適合單元測試。測試案例（`snapshot.test.ts` 24 案例已全數覆蓋）：
- ✅ `sanitizeCardProps` 補齊所有缺失欄位
- ✅ `sanitizeSnapshot` 處理含 frame/arrow 的 snapshot
- ✅ `toMutableSnapshot` 確保 document/store 結構完整、深拷貝隔離
- ✅ `getCardShapes` 正確過濾非 card shape
- ✅ `sanitizePageRecords`/`sanitizeDocumentRecord`（補缺 vs 完整時回同 reference）

### 3. Ctrl+Z 與垃圾桶同步（中優先）

**脆弱原因**：依賴 `recentlyTrashedShapeIds` ref 在 `editor.store.listen` 回呼中正確比對，切板場景下的狀態追蹤複雜。

過去發生的 bug：
- C4：`recentlyTrashedShapeIds` 提升前，切板後 Ctrl+Z 造成資料重複

**建議測試**：e2e 測試（Playwright）模擬：刪卡片 → 切板 → 切回 → Ctrl+Z → 驗證垃圾桶數量。

### 4. Dexie schema 升級（中優先）

**脆弱原因**：schema 升級（`db.version(x).upgrade()`）只在用戶首次執行新版本時觸發，測試困難。

過去發生的 bug：
- L5：`version(7)` 未對舊資料建立 `shapeId` index

**建議測試**：建立含舊版 schema 資料的測試用 DB，升級後驗證 index 完整性。

### 5. `exportMarkdown.ts` 轉換邏輯（低優先）✅ 已覆蓋

**脆弱原因**：`htmlToMarkdown` 的 DOMParser 遞迴轉換，邊緣案例多（空節點、巢狀清單、特殊字元）。

**建議測試**：snapshot 測試，固定輸入 HTML → 驗證輸出 Markdown 字串不變。

**現況**：`exportMarkdown.test.ts` 15 案例已覆蓋 `htmlToMarkdown`/`cardToMarkdown`（為可測性把兩函式改為 `export function`，邏輯未動）。

---

## 手動測試重點清單

每次修改涉及下列功能時，應手動驗證：

### 卡片垃圾桶流程

- [ ] 選取卡片 → Delete 鍵 → 卡片消失、垃圾桶 badge +1
- [ ] 選取卡片 → Delete → 立刻 Ctrl+Z → 卡片回來、badge -1
- [ ] 刪卡片 → 切板 → 切回 → Ctrl+Z → 正確行為（不重複）
- [ ] TrashPanel 開啟時即時顯示新刪除的卡片（不需重開面板）
- [ ] 還原卡片 → 正確出現在原始白板
- [ ] 永久刪除卡片 → Ctrl+Z 無效（history 已清空）

### 白板垃圾桶流程

- [ ] 刪除白板 → DeleteBoardDialog 顯示卡片預覽
- [ ] 勾選「將卡片移到收件匣」→ 刪除 → 收件匣有對應卡片
- [ ] 垃圾桶白板 tab 正確顯示已刪白板
- [ ] 還原白板 → 白板回到側邊欄
- [ ] 清空垃圾桶 → badge 歸零、TrashPanel 清空

### 多板 Ctrl+Z 邊緣案例

- [ ] 板 A 刪卡片 → 切到板 B → 切回板 A → Ctrl+Z → 只有板 A 的記錄被清除
- [ ] 連續刪除多張卡片 → 連續 Ctrl+Z → 依序還原，垃圾桶數量正確

### 資料持久性

- [ ] 建立卡片 → 關閉 App → 重開 → 資料仍在
- [ ] 刪除卡片 → 關閉 App → 重開 → 垃圾桶仍有記錄
- [ ] 備份 → 還原 → 所有白板資料正確

### 雲端同步（桌機端）

- [ ] 改一塊板 → 約 4 秒後狀態列回到「已同步」
- [ ] 斷網 → 改板 → 狀態列顯示「N 塊待上傳」→ 恢復連線後自動補上
- [ ] **正在開著的板**在另一端被改 → 跳提示而**不是**直接換掉畫布內容；按「立即載入」才套用
- [ ] 非活躍板在另一端被改 → 自動套用，跳一則「已從雲端更新 N 塊白板」
- [ ] 刪除白板 → 另一端同步後也進垃圾桶（**不會復活**）
- [ ] 登出 → 狀態列顯示「已登出，請重新登入」（而不是「未啟用」）

> ⚠️ **驗畫面時要留意：開 App 本身就會觸發同步。** 自動同步上線後，用 run-desktop skill
> 啟動 App 會依設計把 vault 推上雲。若只是要看畫面、不想動到雲端，先在雲端同步面板
> 取消「自動同步」勾選。**`--user-data-dir` 沒有用**——`main.js` 寫死了 `app.setPath('userData', …)`
> 會覆蓋它，而且打包版與 `ELECTRON_PROD_TEST=1` 本來就是同一份 vault（同 file:// origin）。

### 手機速記（PWA）

見上方「雲端同步與手機端（PWA）的測試」章節的完整清單與陷阱。

---

## 自動化測試藍圖

### 工具組合

| 測試層級 | 工具 | 適用範圍 | 狀態 |
|---------|---------|---------|------|
| 單元測試 | Vitest | 純函式工具、資料層、`useBoardManager`/`useBacklinks`、純 UI 元件（`vi.mock` 換掉 Dexie/tldraw）| ✅ 已導入 |
| 同步決策測試 | Vitest（mock `boardSync`／`mobileStore`／`fetch`） | 推拉判斷、活躍板保護、刪除不復活、flush 互斥、token 換新 | ✅ 已導入 |
| 整合測試 | Vitest + fake-indexeddb | 真實 Dexie schema、`db.ts` 升級邏輯 | ⬜ 未開始 |
| E2E 測試 | Playwright | 完整使用者流程（刪除/還原/切板/Ctrl+Z）、重綁 tldraw Editor 的元件 | ⬜ 未開始 |
| 手機端手動測試 | 真實手機 + 區網 preview／Electron + CDP | service worker、離線 outbox、跨裝置往返 | ✅ 有流程（見專章） |

### 後續引入順序建議

1. ✅ ~~安裝 Vitest，從純函式開始寫單元測試~~（已完成）
2. ✅ ~~用 `vi.mock` 替換 Dexie，測試 `useBoardManager` 的 async handlers~~（已完成：全 handler 覆蓋）
3. ✅ ~~補完 `useBoardManager` 剩餘 handler 與其餘 utils（`snapshot`/`boardDb`/`boardExport`/`embedUtils`）、`useBacklinks`、純 UI 元件~~（已完成）
4. 引入 `fake-indexeddb` 跑真實 Dexie，測試 schema 升級（如 L5 的 `shapeId` index）— **下一個建議目標**
5. 最後引入 Playwright e2e（成本最高，但可捕捉 Ctrl+Z 同步等整合問題；也用於 `WhiteboardTools`/`*Content` 等重綁 tldraw 的元件）

### fake-indexeddb 用於 Dexie 測試（待引入）

```typescript
// 測試檔案範例
import 'fake-indexeddb/auto'
import { db } from '../src/db'

test('deletedCards shapeId index 存在', async () => {
    await db.table('deletedCards').add({ shapeId: 'test', boardId: 'b1', ... })
    const result = await db.table('deletedCards').where('shapeId').equals('test').first()
    expect(result?.shapeId).toBe('test')
})
```

---

## 維護注意事項

- **CI 閘門**：`.github/workflows/ci.yml`（GitHub Actions）在 push 到 main 與對 main 的 PR 時自動跑 `npm run lint`、`npx tsc -b`、`npm run test:coverage`，任一失敗即紅燈；覆蓋率報告以 artifact（`coverage-report`）上傳保留 14 天。本機提交前也可手動跑同樣三項先行驗證。
- **覆蓋率**：`npm run test:coverage`（`@vitest/coverage-v8`）本機產出 `coverage/`（text + html + lcov）。**刻意不設 threshold**——測試聚焦純函式與關鍵路徑，不為數字硬測 UI 樣板（見 refactor-roadmap 的過度優化取捨）。報告用來找「該測而未測」的純邏輯，而非追百分比。三項皆綠仍不等同於功能正確性，修改任何 async handler 前應一併更新手動測試清單。修改 `useBoardManager` 既有 handler 時，先確認 `useBoardManager.test.ts` 仍綠（已全 handler 覆蓋，是重構 TD2/A2 拆分時的安全網）。
- `WhiteboardTools.tsx` 與 tldraw editor 深度耦合，e2e 測試難以 mock。若要測試 Ctrl+Z 同步，建議直接用 Playwright 驅動完整 Electron 應用。
- `useBoardManager` 的 `useCallback` dependencies 複雜，引入整合測試時需特別確認 stale closure 場景（空板、只有 inbox 等邊緣狀態）。

## 待確認

- CI 已建立、coverage 已納入（見上）。後續可考慮在 GitHub 設定 branch protection，把 CI 設為合併 PR 的 required check。
- Playwright 測試 Electron App 需要特殊設定（`_electron` API）；是否考慮先以純 Web 模式（`npm run dev`）跑 e2e，再逐步遷移到 Electron？

## 外部參考

- [Vitest 文件](https://vitest.dev/)
- [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB)
- [Playwright Electron 測試](https://playwright.dev/docs/api/class-electronapplication)
