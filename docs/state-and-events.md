# 狀態管理與全域事件

## 目的

說明 `useBoardManager` 的狀態機設計、各 handler 的職責與相依關係，以及全域 `CustomEvent` 的完整清單（發送方 → 接收方映射）。

## 適用範圍

`src/hooks/useBoardManager.ts`、`src/App.tsx`（panel 狀態）、`src/components/WhiteboardTools.tsx`（事件橋接）、`src/components/card-shape/CardShapeUtil.tsx`（事件發送）。

## 相關檔案

| 檔案 | 狀態職責 |
|------|---------|
| `useBoardManager.ts` | 白板 CRUD、垃圾桶、收件匣、備份、導航 |
| `App.tsx` | Panel 開關狀態（searchOpen 等 10+ 個 boolean） |
| `WhiteboardTools.tsx` | tldraw editor 操作、事件橋接、自動儲存 |
| `CardShapeUtil.tsx` | 卡片內部狀態（hover、showTextModal、isEditing） |

---

## useBoardManager 狀態

```typescript
// 核心狀態
boards: BoardRecord[]           // 正常白板清單（不含已刪除）
activeBoardId: string | null
loading: boolean
navigationStack: string[]       // 麵包屑導航（從頂層到當前板）
sidebarCollapsed: boolean       // 持久化至 localStorage('sidebar-collapsed')
trashCount: number              // 垃圾桶卡片 + 白板總數

// Refs（不觸發 re-render）
jumpRef                         // 當前 editor 的跳轉函式
lastBackupRef                   // 上次備份時間（throttle 用）
recentlyTrashedShapeIds         // 提升至此的 Set，防切板後 Ctrl+Z 同步失效
```

---

## Handler 清單

### 白板 CRUD

| Handler | 說明 | 非同步 |
|---------|------|--------|
| `handleSaveBoard(snapshot, thumbnail)` | 更新當前白板的快照與縮圖 | 否（fire-and-forget catch） |
| `handleNew()` | 建立新白板，設為 active | 否 |
| `handleRename(id, name)` | 重新命名 | 否 |
| `handleCreateBoard(name, parentId?)` | 建立子白板（有 parentId）或普通白板 | 否 |
| `handleSoftDeleteBoard(id)` | 軟刪除：`deletedAt = Date.now()` | **是** |
| `handleSoftDeleteBoardWithInboxMove(id, moveToInbox)` | 軟刪除，可選先把卡片複製到收件匣 | **是** |
| `handlePermanentDeleteBoard(id)` | 永久刪除，清理孤兒 board card | **是** |
| `handleRestoreBoard(id)` | 從垃圾桶還原白板 | **是** |
| `handleEmptyTrash()` | 清空全部垃圾桶（白板 + 卡片） | **是** |

### 導航

| Handler | 說明 |
|---------|------|
| `handleSwitch(id)` | 切換到頂層白板（重置 navigationStack） |
| `handleSwitchToChild(id)` | 切換到子白板（追加到 navigationStack） |
| `handleBack()` | 返回上一層（navigationStack pop） |
| `handleSetParent(boardId, parentId)` | 設定/移除父白板關係 |
| `handleJump(boardId, shapeId, x, y)` | 跨白板跳轉到指定 shape |
| `handleGoToInbox()` | 切換到 inbox_board |

### 收件匣

| Handler | 說明 | 非同步 |
|---------|------|--------|
| `handleAddCardToInbox(text)` | 建立文字卡片到收件匣 snapshot | 否 |
| `handleMoveCardToBoard(shapeId, targetBoardId)` | 從收件匣移動卡片到目標白板 | 否 |

### 特殊白板

| Handler | 說明 |
|---------|------|
| `handleSetJournal(boardId, isJournal)` | 標記為 Journal 白板 |
| `handleSetStatus(boardId, status)` | 設定 active / archived / pinned |
| `handleSaveJournal(boardId, dateStr, html, shapeId)` | 從 JournalDayView 寫入日記內容 |
| `handleGoToWeeklyCard()` | 跳到本週的週回顧 shape |

### 其他

| Handler | 說明 |
|---------|------|
| `handleToggleCollapse()` | 側邊欄收合，持久化至 localStorage |
| `handleReorderBoards(activeId, overId)` | 拖曳重排，更新 sortOrder |
| `handleRestore(restoredBoards)` | 從備份還原（清空 + 重寫所有白板） |
| `handleCardTrashed()` | 卡片進垃圾桶後呼叫，刷新 trashCount |
| `refreshTrashCount()` | 查詢 DB 重算 trashCount |

