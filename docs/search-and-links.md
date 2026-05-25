# 搜尋與雙向連結

## 目的

說明 Scout Astrolabe 的全文搜尋機制、`[[]]` 雙向連結語法的解析與自動補全、`BacklinksPanel` 顯示邏輯，以及知識圖譜的節點/邊建立方式。

## 適用範圍

`src/SearchPanel.tsx`、`src/hooks/useBacklinks.ts`、`src/components/card-shape/sub-components/BacklinksPanel.tsx`、`src/components/card-shape/sub-components/TextContent.tsx`（補全觸發）、`src/KnowledgeGraph.tsx`。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/SearchPanel.tsx` | 全文搜尋 UI + 搜尋邏輯（純前端） |
| `src/hooks/useBacklinks.ts` | 雙向連結索引建立（`useBacklinks` hook + `BacklinksContext`） |
| `src/components/card-shape/sub-components/BacklinksPanel.tsx` | 卡片底部雙向連結面板 |
| `src/components/card-shape/sub-components/TextContent.tsx` | `[[]]` 自動補全觸發邏輯 |
| `src/KnowledgeGraph.tsx` | `react-force-graph-2d` 知識圖譜 |

---

## 全文搜尋（SearchPanel）

### 觸發方式

- `Ctrl+F`（`useHotkeys.ts`）→ `setSearchOpen(true)`
- 側邊欄搜尋按鈕

### 搜尋架構（索引式，commit `ff38071`）

搜尋是**純前端**操作，採用**預建索引 + debounce** 設計：

#### 1. 建立索引（`buildSearchIndex`）

```typescript
// SearchPanel.tsx — buildSearchIndex()
// useMemo([boards]) — 只在 boards 陣列變更時重建，不在每次輸入時觸發
function buildSearchIndex(boards: BoardRecord[]): SearchIndex[]
```

| 卡片類型 | 索引內容（預先 lowercase） |
|---------|---------|
| `text` / `journal` | `stripHtml(props.text)` 純文字 |
| `todo` | `props.text`（標題）+ `props.todos[].text` 每個項目 |
| `link` | `props.url` + `props.text` + `props.title` |
| `image` | `props.text`（圖片說明文字） |

`stripHtml` 在建立索引時執行一次（不在搜尋時重複執行）。

#### 2. 搜尋（`searchFromIndex`）

```typescript
// 只做 string.includes，無重複 HTML parse
function searchFromIndex(index: SearchIndex[], query: string): SearchResult[]
```

- 最多回傳 **50 筆**結果，超過顯示「還有 N 筆未顯示」

#### 3. 防抖（debounce）

- **300ms** 延遲：打字停頓後才觸發 `searchFromIndex`
- 打字中顯示「搜尋中...」視覺回饋
- 依賴 `useRef<ReturnType<typeof setTimeout>>` 管理計時器（不引入外部 hook）

### 結果格式與互動

- `SearchResult`：`{ boardId, boardName, shapeId, type, preview（前 80 字）, x, y }`
- 結果列表最多顯示 400px 高度（`maxHeight: 400, overflowY: auto`）
- `↑↓` 鍵導航 → `Enter` 鍵跳轉（呼叫 `onJump(boardId, shapeId, x, y)`）
- `onJump` 對應 `handleJump`（`useBoardManager`）：若目標板非當前板，先切板再跳轉

### 注意

`SearchPanel` 的 `stripHtml` 實作處理 HTML entities（`&amp;`、`&lt;` 等），與 `useBacklinks`、`DeleteBoardDialog` 的版本略有差異（WO3，待決策是否統一到 `src/utils/stringUtils.ts`）。

---

## 雙向連結索引（useBacklinks）

### 基本概念

`[[白板名稱]]` 或 `[[卡片標題]]` 語法在 text/journal 卡片的 TipTap HTML 內容中以純文字儲存。`useBacklinks` hook 遍歷所有白板，建立兩個 Map：

```typescript
// useBacklinks.ts — BacklinksContextValue
forwardLinks: Map<string, string[]>
// shapeId → 該卡片引用的名稱清單（[[xxx]] 中的 xxx）

