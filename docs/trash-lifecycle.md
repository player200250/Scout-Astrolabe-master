# 垃圾桶生命週期

## 目的

說明卡片與白板從「正常」狀態進入垃圾桶的完整流程，包括軟刪除機制、14 天自動清除、Ctrl+Z 同步、還原流程，以及永久刪除後的 editor 清理。

## 適用範圍

`src/hooks/useBoardManager.ts`（白板軟/永久刪除）、`src/components/WhiteboardTools.tsx`（卡片軟刪除、Ctrl+Z 同步）、`src/TrashPanel.tsx`（還原/永久刪除卡片）、`src/db.ts`（`deletedCards` table、`boards.deletedAt` 欄位）。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/db.ts` | `deletedCards` table 定義；`BoardRecord.deletedAt` |
| `src/hooks/useBoardManager.ts` | 白板 CRUD：軟刪、永久刪、還原、清空垃圾桶 |
| `src/components/WhiteboardTools.tsx` | 卡片軟刪除（Delete 鍵/右鍵）、Ctrl+Z 同步、permanent-delete-shape 接收 |
| `src/TrashPanel.tsx` | 垃圾桶 UI：卡片/白板列表、還原、永久刪除 |
| `src/ContextMenu.tsx` | 右鍵選單「刪除」觸發 `saveCardToTrash` |
| `src/useHotkeys.ts` | Delete 鍵觸發 `onDeleteShapes` |

---

## 兩種軟刪除目標

Scout Astrolabe 有兩類可被刪除的物件，機制略有差異：

| 物件 | 儲存位置 | 軟刪除標記 | 還原方式 |
|------|---------|-----------|---------|
| 卡片（card shape） | `deletedCards` table | 獨立 record（`deletedAt` 欄位） | 從 table 讀取 → `editor.createShape` |
| 白板（board） | `boards` table | `boards.deletedAt = Date.now()` | 清除 `deletedAt` → `saveBoard` |

---

## 卡片軟刪除流程

### 觸發路徑

| 觸發 | 元件 |
|------|------|
| 選取卡片後按 `Delete` | `useHotkeys.ts` → `onDeleteShapes()` |
| 右鍵選單 → 刪除 | `ContextMenu.tsx` → `saveCardToTrash()` |

### `onDeleteShapes` 完整流程

```
useHotkeys.onDeleteShapes(selectedIds)
  → for each shapeId:
      shape = editor.getShape(shapeId)
      sanitizedProps = sanitizeCardProps(shape.props)
      recentlyTrashedShapeIds.current.add(shapeId)
      saveCardToTrash({
          shapeId,
          boardId: activeBoardId,
          boardName,
          shapeData: { ...shape, props: sanitizedProps },
          deletedAt: Date.now(),
          type: shape.props.type,
          preview: getCardPreview(shape.props)
      })
  → editor.deleteShapes(selectedIds)  // 從 tldraw editor 移除
