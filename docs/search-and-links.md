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
| `src/utils/cardLinks.ts` | `[[]]` 解析與補全候選純函式（`resolveLinkTarget`／`buildLinkTargets`／`filterLinkTargets`／`groupLinkTargets`，B-LINK 新增） |
| `src/KnowledgeGraph.tsx` | `react-force-graph-2d` 知識圖譜（呈現層） |
| `src/utils/knowledgeGraph.ts` | `buildGraph` 純函式（節點/邊建構，與 React 解耦） |

---

## 全文搜尋（SearchPanel）

### 觸發方式

- `Ctrl+F`（`src/Usehotkeys.tsx`）→ `openSearch` action → `openPanel('search')`
- 側邊欄搜尋按鈕

### 搜尋架構（索引式，commit `ff38071`）

搜尋是**純前端**操作，採用**預建索引 + debounce** 設計：

#### 1. 建立索引（`buildSearchIndex`）

```typescript
// SearchPanel.tsx — buildSearchIndex()
// useMemo([boards]) — 只在 boards 陣列變更時重建，不在每次輸入時觸發
function buildSearchIndex(boards: BoardRecord[]): SearchIndex[]
```

**全部 11 種 CardType 都會進索引**（2026-07-28 修正，見下方警告）。逐型別的可搜文字由純函式
`buildCardSearchText(props, boardNameById)` 決定：

| 卡片類型 | 索引內容（預先 lowercase） |
|---------|---------|
| `text` / `journal` / `heading` / `sticky` | `stripHtml(props.text)` 純文字（便利貼的換行會被收成空白）|
| `todo` | `props.text`（標題）+ `props.todos[].text` 每個項目 |
| `link` | `props.url` + `props.text` + `props.title` |
| `image` | `props.text`（圖片說明文字） |
| `table` | `props.tableData[].cells[].content` 逐格內容 |
| `color` | `props.swatches[].name` + `.hex`（色碼也可搜）|
| `file` | `props.originalName` + `props.fileExt` |
| `board` | **被連到的白板名稱**（board 卡本身沒有文字，用 `linkedBoardId` 反查）|
| 未知型別 | fallback 取 `stripHtml(props.text)` |
| **所有型別** | 額外附加 `props.tags`（搜「閱讀」找得到標了 `#閱讀` 的卡）|

完全沒有可搜文字的卡（例如空的色票）不進索引——它永遠不會被任何關鍵字命中，
留著只會讓型別篩選的計數看起來不對。

`stripHtml` 在建立索引時執行一次（不在搜尋時重複執行）。

> ### ⚠️ 曾經只索引 5 種型別（2026-07-28 修正）
>
> 舊版 `buildSearchIndex` 只處理 `text`/`todo`/`link`/`image`/`journal`，其餘 **6 種**
> （`heading`／`sticky`／`table`／`color`／`board`／`file`）被 `continue` **直接跳過＝根本搜不到**。
>
> 這個 bug 不報錯、不當機，只會讓人覺得「我明明記過這件事」然後懷疑自己記錯。
> **實測影響**：搜「同步」原本 14 筆、修正後 19 筆，多出來的 5 筆全是便利貼——
> 而便利貼是使用最頻繁的型別之一。
>
> **日後新增 `CardType` 時，`buildCardSearchText` 的 switch 是必改的地方之一。**
> 有 `default` 分支兜底（至少保留 `text`），但那只是防止整張卡消失，不是正確的索引內容。

#### 2. 搜尋（`searchFromIndex`）

```typescript
// 只做 string.includes，無重複 HTML parse
function searchFromIndex(
    index: SearchIndexEntry[],
    keyword: string,
    typeFilter: CardType | null = null,
): { results: SearchResult[]; total: number }
```

- 最多回傳 **50 筆**結果，超過顯示「還有 N 筆未顯示」
- `typeFilter` 為 B3 型別篩選（見下）；`null` = 全部型別

#### 2b. 型別篩選（B3，2026-07-28）

輸入框下方的 chip 列，由 `typeCountsFor(index, keyword)` 決定要顯示哪些：

- **只列「這次關鍵字真的搜得到的型別」**，不是固定列出全部 11 種——
  列出永遠 0 筆的 chip 只會讓人以為篩選壞了
