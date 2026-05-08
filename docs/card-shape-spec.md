# Card Shape 規格

## 目的

完整描述 `TLCardShape` 的 props 介面、各卡片類型的行為差異、顏色常數、以及 `CardShapeUtil` 的渲染邏輯關鍵點。供新增卡片類型或修改現有類型時參考。

## 適用範圍

`src/components/card-shape/type/CardShape.ts`、`src/components/card-shape/CardShapeUtil.tsx`、`src/components/card-shape/sub-components/`。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `type/CardShape.ts` | 型別定義：`TLCardProps`、`CardType`、`CardColor`、`TodoItem`、顏色常數 |
| `CardShapeUtil.tsx` | tldraw ShapeUtil 實作：渲染、雙擊行為、resize |
| `sub-components/CardContent.tsx` | 依 `props.type` 分派到各子元件 |
| `sub-components/TextContent.tsx` | TipTap 富文本編輯器 |
| `sub-components/TodoContent.tsx` | 勾選清單 |
| `sub-components/LinkContent.tsx` | 連結卡片（含嵌入播放） |
| `sub-components/ImageContent.tsx` | 圖片卡片 |
| `sub-components/Boardcontent.tsx` | Board 卡片（子白板縮圖） |
| `sub-components/CardPropsBar.tsx` | 編輯模式屬性列（顏色、狀態、優先度、標籤） |
| `sub-components/BacklinksPanel.tsx` | 文字 / Journal 卡片底部的反向連結面板 |

---

## TLCardShape 型別

```typescript
type TLCardShape = TLBaseShape<'card', TLCardProps>
```

tldraw `TLBaseShape<'card', TLCardProps>` 包含 tldraw 核心欄位（`id`、`x`、`y`、`rotation`、`index`、`parentId`、`isLocked`、`opacity`、`meta`）加上 `props: TLCardProps`。

---

## TLCardProps 完整欄位

```typescript
interface TLCardProps {
    // ── 尺寸 ──
    w: number           // 預設 280
    h: number           // 預設 320

    // ── 類型 ──
    type: CardType      // 'text' | 'image' | 'todo' | 'link' | 'board' | 'journal'

    // ── 顏色 ──
    color: CardColor    // 見下方 CARD_COLORS

    // ── Text（text / journal 使用）──
    text: string        // HTML 字串（TipTap 輸出）

    // ── Image ──
    image: string | null        // data:image/... base64 字串，或 null

    // ── Todo ──
    todos: TodoItem[]

    // ── Link ──
    url: string | null           // 原始 URL
    title?: string               // 連結標題（待確認：是否自動抓取？）
    description?: string         // 連結描述（待確認）
    thumbnail?: string           // 連結預覽圖（待確認）
    linkEmbedUrl: string | null  // 嵌入播放 URL（YouTube/Vimeo/Bilibili）

    // ── Board（子白板）──
    linkedBoardId?: string | null    // 指向的 BoardRecord.id

    // ── Journal ──
    journalDate?: string | null  // 'YYYY-MM-DD' 或 'week-YYYY-WW'（週回顧）
                                 // 建立後不可修改，作為唯一識別鍵

    // ── 共用狀態 ──
    state: CardState    // 'idle' | 'editing'
    preview?: boolean   // true 時顯示全螢幕圖片預覽（image 類型用）

    // ── 卡片屬性 ──
    tags?: string[] | null
    cardStatus?: CardStatusType | null   // 'none' | 'todo' | 'in-progress' | 'done'
    priority?: PriorityType | null       // 'none' | 'low' | 'medium' | 'high'
}

interface TodoItem {
    id: string
    text: string
    checked: boolean
    dueDate?: string | null   // 'YYYY-MM-DD'
}
```

---

## 各卡片類型行為

### text