```

### `saveCardToTrash`（寫入 DB）

```typescript
// db.ts 的 deletedCards table
await db.table('deletedCards').add({
    id: generateId(),
    shapeId,
    boardId,
    boardName,
    shapeData,       // 已 sanitize 的 shape（含 props）
    deletedAt,
    type,
    preview          // 純文字摘要，用於 TrashPanel 顯示
})
```

`shapeData` 在存入前呼叫 `sanitizeCardProps`，確保還原時 `editor.createShape` 不會因缺少必要欄位而失敗。

---

## Ctrl+Z 與垃圾桶同步

刪除卡片後，tldraw 的 undo/redo history 仍記錄這次操作。按 Ctrl+Z 會讓 tldraw 將 shape 加回 editor store，但 `deletedCards` DB 中仍有記錄，造成重複。

### `recentlyTrashedShapeIds` ref

```typescript
// useBoardManager.ts — 提升到此層，防止切板後重置
const recentlyTrashedShapeIds = useRef<Set<string>>(new Set())
```

此 ref 跟蹤「最近剛加入垃圾桶、尚未被永久刪除的 shape id」。

### `editor.store.listen` 監聽 undo

```typescript
// WhiteboardTools.tsx
editor.store.listen(({ changes }) => {
    for (const [id, shape] of Object.entries(changes.added)) {
        if (recentlyTrashedShapeIds.current.has(id.replace('shape:', ''))) {
            // Ctrl+Z 還原了這個 shape → 從 deletedCards 移除
            db.table('deletedCards')
                .where('shapeId').equals(id.replace('shape:', ''))
                .delete()
            recentlyTrashedShapeIds.current.delete(id.replace('shape:', ''))
            window.dispatchEvent(new CustomEvent('trash-count-changed'))
        }
    }
})
```

`changes.added` 代表 tldraw store 中新增的 shape（包含 undo 還原的 shape），透過與 `recentlyTrashedShapeIds` 比對，識別出「從垃圾桶 undo 回來」的卡片並清除 DB 記錄。

### 切板不重置 ref

`recentlyTrashedShapeIds` 在 `useBoardManager` 宣告（而非 `WhiteboardTools`），因此切換白板時不會因 re-mount 而清空。若改為在 `WhiteboardTools` 內宣告，切板後的 Ctrl+Z 無法找到對應記錄，垃圾桶會出現已消失的卡片（Bug C4 修復）。

---

## 白板軟刪除流程

```
使用者點「×」（BoardTabBar / BoardOverview）
  → App.handleDeleteWithConfirm(id) → setDeletingBoardId(id)
  → 渲染 DeleteBoardDialog

使用者確認（moveToInbox: boolean）
  → handleSoftDeleteBoardWithInboxMove(id, moveToInbox)

  [若 moveToInbox]
    → 取 inbox board，複製所有 card shapes（新 id）到 inbox snapshot
    → saveBoard(updatedInbox)

  → board.deletedAt = Date.now()
  → saveBoard(deletedBoard)   // DB 標記軟刪除
  → setBoards(prev => 移除此板 + 更新 inbox)  // 函式式更新
  → refreshTrashCount()
```

白板進入垃圾桶後，`boards.deletedAt` 有值，`useBoardManager` 的 `boards` state 僅包含 `deletedAt` 為 falsy 的白板，因此不會出現在側邊欄。

**注意（M9 設計決策）**：白板內的卡片不會逐一寫入 `deletedCards`，只能還原整個白板才能取回。

---

## TrashPanel 顯示邏輯

```typescript
// TrashPanel.tsx — 兩個 tab
// tab 1：卡片
const cards = await db.table('deletedCards').orderBy('deletedAt').reverse().toArray()

// tab 2：白板
const trashedBoards = await db.table('boards')
    .filter(b => !!b.deletedAt)
    .toArray()
    .sort((a, b) => b.deletedAt - a.deletedAt)
```

`TrashPanel` 在 mount 時呼叫 `load()`，並監聽 `trash-count-changed` 事件（M7 修復）：

```typescript
useEffect(() => {
    const handler = () => load()
    window.addEventListener('trash-count-changed', handler)
    return () => window.removeEventListener('trash-count-changed', handler)
}, [])
```

---

## 卡片還原流程

```
TrashPanel.handleRestoreCard(id)
  → record = await db.table('deletedCards').get(id)    // M8 修復：直接查 DB，不用 state
  → window.dispatchEvent(new CustomEvent('restore-deleted-card', { detail: record }))

WhiteboardTools useEffect（接收 restore-deleted-card）
  → 若 record.boardId !== activeBoardId：
      切換到目標白板後再建立
  → editor.createShape({ ...record.shapeData })
  → db.table('deletedCards').delete(id)
  → recentlyTrashedShapeIds.current.delete(record.shapeId)
  → dispatchEvent('trash-count-changed')
