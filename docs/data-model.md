# 資料模型

## 目的

說明 IndexedDB（透過 Dexie.js）的 schema 結構、各 table 的欄位語意、以及資料在 App 記憶體與 DB 之間的同步方式。

## 適用範圍

`src/db.ts`、`src/utils/boardDb.ts`。不涉及 tldraw snapshot 內部格式（見 [tldraw-snapshot.md](tldraw-snapshot.md)）。

## 相關檔案

| 檔案 | 職責 |
|------|------|
| `src/db.ts` | Dexie 實例建立，schema 版本定義（v1–v7），型別介面 |
| `src/utils/boardDb.ts` | `saveBoard`、`deleteBoard`、`loadAllBoards`、`generateId` |
| `src/hooks/useBoardManager.ts` | 所有白板操作；讀取後存入 React state（`boards`） |

---

## Dexie Schema 版本歷史

```
v1  snapshots(id)
v2  boards(id)
v3  backups(id)
v4  backups(id, timestamp)          — timestamp index 加入
v5  templates(id, createdAt)
v6  deletedCards(id, deletedAt, boardId)
v7  deletedCards(id, deletedAt, boardId, shapeId)
    + upgrade: 對缺少 shapeId 的舊記錄補上空字串
```

目前最高版本：**v7**。

---

## Table：boards

### 主要 TypeScript 介面

```typescript
interface BoardRecord {
    id: string            // 格式：'board_${timestamp}_${random5}' 或特殊 ID
    name: string
    snapshot: TLEditorSnapshot | null   // tldraw 快照，見 tldraw-snapshot.md
    thumbnail: string | null            // data:image/png;base64,... 或 null
    updatedAt: number                   // Unix ms
    parentId?: string | null            // 子白板父 ID，null 表示頂層
    isHome?: boolean                    // 主頁白板（id: 'home_board'）
    isJournal?: boolean                 // Journal 白板
    isInbox?: boolean                   // 收件匣白板（id: 'inbox_board'）
    status?: 'active' | 'archived' | 'pinned'
    lastVisitedAt?: number              // 上次切換到此白板的時間
    sortOrder?: number                  // 拖曳排序，undefined 表示未排序
    deletedAt?: number                  // 軟刪除時間；undefined 表示正常
}
```

### Dexie index

```
boards: 'id, deletedAt'
```

`deletedAt` 有 index，可用 `where('deletedAt').above(0)` 查詢垃圾桶清單。

### 特殊 ID

| ID | 說明 | 來源 |
|----|------|------|
| `'home_board'` | 主頁白板，`isHome: true` | `constants.ts → HOME_BOARD_ID` |
| `'inbox_board'` | 收件匣，`isInbox: true` | `constants.ts → INBOX_BOARD_ID` |

兩者均在 `loadAllBoards()` 時若不存在則自動建立。

### thumbnail 規則

- 只存 raster（`data:image/png;...` 或 `data:image/jpeg;...`）。
- `loadAllBoards()` 讀取時若 thumbnail 非 raster 則清為 `null`（`isRasterThumbnail()` 判斷）。
- 縮放比例 0.15（`exportToBlob scale: 0.15`），用於側邊欄小縮圖。

### 排序規則（loadAllBoards 回傳順序）

```
[homeBoard, inboxBoard, ...rest]

rest 排序：
  1. sortOrder 有值者，按 sortOrder 升序
  2. sortOrder 皆無值者，按 updatedAt 升序
  3. 有無 sortOrder 混合：有值者排前
```

### 軟刪除 vs 永久刪除

| 操作 | 實作 | 資料狀態 |
|------|------|---------|
| 軟刪除 | `board.deletedAt = Date.now()` → `saveBoard()` | DB 保留，`boards` state 移除 |
| 還原 | `db.table('boards').update(id, { deletedAt: undefined })` | DB 清除 deletedAt，state 加回 |
| 永久刪除 | `deleteBoard(id)` → `db.table('boards').delete(id)` | DB 刪除 |
| 自動清除 | 啟動時清除 `deletedAt < Date.now() - 14天` 的記錄 | 永久刪除 |

---

## Table：deletedCards

存放從白板刪除的個別卡片，供垃圾桶「卡片」tab 顯示與還原。

```typescript
interface DeletedCardRecord {
    id: string          // 格式：'dc_${timestamp}_${random4}'
    shapeId: string     // 原 tldraw shape id（如 'shape:xxx'）
    boardId: string     // 來源白板 id
    boardName: string   // 儲存刪除時的白板名稱（快取）
    shapeData: unknown  // 完整的 tldraw shape 物件（序列化後）
    deletedAt: number   // Unix ms
    type: string        // card props.type：'text' | 'todo' | 'link' | 'image' | 'board' | 'journal'
    preview: string     // 短文字預覽（最多 80 字）
}
```

### Dexie index

```
deletedCards: 'id, deletedAt, boardId, shapeId'
```

### 寫入時機