backlinks: Map<string, BacklinkEntry[]>
// targetName.toLowerCase() → 引用該名稱的卡片清單
```

### 索引建立流程

```
useMemo([boards]) → 遍歷所有 board.snapshot
  → 篩選 typeName==='shape' && type==='card' && props.type in ['text','journal']
  → 對每張卡片的 HTML：
      extractLinks(html) → stripHtml → matchAll(/\[\[([^\]]+)\]\]/g) → 去重
  → 結果寫入 forwardLinks（shapeId → [name...]）
  → 對每個 name，寫入 backlinks（name.toLowerCase() → [BacklinkEntry...]）
```

`BacklinkEntry`：`{ boardId, boardName, shapeId, preview（前 80 字）, x, y }`

### extractCardName

```typescript
// 用於 BacklinksPanel 查詢自己被誰引用
export function extractCardName(html: string): string | null {
    // 優先取第一個 H1/H2 標題內文
    const hMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i)
    if (hMatch) return hMatch[1].replace(/<[^>]+>/g, '').trim() || null
    // 沒有標題則取前 40 字純文字
    return stripHtml(html).slice(0, 40) || null
}
```

**名稱比對不區分大小寫**（`name.toLowerCase()` 作為 key）。若白板改名，下次 `boards` 更新時 `useMemo` 重新計算，索引自動更新。

### Context 提供

```typescript
// App.tsx（或 Whiteboard.tsx）
const { forwardLinks, backlinks } = useBacklinks(boards)
const boardNames = boards.filter(b => !b.deletedAt).map(b => b.name)

<BacklinksContext.Provider value={{ forwardLinks, backlinks, boardNames, currentBoardName }}>
    {/* 整個 tldraw 樹 */}