| 事件 | 行為 |
|------|------|
| 雙擊 | 發送 `text-card-edit` CustomEvent，`CardShapeUtil.component()` 收到後開啟全螢幕編輯 Modal |
| 含 `[[` 的 text | `pointerEvents: 'auto'`，允許點擊雙向連結 |
| 編輯模式 | 顯示 `CardPropsBar` + TipTap 編輯器（全螢幕 Modal） |

`text` 欄位儲存 TipTap 輸出的 HTML，如：
```html
<h2>標題</h2><p>內文</p><p>[[其他白板名稱]]</p>
```

### journal

與 `text` 類型幾乎相同，差別：
- `journalDate` 不可為 null（用來識別當日 / 當週）
- 每日格式：`'YYYY-MM-DD'`
- 週回顧格式：`getISOWeekKey()` 回傳值（格式 `'week-YYYY-WW'` — **待確認**）
- 預設顏色：黃色（日記）、紫色（週回顧）

### todo

- `text` 儲存卡片標題（HTML）
- `todos` 陣列存每個項目（`TodoItem`）
- 雙擊進入 `state: 'editing'`，可直接在卡片內編輯
- 逾期顯示：`dueDate < todayStr` 時，`TaskCenter.tsx` 顯示逾期 badge

### link

- `url` 存原始網址，`linkEmbedUrl` 存嵌入 URL
- 支援嵌入：YouTube（含 Shorts）、Vimeo、Bilibili
- 雙擊進入 `state: 'editing'`，可修改 URL
- 待確認：`title`、`description`、`thumbnail` 是否有自動抓取機制？程式碼中定義了欄位但未見自動填充邏輯

### image

- `image` 存 base64 data URL（PNG 或 JPEG，已壓縮，最大 1200px）
- 雙擊 / 點擊右上角 ⛶ 按鈕 → `preview: true` → 全螢幕 Modal（Portal 到 body）
- `pointerEvents: 'auto'` 以便接收 hover 事件（顯示 ⛶ 按鈕）
- 壓縮邏輯在 `WhiteboardTools.compressImage()`：有透明度保 PNG，否則轉 JPEG 0.8 品質，5 秒 timeout

### board

- `text` 儲存子白板名稱（顯示用）
- `linkedBoardId` 指向 `BoardRecord.id`
- 雙擊 → 發送 `board-card-enter` CustomEvent → `WhiteboardTools` 收到後呼叫 `onSwitchBoard(linkedBoardId)`
- 父白板 / 子白板首次載入時自動建立 board card（見 `WhiteboardTools` 的 init useEffect）

---

## CardColor 常數

```typescript
const CARD_COLORS: Record<CardColor, { bg: string; accent: string; label: string }> = {
    none:   { bg: '#ffffff', accent: '#e0e0e0', label: '無' },
    red:    { bg: '#fff5f5', accent: '#ff4d4f', label: '紅' },
    orange: { bg: '#fff7f0', accent: '#ff7a00', label: '橙' },
    yellow: { bg: '#fffbe6', accent: '#facc15', label: '黃' },
    green:  { bg: '#f0fff4', accent: '#22c55e', label: '綠' },
    blue:   { bg: '#eff6ff', accent: '#3b82f6', label: '藍' },
    purple: { bg: '#faf5ff', accent: '#a855f7', label: '紫' },
    pink:   { bg: '#fdf2f8', accent: '#ec4899', label: '粉' },
    dark:   { bg: '#1a1a2e', accent: '#6366f1', label: '深' },
}
```

`color !== 'none'` 且 `type !== 'image'` 時，卡片頂部顯示 3px 色條（`accent` 色）。

`dark` 顏色背景固定為 `#1a1a2e`，不受暗色模式影響（以 className `card-dark-bg` 標記）。

---

## CardStatus / Priority 視覺

### Status Badge（非編輯模式，左上角）

```typescript
const STATUS_BADGE = {
    'todo':        { label: '📋 待辦',  color: '#555',    bg: '#f0f0f0' },
    'in-progress': { label: '🔵 進行中', color: '#2563eb', bg: '#dbeafe' },
    'done':        { label: '✅ 完成',   color: '#16a34a', bg: '#dcfce7' },
}
```

