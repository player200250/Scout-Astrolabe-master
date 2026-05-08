# tldraw Snapshot 格式

## 目的

說明 `TLEditorSnapshot` 在本專案中的實際結構、讀寫方式，以及自行維護的 sanitize 機制。本文件針對直接操作 snapshot store 的程式碼（`useBoardManager`、`snapshot.ts`）。

## 適用範圍

`src/utils/snapshot.ts`、`src/hooks/useBoardManager.ts`（所有直接讀寫 snapshot 的函式）。

## 相關檔案

| 檔案 | 角色 |
|------|------|
| `src/utils/snapshot.ts` | 所有 snapshot 工具函式、型別定義 |
| `src/hooks/useBoardManager.ts` | 呼叫 snapshot 工具進行 CRUD 操作 |
| `src/components/WhiteboardTools.tsx` | 用 `getSnapshot(editor.store)` 讀、`loadSnapshot(editor.store, ...)` 寫 |

---

## 核心概念

tldraw 的 `TLEditorSnapshot` 是整個白板的序列化表示，結構如下：

```typescript
// 本專案自訂型別（非 tldraw 官方 export）
interface MutableSnapshot {
    document: {
        store: TLSnapshotStore                          // shape / page / document 記錄
        schema: { schemaVersion: number; sequences: Record<string, number> }
    }
    session: Record<string, unknown>                    // 視圖狀態（camera 位置等）
}

// Store 是 recordId → record 的 flat Map
type TLSnapshotStore = Record<string, TLSnapshotStoreRecord>

interface TLSnapshotStoreRecord {
    typeName: string    // 'shape' | 'page' | 'document' | 'instance' ...
    id: string          // 格式如 'shape:xxx', 'page:page', 'document:document'
    type?: string       // typeName==='shape' 時：'card' | 'frame' | 'arrow' ...
    props?: SnapshotShapeProps
    x?: number
    y?: number
    index?: string      // 排序用，字母字串（如 'a1', 'a0V'）
    parentId?: string   // 所屬 page 的 id
    isLocked?: boolean
    opacity?: number
    rotation?: number
    meta?: Record<string, unknown>
    [key: string]: unknown
}
```

**注意**：`TLEditorSnapshot` 是 tldraw 的 opaque 型別，本專案以 `as unknown as MutableSnapshot` 轉型後操作。

---

## 工具函式（snapshot.ts）

### 讀取 store

```typescript
getSnapshotStore(snapshot: TLEditorSnapshot): TLSnapshotStore
// 回傳 snapshot.document.store，若不存在則回傳 {}
```

### 更新 store（不可變）

```typescript
withUpdatedStore(snapshot: TLEditorSnapshot, newStore: TLSnapshotStore): TLEditorSnapshot
// 建立新物件，僅更新 document.store，不修改原有 snapshot
```

### 可變克隆（深拷貝）

```typescript
toMutableSnapshot(snapshot: TLEditorSnapshot | null): MutableSnapshot
// structuredClone + 確保 document / document.store 存在
// null 輸入回傳空 snapshot（schemaVersion: 2）
```

### 轉回 TLEditorSnapshot

```typescript
toTLEditorSnapshot(snap: MutableSnapshot): TLEditorSnapshot
// 型別轉型，不做任何轉換
```

### 取得所有 card shapes

```typescript
getCardShapes(snapshot: TLEditorSnapshot | null): SnapshotCardShape[]
// 過濾條件：typeName === 'shape' && type === 'card'
// 回傳 { id, x, y, props }（不含 store 的其他欄位）
```

---

## Sanitize 機制

tldraw 對 shape props 有嚴格的欄位驗證，若欄位缺失會拋出 `ValidationError`。本專案有三層修補：

### 層 1：sanitizeCardProps（個別 card props）

```typescript
const CARD_PROP_DEFAULTS = {
    text: '', image: null, todos: [], url: '',
    linkEmbedUrl: null, state: 'idle', preview: false,
    color: 'none', w: 240, h: 120,
    tags: [], cardStatus: 'none', priority: 'none',
    linkedBoardId: null, journalDate: null,
}
```

規則：
- 欄位值為 `undefined` → 補 `CARD_PROP_DEFAULTS` 中對應值，無對應則補 `null`
- 欄位完全不存在 → 從 `CARD_PROP_DEFAULTS` 補入
- 只有真正改變才回傳新物件（reference equality 優化）

### 層 2：sanitizeSnapshot（frame / arrow shape）

補齊 frame、arrow 的必要 props（如 `name`、`w`、`h`、`dash`、`arrowheadStart`...），並呼叫 sanitizePageRecords / sanitizeDocumentRecord。

