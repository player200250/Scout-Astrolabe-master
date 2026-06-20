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

**單元測試已導入（Vitest 3.2.6），目前 22 檔 228 案例全綠。** 設定寫在 `vite.config.ts` 的 `test` 區塊（`include: src/**/*.{test,spec}.{ts,tsx}`）；指令 `npm test`（`vitest run`）、`npm run test:watch`。已裝 `jsdom`、`@testing-library/react`、`@testing-library/dom`（未裝 `@testing-library/jest-dom`，斷言用 `.toBeTruthy()`/`.toBeNull()`）。純函式測試跑 node 環境、需要 DOM 的單檔以 `// @vitest-environment jsdom` 切換。

已覆蓋的測試檔：

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

**Hooks**

| 檔案 | 案例 | 重點 |
|------|------|------|
| `hooks/useBoardManager.test.ts` | 43 | **全 handler 覆蓋**：建立/重新命名/切換/導航/資料夾/軟刪/永久刪/搬卡進 Inbox/跳轉/排序/垃圾桶/還原（`vi.mock` 換掉 Dexie 層，`renderHook`+`act`）|
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
2. **TypeScript 型別檢查**（`npx tsc --noEmit`）
3. **手動操作測試**（開發者本地驗證，見下方重點清單）
4. **代碼審查**（BUGS.md 中的全面驗證報告，2026-05-07）

尚未覆蓋：Dexie schema 升級（待 fake-indexeddb）、Ctrl+Z 與垃圾桶的多板同步、重綁 tldraw Editor 的元件（`*Content`、`WhiteboardTools`、`CardShapeUtil` 等）—— 後兩者屬 E2E（Playwright）範疇。

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

**現況**：`useBoardManager.test.ts`（43 案例）已覆蓋**所有 handler**，包含先前缺口 `handleSoftDeleteBoardWithInboxMove`、`handleMoveCardToBoard`、`handleSaveJournal`（snapshot 搬卡/寫入）、`handleSetParent`（含 400ms setTimeout 發事件，用 fake timers）、`handleJump`/`handleGoToWeeklyCard`（jumpRef spy）、`handleRestore`/`handleEmptyTrash`/`handleRestoreBoard` 等。

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

---

## 自動化測試藍圖

### 工具組合

| 測試層級 | 工具 | 適用範圍 | 狀態 |
|---------|---------|---------|------|
| 單元測試 | Vitest | 純函式工具、資料層、`useBoardManager`/`useBacklinks`、純 UI 元件（`vi.mock` 換掉 Dexie/tldraw）| ✅ 已導入 |
| 整合測試 | Vitest + fake-indexeddb | 真實 Dexie schema、`db.ts` 升級邏輯 | ⬜ 未開始 |
| E2E 測試 | Playwright | 完整使用者流程（刪除/還原/切板/Ctrl+Z）、重綁 tldraw Editor 的元件 | ⬜ 未開始 |

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

- **CI 閘門**：`.github/workflows/ci.yml`（GitHub Actions）在 push 到 main 與對 main 的 PR 時自動跑 `npm run lint`、`npx tsc -b`、`npm test`，任一失敗即紅燈。本機提交前也可手動跑同樣三項先行驗證。三項皆綠仍不等同於功能正確性，修改任何 async handler 前應一併更新手動測試清單。修改 `useBoardManager` 既有 handler 時，先確認 `useBoardManager.test.ts` 仍綠（已全 handler 覆蓋，是重構 TD2/A2 拆分時的安全網）。
- `WhiteboardTools.tsx` 與 tldraw editor 深度耦合，e2e 測試難以 mock。若要測試 Ctrl+Z 同步，建議直接用 Playwright 驅動完整 Electron 應用。
- `useBoardManager` 的 `useCallback` dependencies 複雜，引入整合測試時需特別確認 stale closure 場景（空板、只有 inbox 等邊緣狀態）。

## 待確認

- CI 已建立（見上）。後續可考慮在 GitHub 設定 branch protection，把 CI 設為合併 PR 的 required check，並視需要加上 coverage 量測。
- Playwright 測試 Electron App 需要特殊設定（`_electron` API）；是否考慮先以純 Web 模式（`npm run dev`）跑 e2e，再逐步遷移到 Electron？

## 外部參考

- [Vitest 文件](https://vitest.dev/)
- [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB)
- [Playwright Electron 測試](https://playwright.dev/docs/api/class-electronapplication)