### Priority 圓點（非編輯模式，右上角）

```typescript
const PRIORITY_DOT = {
    low:    '#facc15',
    medium: '#fb923c',
    high:   '#ef4444',
}
```

---

## CardShapeUtil 關鍵行為

### 預設 Props

```typescript
getDefaultProps(): TLCardProps {
    return {
        type: 'text', text: 'New Note', image: null, todos: [],
        url: '', linkEmbedUrl: null, state: 'idle', preview: false,
        color: 'none', w: 280, h: 320,
        tags: [], cardStatus: 'none', priority: 'none',
    }
}
```

注意：`getDefaultProps()` 沒有 `linkedBoardId`、`journalDate`（這兩個是 optional 欄位，建立時在 `createShape` 的 props 中直接指定）。

### pointerEvents 規則

```
editing 模式         → 'auto'（接收所有事件）
image type           → 'auto'（接收 hover 用於顯示 ⛶ 按鈕）
text type 含 [[      → 'auto'（接收點擊用於雙向連結）
todo type            → 'auto'（接收勾選操作）
其他                  → 'none'（讓 tldraw 處理拖曳）
```

### cursor 規則

```
editing || image || (text 含 [[)  → 'default'
其他                               → 'grab'
```

### 雙擊行為總覽

| type | 行為 |
|------|------|
| `image`（有圖） | `preview: true`（全螢幕） |
| `todo` / `link` | `state: 'editing'` |
| `board` | 發送 `board-card-enter` |
| `text` / `journal` | 發送 `text-card-edit`（開啟全螢幕 Modal） |
| `image`（無圖） | 無動作 |

### hideRotateHandle / hideSelectionBoundsBg

兩者均回傳 `true`，卡片不顯示旋轉控制點，選取時無背景高亮（改用 border 藍色邊框表示選取）。

---

## SANITIZE_CARD_PROPS 欄位對應

若新增欄位，必須同時更新 `snapshot.ts` 的 `CARD_PROP_DEFAULTS`：

```typescript
const CARD_PROP_DEFAULTS: Record<string, unknown> = {
    text: '', image: null, todos: [], url: '',
    linkEmbedUrl: null, state: 'idle', preview: false,
    color: 'none', w: 240, h: 120,
    tags: [], cardStatus: 'none', priority: 'none',
    linkedBoardId: null, journalDate: null,
}
```

注意 `w: 240, h: 120` 是 defaults（較小值），而 `getDefaultProps()` 返回 `w: 280, h: 320`。這兩個數值不同；`CARD_PROP_DEFAULTS` 只在 props 欄位**缺失**時才補入，故不影響正常建立的卡片。

---

## 維護注意事項

- 新增 `CardType` 時需更新：`CardShape.ts`、`CardShapeUtil.onDoubleClick()`、`CardContent.tsx`（分派邏輯）、`snapshot.ts CARD_PROP_DEFAULTS`、`TrashPanel.getCardPreview()`、`DeleteBoardDialog.getTypeIcon()`。
- `text` 欄位存 HTML，在搜尋（`SearchPanel`）、backlinks（`useBacklinks`）等地方都需要 strip HTML。各處有各自的 `stripHtml` 實作，目前未統一。
- `preview` 欄位只有 image 類型使用，其他類型的值應為 `false`，但 `CARD_PROP_DEFAULTS` 中設為 `false` 而非 `undefined`。

## 待確認

- `link` 卡片的 `title`、`description`、`thumbnail` 欄位是否有自動抓取功能？在程式碼中定義但未見填充邏輯。
- `journalDate` 的週回顧格式（`week-YYYY-WW`）與 `getISOWeekKey()` 的實際回傳值是否一致？

## 外部參考

- [tldraw ShapeUtil](https://tldraw.dev/reference/editor/ShapeUtil)
- [TipTap 輸出格式](https://tiptap.dev/docs/editor/api/commands/get-html)
