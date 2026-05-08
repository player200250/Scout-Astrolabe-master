# 富文字編輯器（TipTap）

## 目的

說明 Scout Astrolabe 中 TipTap 2 富文字編輯器的設定、支援格式、`TextContent.tsx` 的編輯模式切換，以及 `[[]]` 自動補全的實作細節。

## 適用範圍

`src/components/card-shape/sub-components/TextContent.tsx`（白板卡片內聯編輯 + Modal 模式）、`src/JournalDayView.tsx`（日記專用編輯器）。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/components/card-shape/sub-components/TextContent.tsx` | 主要富文字編輯器（含工具列、補全、view/edit 模式切換） |
| `src/JournalDayView.tsx` | 日記編輯器（簡化版 TipTap，無語法高亮） |
| `src/utils/exportMarkdown.ts` | HTML → Markdown 轉換（`htmlToMarkdown`） |

---

## TipTap 擴充套件設定

### TextContent.tsx 使用的擴充套件

```typescript
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'

const lowlight = createLowlight(common)   // 包含常用語言的語法高亮實例

useTiptap({
    extensions: [
        StarterKit.configure({ codeBlock: false }),   // 停用 StarterKit 預設 CodeBlock
        Underline,
        TextStyle,      // TextStyle 是 Color 的必要依賴
        Color,
        CodeBlockLowlight.configure({ lowlight }),    // 有語法高亮的 CodeBlock
    ],
    ...
})
```

**停用 StarterKit.codeBlock 的原因**：`CodeBlockLowlight` 取代了 StarterKit 內建的 CodeBlock；若兩者同時存在，會有衝突。

### JournalDayView.tsx 使用的擴充套件（簡化版）

```typescript
extensions: [StarterKit, Underline, TextStyle, Color]
```

日記編輯器無語法高亮（不引入 `lowlight`），因為日記以敘述性文字為主。

---

## 支援格式與工具列

### TextContent 工具列按鈕

| 按鈕 | TipTap 指令 | 快捷鍵（TipTap 內建）|
|------|------------|---------------------|
| **B**（粗體） | `toggleBold()` | `Ctrl+B` |
| *I*（斜體） | `toggleItalic()` | `Ctrl+I` |
| <u>U</u>（底線） | `toggleUnderline()` | `Ctrl+U` |
| H1 | `toggleHeading({ level: 1 })` | — |
| H2 | `toggleHeading({ level: 2 })` | — |
| ≡（條列） | `toggleBulletList()` | — |
| 1≡（數字） | `toggleOrderedList()` | — |
| `</>` 程式碼 | `toggleCodeBlock()` | — |
| 顏色圓點（6 色） | `setColor(color)` | — |

可用顏色常數：`['#1a1a1a', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#7048e8']`（深灰/紅/綠/藍/橙/紫）。

語法高亮透過 `lowlight`（基於 highlight.js）支援 `common` 語言包中的所有語言（約 40 種，含 JavaScript、TypeScript、Python、Go、Rust 等）。

---

## 編輯模式切換

### 兩種觸發路徑

| 路徑 | 觸發方式 | 說明 |
|------|---------|------|
| 內聯（一般）模式 | `CardShapeUtil.onDoubleClick()` 發送 `text-card-edit` CustomEvent | `WhiteboardTools` 收到後 `editor.updateShape({ props: { state: 'editing' } })` |
| Modal 模式 | 同上，但 `preventResize={true}` | 全螢幕 Modal，卡片高度不隨內容改變 |

### `isEditing` 狀態感知

`TextContent` 接收 `isEditing: boolean` prop（由 `CardShapeUtil.component()` 傳入，對應 `shape.props.state === 'editing'`）。

```typescript
// TipTap 可編輯性隨 isEditing 切換
useEffect(() => {
    if (!tiptap) return
    tiptap.setEditable(isEditing)
    if (isEditing) {
        setTimeout(() => tiptap.commands.focus('end'), 0)  // 異步 focus，避免 tldraw 攔截
    }
    if (!isEditing) setSuggest(null)
}, [isEditing, tiptap])
```

`setTimeout(..., 0)` 的原因：tldraw 在同步事件處理中可能攔截 focus，用 setTimeout 推到下一個 microtask queue。

### 儲存時機

| 模式 | 儲存觸發 |
|------|---------|
| 一般模式 | `tiptap.onBlur` → `editor.updateShape({ props: { text: html, h: newH } })` → `exitEdit()` |
| Modal 模式 | `tiptap.onBlur` → `editor.updateShape({ props: { text: html } })`（不呼叫 `exitEdit`） |
| `isEditing` 變為 false | `useEffect` → `handleSave()`（同步儲存） |

### 自動計算高度（一般模式）

```typescript
const lineCount = (html.match(/<\/p>|<\/h[123]>|<\/li>|<\/pre>/g) || []).length || 1
const estimatedH = Math.max(80, lineCount * 28 + 80)
const newH = Math.max(currentH, estimatedH)  // 只擴大不縮小
```

高度計算是估算值（每行 28px + 80px padding），不是精確測量。`preventResize` 模式跳過此計算。

---

## 檢視模式（View Mode）

### [[]] 渲染為可點擊連結

```typescript
// TextContent.tsx — processedHtml
const processedHtml = useMemo(() => {
    return p.text.replace(
        /\[\[([^\]]+)\]\]/g,
        (_, name) => `<span class="wiki-link" data-wikilink="${encodeURIComponent(name)}"
            style="color:#3b82f6;cursor:pointer;...">[[${name}]]</span>`
    )
}, [p.text])
```

使用 `dangerouslySetInnerHTML={{ __html: processedHtml }}`。

### 點擊 wiki-link 的事件攔截

tldraw 的 `ShapeUtil` 在 shape 上攔截所有 pointer 事件。`[[]]` span 的點擊需要用 **capture-phase** native listener 才能在 tldraw 之前處理：

```typescript
const el = viewContainerRef.current
el.addEventListener('pointerdown', handler, { capture: true })
//                                            ↑ 關鍵：capture 模式繞過 tldraw 的 bubble 攔截
```

收到事件後：
1. `e.stopPropagation()` + `e.preventDefault()`（防止 tldraw 選取卡片）
2. `dispatchEvent('jump-to-card', { targetName: name })`

### 長文字指示

文字超過 200 字（`textContent.length > 200`）時：
- 顯示底部漸變遮罩（`linear-gradient(to bottom, transparent, cardBg)`）
- 顯示字數 badge：「📄 N 字　雙擊編輯」

---

## HTML 儲存格式

TipTap 輸出標準 HTML，儲存在 `TLCardProps.text`：

```html
<!-- 範例 -->
<h2>標題</h2>
<p>一般段落，含 <strong>粗體</strong> 和 <em>斜體</em></p>
<p>[[其他白板]]</p>
<ul><li>條列項目一</li><li>條列項目二</li></ul>
<pre><code class="language-typescript">const x = 1</code></pre>
```

顏色以 inline style 儲存：`<span style="color: #e03131">紅色文字</span>`

---

## Markdown 匯出轉換

`exportMarkdown.ts` 的 `htmlToMarkdown` 使用 `DOMParser` + 遞迴 DOM 遍歷：

| HTML 元素 | Markdown 輸出 |
|----------|--------------|
| `H1` | `# 標題` |
| `H2` | `## 標題` |
| `H3` | `### 標題` |
| `STRONG` / `B` | `**文字**` |
| `EM` / `I` | `*文字*` |
| `U`（底線） | 無對應（輸出純文字） |
| `UL > LI` | `- 項目` |
| `OL > LI` | `1. 項目` |
| `A` | `[文字](href)` |
| `CODE` | `` `程式碼` `` |
| `PRE` | `` ```\n程式碼\n``` `` |
| `P` | 段落（前後各一換行）|
| `[[name]]`（span） | `[[name]]`（保留原始語法） |
| 顏色 span | 純文字（顏色丟失） |

---

## 維護注意事項

- 新增 TipTap 擴充套件時，同時確認：`TextContent.tsx` 工具列、`JournalDayView.tsx` 是否需要同步、`htmlToMarkdown` 轉換是否需要補對應規則。
- `StarterKit.configure({ codeBlock: false })` 必須保留，否則 `CodeBlockLowlight` 與內建 CodeBlock 衝突，console 會出現警告且行為不可預期。
- TipTap 編輯器在同一個 `shape.id` 切換 `isEditing` 時共用同一個 tiptap instance（不 re-mount），靠 `tiptap.setEditable()` 切換。若改為依 `isEditing` 用 key force re-mount，需重新評估 onBlur 儲存時機。
- `dangerouslySetInnerHTML` 的安全性：`p.text` 來自使用者輸入（TipTap 輸出），不來自外部網路，XSS 風險低，但若未來支援匯入外部 HTML，需要 sanitize。

## 待確認

- TipTap `onBlur` 在使用者點擊工具列按鈕時也會觸發（按鈕 `onMouseDown` 已 `e.preventDefault()` 防止，確認這個機制是否完全可靠）。
- `JournalDayView` 的自動儲存（900ms debounce）與 `TextContent` 的 `onBlur` 儲存是否有衝突風險？（兩者作用於不同的 shape）

## 外部參考

- [TipTap 文件](https://tiptap.dev/docs)
- [TipTap extension-color](https://tiptap.dev/docs/editor/extensions/functionality/color)
- [CodeBlockLowlight 文件](https://tiptap.dev/docs/editor/extensions/functionality/code-block-lowlight)
- [lowlight（highlight.js 語言包）](https://github.com/wooorm/lowlight)
