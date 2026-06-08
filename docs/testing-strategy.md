# 測試策略

## 目的

說明 Scout Astrolabe 目前的測試現況、已識別的高風險脆弱點、手動測試重點區域，以及未來擴大自動化測試的建議方向。

## 適用範圍

整個 `src/` 目錄。單元測試已導入（Vitest），覆蓋純函式工具與 `useBoardManager` hook 的部分 handler；尚無整合（fake-indexeddb）與 E2E（Playwright）測試。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/hooks/useBoardManager.ts` | 最複雜的業務邏輯、最高測試優先度 |
| `src/utils/snapshot.ts` | 純函式工具集，最易單元測試 |
| `src/utils/exportMarkdown.ts` | 純函式，適合 snapshot 測試 |
| `src/db.ts` | Dexie schema 升級，最難模擬 |

---

## 目前測試現況

**單元測試已導入（Vitest 3.2.6），目前 8 檔 79 案例全綠。** 設定寫在 `vite.config.ts` 的 `test` 區塊；指令 `npm test`（`vitest run`）、`npm run test:watch`。已裝 `jsdom`、`@testing-library/react`、`@testing-library/dom`，純函式測試跑 node 環境、需要 DOM 的單檔以 `// @vitest-environment jsdom` 切換。

已覆蓋的測試檔：

| 檔案 | 案例 | 重點 |
|------|------|------|
| `utils/weeklyReviewUtils.test.ts` | 9 | `getISOWeekKey`、`getWeekRange`（含 ISO 8601 年界邊界）|
| `utils/trashUtils.test.ts` | 14 | `getCardPreview`（HTML 剝除/截斷/fallback）|
| `utils/snapshot.test.ts` | 6 | `sanitizeCardProps`（含 reference 相等、無副作用）|
| `utils/colorSwatchUtils.test.ts` | 5 | `getContrastColor` |
| `utils/date.test.ts` | 10 | `toDateStr`/`formatDueDate`/`formatRelativeDate`（fake timers 凍結時間）|
| `utils/appEvents.test.ts` | 5 | `emitAppEvent`/`onAppEvent`（jsdom + `vi.fn()` 間諜）|
| `utils/exportMarkdown.test.ts` | 15 | `htmlToMarkdown`/`cardToMarkdown`（jsdom）|
| `hooks/useBoardManager.test.ts` | 15 | 建立/重新命名/切換/資料夾歸屬/軟刪/永久刪（`vi.mock` 換掉 Dexie 層，`renderHook`+`act`）|

`useBoardManager` 測試以 `vi.hoisted` 建立鏈式 Dexie 替身，`vi.mock('../utils/boardDb')` 與 `vi.mock('../db')` 換掉 DB 層，hook 在純記憶體裡跑。

開發驗證目前依賴：
1. **單元測試**（`npm test`）— 純函式 + `useBoardManager` 部分 handler
2. **TypeScript 型別檢查**（`npx tsc --noEmit`）
3. **手動操作測試**（開發者本地驗證，見下方重點清單）
4. **代碼審查**（BUGS.md 中的全面驗證報告，2026-05-07）

尚未覆蓋：`useBoardManager` 其餘 handler（`handleSetParent`/`handleSoftDeleteBoardWithInboxMove`/`handleMoveCardToBoard` 等較複雜的 snapshot 操作路徑）、Dexie schema 升級、Ctrl+Z 與垃圾桶的多板同步（屬 E2E 範疇）。

---

## 高風險脆弱點（測試優先度排序）

以下區域在代碼審查中發現了多個 bug，邏輯複雜，建議優先引入測試覆蓋。標註 ✅ 者已有單元測試覆蓋（至少部分）。

### 1. `useBoardManager` 非同步操作序列（最高優先）🟡 部分覆蓋

**脆弱原因**：多個 async handler 有精確的操作順序依賴（await → setState → await），順序錯誤會造成 UI 與 DB 不一致。