- 命中型別**只有一種時整列不顯示**（沒有篩選的意義）
- 每個 chip 顯示該型別的命中筆數；計數**不受目前選了哪個影響**，否則選下去整列會塌掉
- 換關鍵字後若原本選的型別一筆都沒有，自動退回「全部」
- 圖示與標籤取自共用的 `utils/cardMeta.ts`（`TYPE_ICON`／`TYPE_LABEL`），
  **不要再在面板內自建對照表**——SearchPanel 原本就有一份只涵蓋 5 種型別的私有版本，
  正是 `cardMeta.ts` 註解說要避免的重複

#### 3. 防抖（debounce）

- **300ms** 延遲：打字停頓後才觸發 `searchFromIndex`
- 打字中顯示「搜尋中...」視覺回饋
- 依賴 `useRef<ReturnType<typeof setTimeout>>` 管理計時器（不引入外部 hook）

### 結果格式與互動

- `SearchResult`：`{ boardId, boardName, shapeId, type: CardType, preview（前 80 字）, x, y }`
- 結果列表最多顯示 400px 高度（`maxHeight: 400, overflowY: auto`）
- `↑↓` 鍵導航 → `Enter` 鍵跳轉（呼叫 `onJump(boardId, shapeId, x, y)`）
- `onJump` 對應 `handleJump`（`useBoardManager`）：若目標板非當前板，先切板再跳轉

### 注意

各處的 `stripHtml` 已統一到 `src/utils/stringUtils.ts`（2026-06-20，TD5/WO3）：以 `DOMParser` 解碼所有 HTML entity，並只在區塊邊界插空格（行內標籤不插，避免 CJK 被誤拆）。`SearchPanel` 等 7 處皆 import 此單一實作。

`buildCardSearchText`／`buildSearchIndex`／`searchFromIndex`／`typeCountsFor` 皆為 `export`（純函式，為可測性匯出、邏輯未動），測試見 `src/SearchPanel.test.ts`（25 案例，每種型別各有一條）。

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

cardIndex: Map<string, CardTarget[]>
// cardName.toLowerCase() → 同名卡片清單（撞名取 [0]）。B-LINK（6e06ee1）新增，
// 供 [[卡片名]] 跳轉與補全選單使用。CardTarget = { boardId, boardName, shapeId, name, x, y }

// boardNames: string[] 由 Whiteboard.tsx 合成（過濾 deletedAt 的白板名），
// 併入 Provider 的 value；useBacklinks 本身回傳 forwardLinks/backlinks/cardIndex。
```

### 索引建立流程（增量，TD4）

**不是 `useMemo([boards])` 全量重掃**——`useBacklinks` 用 `useRef` 持一個 per-board 快取（`cacheRef: Map<boardId, BoardCache>`），每次呼叫只重掃 snapshot 或 name 有異動的白板，其餘沿用快取，最後合併：

```
每次呼叫：
  → 算出 removedIds（快取有、boards 沒了）與 changedBoards（snapshot 或 name 變了）
  → 兩者皆空 → 直接回傳上次的 resultRef（零重算）
  → 對每個 changedBoard 跑 scanBoard()：
      篩 typeName==='shape' && type==='card' && props.type in ['text','journal']
      每張卡「只 stripHtml 一次」→ 名稱／連結／preview 共用同一份純文字（TD5 收斂）
      linksFromText(text) → matchAll(/\[\[([^\]]+)\]\]/g) → 去重
      收 forwardLinks（shapeId→[name...]）、backlinks、以及 cards（每張卡都收，供 cardIndex）
  → 合併所有 per-board 快取 → mergedForward / mergedBack / cardIndex
```

`BacklinkEntry`：`{ boardId, boardName, shapeId, preview（前 80 字）, x, y }`。
`cardIndex` 收「每一張」text/journal 卡（含沒有 `[[連結]]` 的，因為它們正是 `[[卡片名]]` 要能跳到的目標）。

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
// TextContent.tsx
const { boardNames, cardIndex } = useContext(BacklinksContext)
// cardIndex → cardNames，與 boardNames 合併成候選（白板在前、撞名只留白板）
const linkTargets = useMemo(
    () => buildLinkTargets(boardNames, cardNames),   // utils/cardLinks.ts
    [boardNames, cardIndex],
)
// 觸發：游標前 120 字比對 /\[\[([^\]]*)$/
const match = textBefore.match(/\[\[([^\]]*)$/)
if (!match) { setSuggest(null); return }
const matches = filterLinkTargets(linkTargets, match[1])  // 預設配額：board 5 / card 8
```

