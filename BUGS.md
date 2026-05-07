# Bug 清單（2026-05-06 掃描）

## Critical（4 項）

### C1 - handlePermanentDeleteBoard：deleteBoard 未 await
- 位置：`useBoardManager.ts` `handlePermanentDeleteBoard`
- 影響：DB 刪除是 fire-and-forget，若失敗則 UI 已更新但 DB 未變，重開後白板又出現；後續 orphan cleanup 也在 DB 操作完成前執行
- 狀態：已修（函式改為 async；`await deleteBoard(id)` 失敗時 alert 並 return，UI 不變）

### C2 - handleEmptyTrash：迴圈內 deleteBoard 未 await
- 位置：`useBoardManager.ts` `handleEmptyTrash`
- 影響：`for` 迴圈裡所有 `deleteBoard` 並發執行，接著立刻 `setTrashCount(0)`；若任一刪除失敗，垃圾桶已清空但 DB 仍有舊資料
- 狀態：已修（迴圈內改為 `await deleteBoard(b.id)`，確保逐一完成後才繼續）

### C3 - handleDelete 說是軟刪除但實際呼叫永久刪除
- 位置：`useBoardManager.ts:281-283`，`BoardTabBar` 的 `onDelete` prop
- 影響：使用者在側邊欄點「×」刪除白板是**永久刪除**，不會進垃圾桶，資料無法還原
- 狀態：已修（`handleSoftDeleteBoard` 移至 `handleDelete` 前宣告；`App.tsx` 加入 `TrashDialog` 確認步驟）

### C4 - 切換白板後 recentlyTrashedShapeIds 重置，Ctrl+Z 同步失效
- 位置：`WhiteboardTools.tsx`（`key={activeBoard.id}` 導致每次切板 re-mount）
- 影響：在板 A 刪卡片 → 切到板 B → 切回板 A → 按 Ctrl+Z，shape 回到白板但垃圾桶記錄不被清除，造成資料重複
- 狀態：待修

---

## Medium（11 項）

### M1 - handleSoftDeleteBoard：setBoards 在 saveBoard 完成前執行
- 位置：`useBoardManager.ts` `handleSoftDeleteBoard`
- 影響：`setBoards(next)` 在 `saveBoard` 完成前同步執行；若 DB 寫入慢，`refreshTrashCount` 查詢時 `deletedAt` 可能還未寫入，回傳舊計數
- 狀態：待修

### M2 - handleRestoreBoard：update 失敗時 UI 已更新
- 位置：`useBoardManager.ts` `handleRestoreBoard`
- 影響：Dexie `update` 失敗回傳 0 而非拋錯，但 `setBoards` 已執行，UI 顯示已還原但 DB 的 `deletedAt` 仍存在
- 狀態：待修

### M3 - handleSaveJournal 建立的 shape 缺少 preview 欄位
- 位置：`useBoardManager.ts:425-436`
- 影響：手動建立的 journal shape props 缺少 `preview`，`sanitizeCardProps` 啟動時會補，但原始 snapshot 不完整可能在某些路徑觸發驗證錯誤
- 狀態：待修

### M4 - handleAddCardToInbox 的 url 設為 null 而非空字串
- 位置：`useBoardManager.ts:523`
- 影響：`url: null` 與 `CARD_PROP_DEFAULTS` 的 `url: ''` 不一致，可能在連結卡片邏輯裡造成 `null` vs `''` 比較出錯
- 狀態：待修

### M5 - createTextCardWithContent 缺少 color、cardStatus、priority、tags
- 位置：`WhiteboardTools.tsx:119-122`
- 影響：從模板建立的卡片 props 不完整，若 card shape util 在補值前先驗證則報錯
- 狀態：待修

### M6 - saveCardToTrash 存入的 shapeData 沒有 sanitize
- 位置：`TrashPanel.tsx:368-391`
- 影響：還原卡片時若舊 shape 缺必要欄位，`editor.createShape` 可能驗證失敗（目前被 silent catch 吃掉，還原無聲無息地失敗）
- 狀態：待修