```

---

## 永久刪除卡片

```
TrashPanel.handlePermanentDeleteCard(id)
  → record = await db.table('deletedCards').get(id)    // M8：直接查 DB
  → db.table('deletedCards').delete(id)
  → window.dispatchEvent(new CustomEvent('permanent-delete-shape', {
        detail: { shapeId: record.shapeId, boardId: record.boardId }
    }))

WhiteboardTools useEffect（接收 permanent-delete-shape）
  → recentlyTrashedShapeIds.current.delete(shapeId)
  → editor.clearHistory()   // 防止 Ctrl+Z 將已永久刪除的 shape 再次還原
```

`editor.clearHistory()` 清空整個 undo/redo stack，確保永久刪除後使用者無法透過 Ctrl+Z 復原。**副作用**：同一白板上其他操作的 undo history 也會被清除。

---

## 14 天自動清除

```typescript
// useBoardManager.ts — App 啟動時執行
const TRASH_TTL_MS = 14 * 24 * 60 * 60 * 1000  // 14 天

// 清除過期卡片
await db.table('deletedCards')
    .filter(r => Date.now() - r.deletedAt > TRASH_TTL_MS)
    .delete()

// 清除過期白板（永久刪除）
const expiredBoards = await db.table('boards')
    .filter(b => !!b.deletedAt && Date.now() - b.deletedAt > TRASH_TTL_MS)
    .toArray()
for (const board of expiredBoards) {
    await deleteBoard(board.id)
}
await refreshTrashCount()
```

每次 App 啟動時執行一次，不在執行期間定期掃描。

---

## 清空垃圾桶（handleEmptyTrash）

```typescript
const handleEmptyTrash = useCallback(async () => {
    // 永久刪除所有垃圾桶白板（含 orphan cleanup）
    const trashedBoards = await db.table('boards').filter(b => !!b.deletedAt).toArray()
    for (const b of trashedBoards) {
        await deleteBoard(b.id)   // C2 修復：逐一 await，不並發
        await cleanupOrphanBoardCards(snapshot, b.id)
    }

    // 清空 deletedCards
    await db.table('deletedCards').clear()

    setTrashCount(0)
}, [...])
```

`cleanupOrphanBoardCards` 是純函式（L3 修復），掃描 tldraw snapshot 移除指向已刪白板的 board card shapes。

---

## trashCount 計算

```typescript
// refreshTrashCount
const boardsCount = await db.table('boards').filter(b => !!b.deletedAt).count()
const cardsCount = await db.table('deletedCards').count()
setTrashCount(boardsCount + cardsCount)
```

`trashCount` 顯示於側邊欄垃圾桶圖示的 badge。由 `refreshTrashCount` 更新，觸發時機：
- 任何軟刪除/還原/永久刪除操作完成後
- `trash-count-changed` CustomEvent 觸發時

---

## 維護注意事項

- 新增卡片類型（`CardType`）時，`TrashPanel.getCardPreview()` 需更新對應的摘要格式，否則新類型的卡片在垃圾桶顯示空白預覽。
- `editor.clearHistory()` 在永久刪除時清空整個 undo stack，若未來需要更細粒度的控制（只清除特定操作），需要改用 tldraw 的 history 標記機制（待確認 API 是否支援）。
- `recentlyTrashedShapeIds` 是 `Set<string>` ref，切板後不清空是正確設計，但若使用者長時間不關閉 App，此 Set 可能累積大量 id。目前未見清理邏輯，為潛在的記憶體微量洩漏（低風險）。

## 待確認

- 14 天自動清除僅在 App **啟動時**執行。若使用者讓 App 長時間不重開（休眠），14 天期限的計算仍以 DB 的 `deletedAt` 為準，不影響正確性，但卡片不會在到期當下立即被清除。
- 白板永久刪除（`deleteBoard`）的內部實作是否也清理對應的 `deletedCards`？或是保留孤兒 card records？（需確認 `db.ts` 的 cascade 邏輯）

## 外部參考

- [tldraw editor.store.listen](https://tldraw.dev/reference/editor/Editor#store)
- [Dexie.js filter + delete](https://dexie.org/docs/Collection/Collection.delete())