- 搜尋範圍：游標前 120 字元內。
- **候選含白板名 _與_ 卡片名**（B-LINK 起）：`buildLinkTargets` 合併、`filterLinkTargets` 依 query 子字串過濾。**配額分組各自算**（白板 5／卡片 8），不是共用總額——否則白板名（組織性、數量多）會把卡片擠光（實測 7 板吃光 8 格總額）。
- 顯示用 `groupLinkTargets` 分「🗂️ 白板／📝 卡片」兩組。
- 補全 dropdown 用 `position: fixed`（脫離 card 的 overflow 裁剪）。

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

- 前向連結（`[[name]]`）點擊 → `emitAppEvent('jump-to-card', { targetName: name })`。接收端（WhiteboardTools）用 `resolveLinkTarget(name, boards, cardIndex)`（`utils/cardLinks.ts`）解析：**白板優先、再卡片**，都找不到才是死連結（B-LINK 之前指向卡片的 `[[X]]` 點了無反應，就是因為只比白板）。
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

### buildGraph 流程（`src/utils/knowledgeGraph.ts` 純函式）

```
buildGraph(boards, forwardLinks)   // forwardLinks 來自 useBacklinks 增量快取
Pass 1：建立 card 節點（text/journal only），命名走 extractCardName（與全 App 一致）
Pass 1b：建立 board 節點
Pass 2：建立邊
  → 對每個 board 的 parentId → parent 邊
  → wikilink 邊：直接取 forwardLinks.get(shapeId)（**不重新解析 HTML**，A6 收斂），
     目標優先匹配 boardByName，其次 cardByName[0]
  → 更新 refCount → 影響節點大小 node.val（board 5+rc / card 1+rc）
```

> 另有 `shouldShowNodeLabel(type, val, globalScale)`：LOD 標籤——白板 `globalScale>0.6` 顯示；卡片需 `val>=3 && globalScale>1.2`。

### 效能設計

- `graphData = useMemo(...)` — 固定參照，防止 re-render 重啟 force simulation
- tooltip 使用 `ref` 直接操作 DOM，不觸發 React state 更新（避免 re-render 重啟 simulation）
- hover 節點時 `node.fx = node.x; node.fy = node.y`（固定位置，防止 simulation 繼續推動）
- 「只顯示有連結的節點」filter 由 `useMemo` 計算，不修改原始 nodes/links

---

## 維護注意事項

- `useBacklinks` **已改為增量更新（TD4，完成）**：per-board `cacheRef` 只重掃 snapshot/name 有異動的白板，其餘沿用快取；每張卡 `stripHtml` 只跑一次（TD5 收斂）。千板以上的極端量再看是否需要 Web Worker（目前非瓶頸）。
- `extractCardName` 只取第一個 H1/H2；若卡片沒有標題（純段落），取前 40 字。這意味著兩張內容相同前 40 字的卡片，在 backlinks map 中會指向同一個 key，引用關係可能混淆。
- `KnowledgeGraph` 中 `react-force-graph-2d` 的型別系統有問題（見原始碼 `const ForceGraph2D = _ForceGraph2D as any`），升級版本時需重新驗證型別。
- 搜尋不支援正規表示式或模糊搜尋，只有 `toLowerCase().includes(kw)`，無法處理 CJK 片假名等邊緣案例。

## 待確認

- ~~`boardNames`（補全候選）只包含白板名稱~~ **已解決（B-LINK）**：補全同時含卡片名（`cardIndex`），`[[卡片名]]` 也能連能跳。
- `KnowledgeGraph` 的 wikilink 邊：若同名白板有多個，`boardByName.get(tl)` 只取第一個（後者覆蓋前者）。重複白板名稱會造成邊指向錯誤目標。（同理 `resolveLinkTarget` 撞名取 `[0]`。）

## 外部參考

- [react-force-graph-2d](https://github.com/vasturiano/react-force-graph)
- [TipTap editor.view.coordsAtPos](https://tiptap.dev/docs/editor/api/editor)