1. 使用者按 Delete 鍵刪除卡片（`useHotkeys` → `saveCardToTrash()`）
2. 右鍵選單「移到垃圾桶」（`ContextMenu.tsx` → `saveCardToTrash()`）

注意：軟刪整個白板時，白板內的卡片**不會**逐一寫入 `deletedCards`（設計決策，見 BUGS.md M9）。

### shapeData 格式

存入前已經過 `sanitizeCardProps()` 處理，確保 props 欄位完整。還原時直接傳給 `editor.createShape(shapeData)`。

---

## Table：backups

```typescript
interface BackupRecord {
    id: string           // 格式：'backup_${timestamp}'
    timestamp: number    // Unix ms
    boardCount: number
    boards: BoardRecord[] // 當時所有白板的快照（完整 snapshot）
}
```

- 最多保留 **5** 份（`MAX_BACKUPS = 5`，`db.ts`；2026-06-21 由 30 降為 5）。
  - **為何降為 5**：每份備份是「所有白板的完整 snapshot（含 base64 圖片）」的複製；保留 30 份等於把整個 vault 複製 30 次，含圖片的 vault 會把 IndexedDB 撐到數 GB，並在備份寫入時造成記憶體尖峰導致 renderer OOM 白屏（見 `maintenance/bugs.md` P1-OOM）。
  - `trimBackups()`（`db.ts`）以 `primaryKeys()` + `bulkDelete` 清理超量備份（只比對 key、不載入 blob），`useBoardManager` 啟動載入後即呼叫一次。
- 觸發時機：切換白板、App 進入背景（`visibilitychange`），但有 5 分鐘的 throttle（`BACKUP_THROTTLE_MS`）。
- 還原時清空全部 boards 再重寫（`db.table('boards').clear()` + `put` all）。

---

## Table：snapshots（舊）

v1 時代的舊表，`key: 'latest'`。`loadAllBoards()` 若無普通白板則嘗試讀取 `snapshots.get('latest')` 作為遷移資料。目前新資料不再寫入此表。

---

## Table：templates

```typescript
interface TemplateRecord {
    id: string
    name: string
    content: string   // HTML 字串
    createdAt: number
}
```

使用者自訂模板，從 `ContextMenu.tsx` 的「新增至模板」功能寫入，讀取用於右鍵選單的「模板」子選單。

---

## 記憶體狀態（React）

`useBoardManager` 維護：

```typescript
boards: BoardRecord[]   // 所有正常白板（不含 deletedAt > 0）
activeBoardId: string | null
loading: boolean
navigationStack: string[]   // 麵包屑導航歷史
```

**重要**：`boards` state 只包含「正常」白板（`deletedAt` 為 `undefined` 或 0 的不在其中）。已刪除白板只在 `TrashPanel` 開啟時才從 DB 查詢。

---

## userData/files/ 目錄

儲存所有「檔案卡片」上傳的附件。此目錄不使用 IndexedDB，而是直接以 Node.js `fs` 操作。

| 屬性 | 說明 |
|------|------|
| 路徑 | `%APPDATA%\Scout-Astrolabe\files\` |
| 命名規則 | `{UUID}{.ext}`，由 `select-and-copy-file` IPC handler 在主程序產生 |
| 讀取方式 | 透過 `open-file` IPC channel，主程序呼叫 `shell.openPath()` |

### 生命週期

| 時機 | 動作 |
|------|------|
| 建立檔案卡片 | `select-and-copy-file`：以系統對話框選取，`fs.copyFile` 複製到 files/，回傳 `FilePickResult` |
| 刪除卡片（移至垃圾桶） | 檔案**保留**（卡片可能被還原） |
| 垃圾桶永久清除 | 呼叫 `delete-file`，主程序執行 `fs.unlink` |
| App 啟動時 | 不自動掃描孤兒檔案，需手動維護 |

### 注意

- `files/` 目錄不在備份範圍內（`BackupRecord` 只備份 `BoardRecord[]`），還原備份後若原始機器的檔案已刪除，檔案卡片會顯示但無法開啟。
- IPC 欄位 `storedName` 存於 `TLCardProps.storedName`；刪除卡片時渲染層需自行傳入 `storedName` 到 `deleteFile` API。

---

## 維護注意事項

- 每次新增 schema 欄位都必須升版並考慮 `upgrade()` callback（v7 的 `shapeId` 遷移是一個範例）。
- `shapeData` 型別是 `unknown`，設計上允許跨版本序列化，但 `editor.createShape` 在格式大幅改變時可能靜默失敗（WhiteboardTools.tsx 有 try/catch 包覆）。
- `boards: BoardRecord[]` 在備份記錄中是快照，還原時若有 schema 升版，舊快照中的 `shapeData` 可能格式不符。

## 待確認

- `snapshots` table 是否可在確認所有使用者已遷移後，在下一個 schema 版本中廢棄（drop）？
- `templates` 的最大數量是否有限制？目前程式碼未見上限。

## 外部參考

- [Dexie schema 語法](https://dexie.org/docs/Version/Version.stores())
- [Dexie upgrade callback](https://dexie.org/docs/Version/Version.upgrade())