---

## 軟刪除完整流程

```
使用者點「×」按鈕（BoardTabBar / BoardOverview）
  → App.handleDeleteWithConfirm(id)
  → setDeletingBoardId(id)
  → 渲染 DeleteBoardDialog

使用者確認（moveToInbox: boolean）
  → handleSoftDeleteBoardWithInboxMove(id, moveToInbox)
  
  若 moveToInbox && board.snapshot 有卡片：
    → 取 inboxBoard
    → toMutableSnapshot(inboxBoard.snapshot)
    → 將所有 card shapes 以新 id 插入 inbox store
    → saveBoard(updatedInbox)
  
  → board.deletedAt = Date.now()
  → saveBoard(deletedBoard)
  → setActiveBoardId(next[0]?.id ?? null) 若刪的是 active board
  → setBoards(prev => 移除被刪白板 + 更新 inbox)  ← 函式式更新，避免 stale closure
  → refreshTrashCount()
  → setDeletingBoardId(null)
```

---

## 全域事件系統（appEvents.ts）

本專案透過 `src/utils/appEvents.ts` 提供**型別安全的事件匯流排**，作為 tldraw React tree 與 App 層的橋接機制。

```typescript
// 所有事件的 payload 型別定義（AppEventPayloads interface）
// 發送：emitAppEvent('event-name', payload)
// 訂閱：const off = onAppEvent('event-name', detail => { ... })
//       cleanup 中呼叫 off()
```

底層仍使用 `window.CustomEvent`，但透過 TypeScript 泛型在**編譯期**驗證事件名稱拼寫與 payload 結構。

| 事件名稱 | 發送方 | 接收方 | detail 型別 |
|---------|--------|--------|------------|
| `board-card-enter` | `CardShapeUtil.onDoubleClick()` | `WhiteboardTools` useEffect | `{ linkedBoardId: string }` |
| `text-card-edit` | `CardShapeUtil.onDoubleClick()` | `CardShapeUtil.component()` useEffect | `{ shapeId: string }` |
| `jump-to-card` | `BacklinksPanel.tsx`、`SearchPanel.tsx` | `WhiteboardTools` useEffect | `{ boardId?: string; shapeId?: string; x?: number; y?: number; targetName?: string }` |
| `create-board-card-on` | `useBoardManager.handleSetParent()` | `WhiteboardTools` useEffect | `{ targetBoardId: string; linkedBoardId: string; boardName: string }` |
| `cleanup-orphan-board-cards` | `useBoardManager.handlePermanentDeleteBoard()` | `WhiteboardTools` useEffect | `{ deletedBoardId: string }` |
| `delete-shape-from-editor` | `useBoardManager.handleMoveCardToBoard()` | `WhiteboardTools` useEffect | `{ shapeId: string }` |
| `permanent-delete-shape` | `TrashPanel.handlePermanentDeleteCard()` | `WhiteboardTools` useEffect | `{ shapeId: string; boardId: string }` |
| `restore-deleted-card` | `TrashPanel.handleRestoreCard()` | `WhiteboardTools` useEffect | `DeletedCardRecord` |
| `quick-capture-card` | `useBoardManager.handleAddCardToInbox()` | `WhiteboardTools` useEffect（僅 isInboxBoard） | `{ text: string; x: number; y: number; shapeId: string }` |
| `trash-count-changed` | `WhiteboardTools`（Ctrl+Z undo sync）、`TrashPanel.handlePermanentDeleteCard()` | `useBoardManager` useEffect | `undefined`（無 payload） |

### 特別說明

**`jump-to-card`** 有兩種 payload：
1. `{ shapeId, boardId, x, y }`：跳到指定座標的 shape
2. `{ targetName }`：依白板名稱切換（`boards.find(b => b.name.toLowerCase() === targetName.toLowerCase())`）

**`quick-capture-card`** 只有當前板為 inbox 時才在 editor 建立 shape；非 inbox 板會忽略。`useBoardManager.handleAddCardToInbox()` 同時更新 inbox 的 snapshot（供非 inbox 板的 inboxCardCount 計算），以及發送事件（供 inbox 板的 editor 即時顯示）。