過去發生的 bug：
- C1：`deleteBoard` 未 await 導致 fire-and-forget
- C2：迴圈並發刪除導致 `setTrashCount(0)` 過早執行
- M1：`setBoards` 在 `saveBoard` 完成前執行，`refreshTrashCount` 讀到舊資料

**建議測試**：mock Dexie + 測試 async 序列；驗證 `setBoards` 在正確時機被呼叫。

**現況**：`useBoardManager.test.ts` 已覆蓋建立/重新命名/切換/資料夾歸屬，以及 `handleSoftDeleteBoard`、`handlePermanentDeleteBoard` 兩個 async handler（含孤兒收養）。`handleSoftDeleteBoardWithInboxMove`、`handleMoveCardToBoard` 等涉及 snapshot 搬卡的路徑尚未覆蓋。

### 2. `snapshot.ts` 工具函式（高優先）🟡 部分覆蓋

**脆弱原因**：操作不透明的 tldraw `TLEditorSnapshot` 格式，型別為 opaque，必須手動 cast。

過去發生的 bug：
- M11：`sanitizeSnapshot` 未處理 frame/arrow shape
- M6：存入垃圾桶前未 sanitize，導致還原失敗

**建議測試**：純函式，無副作用，最適合單元測試。測試案例：
- ✅ `sanitizeCardProps` 補齊所有缺失欄位（`snapshot.test.ts` 已覆蓋）
- `sanitizeSnapshot` 處理含 frame/arrow 的 snapshot
- `toMutableSnapshot` 確保 document/store 結構完整
- `getCardShapes` 正確過濾非 card shape

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
| 單元測試 | Vitest | 純函式工具、`useBoardManager` handler（`vi.mock` 換掉 Dexie）| ✅ 已導入 |
| 整合測試 | Vitest + fake-indexeddb | 真實 Dexie schema、`db.ts` 升級邏輯 | ⬜ 未開始 |
| E2E 測試 | Playwright | 完整使用者流程（刪除/還原/切板/Ctrl+Z）| ⬜ 未開始 |

### 後續引入順序建議

1. ✅ ~~安裝 Vitest，從純函式開始寫單元測試~~（已完成）
2. ✅ ~~用 `vi.mock` 替換 Dexie，測試 `useBoardManager` 的 async handlers~~（進行中：建立/刪除/切換/資料夾已覆蓋，搬卡路徑待補）
3. 補完 `useBoardManager` 剩餘 handler，特別是 `handleSoftDeleteBoardWithInboxMove`、`handleMoveCardToBoard`、`handleSaveJournal` 等 snapshot 操作
4. 引入 `fake-indexeddb` 跑真實 Dexie，測試 schema 升級（如 L5 的 `shapeId` index）
5. 最後引入 Playwright e2e（成本最高，但可捕捉 Ctrl+Z 同步等整合問題）

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

- 目前無 CI pipeline；提交前的本地 gate 是 `npm test`（單元測試）＋ `tsc --noEmit`（型別）。兩者皆綠仍不等同於功能正確性，修改任何 async handler 前應一併更新手動測試清單。修改 `useBoardManager` 既有 handler 時，先確認 `useBoardManager.test.ts` 仍綠（部分安全網）。
- `WhiteboardTools.tsx` 與 tldraw editor 深度耦合，e2e 測試難以 mock。若要測試 Ctrl+Z 同步，建議直接用 Playwright 驅動完整 Electron 應用。
- `useBoardManager` 的 `useCallback` dependencies 複雜，引入整合測試時需特別確認 stale closure 場景（空板、只有 inbox 等邊緣狀態）。

## 待確認

- 是否有計劃引入 CI/CD pipeline（GitHub Actions 等）？如有，`tsc --noEmit` 應作為 PR check 的第一步。
- Playwright 測試 Electron App 需要特殊設定（`_electron` API）；是否考慮先以純 Web 模式（`npm run dev`）跑 e2e，再逐步遷移到 Electron？

## 外部參考

- [Vitest 文件](https://vitest.dev/)
- [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB)
- [Playwright Electron 測試](https://playwright.dev/docs/api/class-electronapplication)