### 層 3：sanitizeDocumentRecord / sanitizePageRecords

確保 `document:document`（需有 `gridSize`、`name`）和 `page:*` 記錄（需有 `name`、`index`、`meta`）存在且完整。

### 呼叫時機

| 時機 | 函式 |
|------|------|
| 載入白板到 editor | `WhiteboardTools.tsx`：`loadSnapshot(editor.store, sanitizeSnapshot(board.snapshot))` |
| App 啟動載入所有白板 | `useBoardManager.sanitizeBoards()`：對每個 board 跑 `sanitizeSnapshot` + `sanitizeCardProps` |
| JSON 匯入 | `WhiteboardTools.tsx`：`importJSON → sanitizeSnapshot` |

---

## 直接操作 Store 的場景

以下操作直接讀寫 snapshot store（而非透過 tldraw editor API），因為目標白板不一定是當前開啟的白板：

| 操作 | 函式 | 說明 |
|------|------|------|
| 快速捕捉到收件匣 | `handleAddCardToInbox` | 直接在 inbox snapshot 插入 shape |
| 跨白板移動卡片 | `handleMoveCardToBoard` | 從 inbox 刪除，插入目標白板 |
| 軟刪白板時移卡片到收件匣 | `handleSoftDeleteBoardWithInboxMove` | 複製全部 card shapes 到 inbox |
| Journal 建立 | `handleSaveJournal` | 在 journal 白板插入新 shape |
| 清理孤兒 board card | `cleanupOrphanBoardCards` | 刪除指向已刪白板的 board type card |

### 插入 shape 的標準模式

```typescript
const snap = toMutableSnapshot(board.snapshot)
const st = snap.document.store

// 確保基礎記錄存在
if (!st['document:document']) {
    st['document:document'] = { typeName: 'document', id: 'document:document', gridSize: 10, name: '', meta: {} }
}
const pageRec = Object.values(st).find(r => r.typeName === 'page')
const pageId = pageRec?.id ?? 'page:page'
if (!st[pageId]) st[pageId] = { typeName: 'page', id: pageId, name: '', index: 'a1', meta: {} }

// 計算新 index（避免衝突）
const existingIndices = Object.values(st).filter(r => r.typeName === 'shape')
    .map(r => r.index).filter((i): i is string => !!i).sort()
const newIndex = (existingIndices.at(-1) ?? 'a0') + 'V'

// 插入 shape
const newId = `shape:qc_${Date.now()}_${randomStr}`
st[newId] = { typeName: 'shape', id: newId, type: 'card', parentId: pageId, index: newIndex, x, y, ... }

// 存回
const updated = { ...board, snapshot: toTLEditorSnapshot(snap), updatedAt: Date.now() }
await saveBoard(updated)
```

---

## index 欄位

tldraw 用 `index` 字串排序 shape 的 z-order。本專案的慣例是在最後一個既有 index 後面加 `'V'`（如 `'a1' → 'a1V'`）。這個做法可能在 index 字串變得極長後影響排序效能，但目前數量不多，無問題。

> **待確認**：tldraw 官方對 index 字串格式有無正式規範？是否應使用 `generateKeyBetween` 等工具？

---

## Stale Closure 注意點

`useBoardManager` 中多個函式用 `useCallback` 且依賴 `boards`。直接在 inbox update 後呼叫另一個也依賴 `boards` 的 callback，會看到舊的 `boards` state。

解法：`handleSoftDeleteBoardWithInboxMove` 用 `setBoards(prev => ...)` 函式式更新，在單一 setter 中同時完成 inbox 更新和白板移除，避免 stale closure 覆蓋問題。

---

## 維護注意事項

- 每次新增 card prop 欄位，必須同步更新 `CARD_PROP_DEFAULTS`。
- 直接操作 store 時，shape id 必須唯一；不同白板間移動 shape 應重新生成 id（`handleSoftDeleteBoardWithInboxMove` 中的 `shape:ibm_${Date.now()}_${random}` 模式）。
- `structuredClone(shape)` 做深拷貝時，若 shape 含有不可 clone 的物件（函式等）會拋錯，目前 shape props 均為 plain value，無此問題。

## 待確認

- `session` 欄位（camera 位置等）在手動建立的 snapshot 中為空物件，是否需要初始化？
- `schema.sequences` 欄位各 key 代表什麼？是否需要在插入 shape 後更新？

## 外部參考

- [tldraw store 文件](https://tldraw.dev/docs/persistence)
- [tldraw getSnapshot / loadSnapshot](https://tldraw.dev/reference/editor/Editor)