---

## App.tsx Panel 狀態

```typescript
// 面板開關（boolean state）
searchOpen          // SearchPanel
hotkeyOpen          // HotkeyPanel
overviewOpen        // BoardOverview
taskCenterOpen      // TaskCenter
filterOpen          // FilterPanel
reviewCenterOpen    // ReviewCenter
backupPanelOpen     // BackupPanel
movingCardShapeId   // MoveCardModal（string | null）
knowledgeGraphOpen  // KnowledgeGraph
cardLibraryOpen     // CardLibrary
quickCaptureOpen    // QuickCapture
onboardingOpen      // OnboardingModal
trashOpen           // TrashPanel
deletingBoardId     // DeleteBoardDialog（string | null）
overdueBannerVisible // 逾期任務 banner
```

**互斥規則**：`activePanel` 計算欄位（`cardLibraryOpen ? 'cardLibrary' : taskCenterOpen ? 'taskCenter' : ...`）傳給 `BoardTabBar` 用於側邊欄圖示 active 狀態，但多個面板在技術上可同時開啟（無強制互斥），視覺上可能重疊。

---

## 全域鍵盤快捷鍵（App 層）

在 `App.tsx` useEffect 中監聽：

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+Shift+O` | toggleOverview |
| `Ctrl+Shift+C` | toggleReviewCenter |
| `Ctrl+Shift+I` | goToInbox |
| `Ctrl+Shift+G` | toggleKnowledgeGraph |
| `Ctrl+Shift+L` | toggleCardLibrary |
| `Ctrl+Space` | toggleQuickCapture |
| `Ctrl+Shift+T` | toggleTrash |

在 `useHotkeys.ts`（WhiteboardTools 層）監聽：

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | undo / redo |
| `Ctrl+F` | openSearch |
| `Ctrl+/` | openHotkeyPanel |
| `N` | createTextCard |
| `T` | createTodoCard |
| `L` | createLinkCard |
| `I` | openImageInput |
| `Delete` | onDeleteShapes（含寫入垃圾桶） |

---

## Ctrl+Z 與垃圾桶同步

```
使用者按 Delete → useHotkeys.onDeleteShapes()
  → recentlyTrashedShapeIds.current.add(shapeId)
  → saveCardToTrash(...)
  → editor.deleteShapes(ids)

若使用者按 Ctrl+Z：
  → editor 還原 shape
  → WhiteboardTools 監聽 editor.store.listen(change.changes.added)
  → 若 added id 在 recentlyTrashedShapeIds → 從 deletedCards 刪除
  → 發送 trash-count-changed

若垃圾桶永久刪除：
  → 發送 permanent-delete-shape { shapeId, boardId }
  → WhiteboardTools 收到後 → recentlyTrashedShapeIds.delete(shapeId)
  → editor.clearHistory()（防止 Ctrl+Z 再次還原）
```

`recentlyTrashedShapeIds` 是 ref（不是 state），提升到 `useBoardManager` 後在切板時不會重置。

---

## 維護注意事項

- 新增 Panel 時，在 `App.tsx` 加 boolean state、在對應快捷鍵 useEffect 加 toggle，並確認多面板同時開啟的視覺行為。
- 新增事件時：①在 `src/utils/appEvents.ts` 的 `AppEventPayloads` 新增事件名稱與 payload 型別，②在本文件的清單表格補充，③接收方使用 `onAppEvent` 訂閱並在 cleanup 呼叫回傳的 `off()` 函式。
- `handleSoftDeleteBoardWithInboxMove` 用函式式 `setBoards(prev => ...)` 同時應用兩個更新，若未來需要拆分，需注意 stale closure 問題（見 [tldraw-snapshot.md](tldraw-snapshot.md)）。

## 待確認

- `CalendarView.tsx` 和 `JournalDayView.tsx` 無渲染點，是否透過事件觸發或已廢棄？
- `handleSetStatus('archived')` 的封存白板是否在 `BoardTabBar` 中隱藏？未見對應的過濾邏輯。

## 外部參考

- [React useCallback 閉包陷阱](https://react.dev/reference/react/useCallback#every-time-my-component-renders-usecallback-returns-a-different-function)
- [tldraw editor.store.listen](https://tldraw.dev/reference/editor/Editor)