### M7 - TrashPanel 只在 mount 時 load() 一次，不會自動同步外部變更
- 位置：`TrashPanel.tsx:63`
- 影響：垃圾桶開著時，若 Ctrl+Z 或其他路徑變更了 DB，TrashPanel 的卡片列表不更新，與 badge 數字不一致
- 狀態：待修

### M8 - handlePermanentDeleteCard 依賴 stale deletedCards state
- 位置：`TrashPanel.tsx:83`
- 影響：tab 切換觸發 `load()` 重新載入後，`handlePermanentDeleteCard` 仍用舊 state 找 record，`shapeId` / `boardId` 可能對不上，導致 `permanent-delete-shape` 事件帶錯誤資料
- 狀態：待修

### M9 - 刪除整個白板時，白板內的卡片不會進 deletedCards
- 位置：`useBoardManager.ts` `handleSoftDeleteBoard`
- 影響：垃圾桶的「卡片」tab 不會顯示已刪白板內的卡片；使用者無法單獨還原白板裡的個別卡片（還原整個白板才能找回）
- 狀態：設計決策（需確認是否預期行為）

### M10 - 多個 window.addEventListener 在 React Strict Mode 下可能短暫重複
- 位置：`WhiteboardTools.tsx` 多個 `useEffect`
- 影響：Strict Mode 下 effect 執行兩次，cleanup 和 re-register 之間若有事件觸發，handler 執行兩次
- 狀態：低優先

### M11 - sanitizeSnapshot 未處理 frame、arrow 等非 card shape 的必要欄位
- 位置：`snapshot.ts` `sanitizeSnapshot`
- 影響：若 snapshot 含有 `frame` 或 `arrow` 且欄位缺失，載入時仍會報 ValidationError
- 狀態：待修

---

## Low（5 項）

### L1 - compressImage 沒有 timeout，圖片卡住時 Promise 永不 resolve
- 位置：`WhiteboardTools.tsx:22-46`
- 影響：若圖片載入既無 load 也無 error（極少數情況），Promise 永遠掛住，UI 卡死
- 狀態：低優先

### L2 - handleSaveBoard 的 saveBoard 失敗時 state 已更新
- 位置：`useBoardManager.ts:151-158`
- 影響：DB 寫入失敗時（無 catch），記憶體狀態和 DB 不一致；有自動備份機制緩解，但仍有資料遺失風險
- 狀態：低優先

### L3 - handleEmptyTrash 和 handlePermanentDeleteBoard 有重複的 orphan cleanup 邏輯
- 位置：`useBoardManager.ts` 兩個函式
- 影響：掃描 snapshot 清除 board card 的邏輯重複，維護時需同步修改兩處
- 狀態：低優先（重構）

### L4 - sanitizeBoards 的 dirty flag 用 reference equality 判斷
- 位置：`useBoardManager.ts:56-80`
- 影響：若 `sanitizeSnapshot` 或 `sanitizeDocumentRecord` 改為回傳新物件（即使內容相同），`dirty = true` 會觸發不必要的 DB 寫入
- 狀態：低優先

### L5 - db.version(7) 的 shapeId index 對現有舊資料沒有 migrate
- 位置：`db.ts`
- 影響：Dexie schema 升級只對新寫入資料建立 index，舊的 `deletedCards` record 的 `shapeId` 欄位沒有 index entry；`where('shapeId').equals(id)` 在舊資料上可能做 full scan（效能降低）
- 狀態：低優先

---

## 統計

| 嚴重程度 | 數量 | 已修 | 待修 |
|---|---|---|---|
| Critical | 4 | 3 | 1 |
| Medium | 11 | 0 | 10 |
| Low | 5 | 0 | 5 |
| **合計** | **20** | **3** | **16** |

（M9 列為設計決策，不計入待修）

---

最後更新：2026-05-07（C1、C2 已修）