</BacklinksContext.Provider>
```

---

## [[]] 自動補全（TextContent.tsx）

### 觸發條件

在 TipTap 編輯器中輸入 `[[`，接著輸入查詢字串時觸發：

```typescript
// TextContent.tsx — useEffect on tiptap.on('update')
const textBefore = state.doc.textBetween(Math.max(0, from - 120), from, '\n')
const match = textBefore.match(/\[\[([^\]]*)$/)
if (!match) { setSuggest(null); return }
const query = match[1]
const matches = boardNames
    .filter(n => n.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)
```

- 搜尋範圍：游標前 120 字元內
- 候選清單：最多 8 筆，從 `BacklinksContext.boardNames` 過濾（白板名稱，不含卡片名稱）
- 補全 dropdown 用 `position: fixed`（脫離 card 的 overflow 裁剪）

### 鍵盤操作

| 按鍵 | 動作 |
|------|------|
| `↑↓` | 移動選取項 |
| `Tab` 或 `Enter` | 確認補全 → `insertCompletion(name)` |
| `Esc` | 關閉補全列表 |

### insertCompletion

```typescript
const insertCompletion = (name: string) => {
    tiptap.chain().focus()
        .deleteRange({ from: suggestRef.current.from, to: curFrom })  // 刪除 [[query
        .insertContent(`[[${name}]]`)   // 插入完整 [[白板名稱]]
        .run()
    setSuggest(null)
}
```

---

## BacklinksPanel 顯示邏輯

`BacklinksPanel` 掛載於每張 text/journal 卡片的底部，從 `BacklinksContext` 讀取資料：

```typescript
const cardName = extractCardName(htmlContent)
const fwdLinks: string[] = forwardLinks.get(shapeId) ?? []
const cardBkLinks = cardName ? (backlinks.get(cardName.toLowerCase()) ?? []) : []
const boardBkLinks = currentBoardName ? (backlinks.get(currentBoardName.toLowerCase()) ?? []) : []
```

**重複去重**：`cardBkLinks` 和 `boardBkLinks` 合併時用 `Set<boardId_shapeId>` 去重。

顯示規則：
- `total = fwdLinks.length + bkLinks.length === 0` → 不渲染（return null）
- 收合狀態（預設）：顯示「→ N 個連結 ← M 個引用」bar
- 展開狀態：展開卡片顯示列表，向上彈出（`position: absolute, bottom: 100%`）

### 點擊跳轉

- 前向連結（`[[name]]`）點擊 → `emitAppEvent('jump-to-card', { targetName: name })`（依白板名稱切換）
- 反向引用點擊 → `emitAppEvent('jump-to-card', { boardId, shapeId, x, y })`（跳到指定 shape）

---

## 知識圖譜（KnowledgeGraph）

### 節點類型

| 節點 | 形狀 | 顏色 | val（大小）|
|------|------|------|----------|
| card（text/journal） | 圓形 | HSL（依白板分色，亮度 60%） | 1 + refCount（被引用次數）|
| board | 旋轉 45° 的正方形（菱形） | HSL（依白板分色，亮度 44%） | 5 + refCount |

只有 `type === 'text'` 或 `type === 'journal'` 的卡片出現在圖中；todo、link、image、board 卡片不顯示。

### 邊類型

| 邊 | 顏色 | 說明 |
|----|------|------|
| `wikilink` | `rgba(96,165,250,0.52)`（藍） | `[[]]` 引用，有方向箭頭 |
| `parent` | `rgba(148,163,184,0.28)`（灰） | 白板父子關係（`board.parentId`） |

### buildGraph 流程

```
Pass 1：建立 card 節點（text/journal only）
Pass 1b：建立 board 節點
Pass 2：建立邊
  → 對每個 board 的 parentId → parent 邊
  → 對每個 text/journal card 的 [[]] → wikilink 邊
     （優先匹配 boardByName，其次 cardByName[0]）
  → 更新 refCount → 影響節點大小 node.val
```

### 效能設計

- `graphData = useMemo(...)` — 固定參照，防止 re-render 重啟 force simulation
- tooltip 使用 `ref` 直接操作 DOM，不觸發 React state 更新（避免 re-render 重啟 simulation）
- hover 節點時 `node.fx = node.x; node.fy = node.y`（固定位置，防止 simulation 繼續推動）
- 「只顯示有連結的節點」filter 由 `useMemo` 計算，不修改原始 nodes/links

---

## 維護注意事項

- `useBacklinks` 的 `useMemo` 依賴 `[boards]`，任何白板更新都會重新掃描所有 snapshot。白板數量增多後效能會線性下降，可考慮改為增量更新或 Web Worker。
- `extractCardName` 只取第一個 H1/H2；若卡片沒有標題（純段落），取前 40 字。這意味著兩張內容相同前 40 字的卡片，在 backlinks map 中會指向同一個 key，引用關係可能混淆。
- `KnowledgeGraph` 中 `react-force-graph-2d` 的型別系統有問題（見原始碼 `const ForceGraph2D = _ForceGraph2D as any`），升級版本時需重新驗證型別。
- 搜尋不支援正規表示式或模糊搜尋，只有 `toLowerCase().includes(kw)`，無法處理 CJK 片假名等邊緣案例。

## 待確認

- `boardNames`（補全候選）只包含白板名稱，不包含卡片的 `extractCardName`。若使用者想引用卡片標題（非白板名稱），補全不會出現。是否為預期行為？
- `KnowledgeGraph` 的 wikilink 邊：若同名白板有多個，`boardByName.get(tl)` 只取第一個（後者覆蓋前者）。重複白板名稱會造成邊指向錯誤目標。

## 外部參考

- [react-force-graph-2d](https://github.com/vasturiano/react-force-graph)
- [TipTap editor.view.coordsAtPos](https://tiptap.dev/docs/editor/api/editor)
