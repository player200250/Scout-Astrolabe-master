# ADR 0004：以 HTML 字串儲存富文字內容

## 狀態

已採用（截至 2026-05-08）

---

## 背景

Scout Astrolabe 的 text 和 journal 卡片需要支援富文字（粗體、斜體、底線、標題、清單、程式碼塊、顏色）。選擇 TipTap 2 作為編輯器後，需要決定如何儲存編輯器的狀態：

1. TipTap 原生使用 **ProseMirror Document（JSON）** 格式作為內部狀態
2. TipTap 也可以 `editor.getHTML()` 輸出 **HTML 字串**
3. 白板卡片的 props 存在 tldraw snapshot 中，需要可序列化的格式

評估的儲存選項：
- **TipTap JSON（ProseMirror doc）**：TipTap 的原生格式
- **HTML 字串**：標準 HTML，可直接在 `dangerouslySetInnerHTML` 渲染
- **Markdown**：純文字，可讀性高，但富文字表達能力受限
- **Draft.js JSON** / **Slate.js JSON**：其他編輯器的格式（若換編輯器的話）

---

## 決策

使用 **HTML 字串** 儲存富文字內容（`TLCardProps.text: string`）。

TipTap 在儲存時呼叫 `editor.getHTML()`，在載入時以 `content: html` 初始化 TipTap。

---

## 後果

### 正面

- HTML 是最通用的格式，可直接用 `dangerouslySetInnerHTML` 渲染（view mode），不需要額外解析
- `stripHtml(html)` 可快速萃取純文字，用於搜尋（`SearchPanel`）、backlinks 索引（`useBacklinks`）、摘要預覽（`TrashPanel`）
- Markdown 匯出可透過 DOMParser 解析 HTML → Markdown（`htmlToMarkdown`），相對直接
- `[[白板名稱]]` 雙向連結的儲存格式是純文字（在 HTML 中以 `[[name]]` 存在），不需要 HTML 以外的特殊格式
- HTML 是靜態字串，序列化到 JSON 簡單，不需要特殊的序列化邏輯

### 負面

- **不透明的結構**：HTML 字串難以在不解析 DOM 的情況下查詢結構化內容（如「找出所有 H2 標題」需要 DOMParser 或 regex）
- **XSS 風險**：若未來支援從外部匯入 HTML（如剪貼板貼上），需要 sanitize（目前 HTML 只來自 TipTap 輸出，風險低）
- **擴充套件耦合**：HTML 格式隱含了 TipTap 擴充套件的輸出格式（如 `<span style="color: #e03131">`）；若換其他編輯器，需要格式遷移
- **[[]] 語法依賴 regex**：雙向連結在 HTML 中以純文字存在（TipTap 沒有 wikilink 節點），查找依賴 `/\[\[([^\]]+)\]\]/g`，不是語意化的結構

### 引入的設計約束

- 所有需要讀取純文字的地方（搜尋、backlinks、摘要）需要呼叫 `stripHtml`（目前各處有獨立實作，WO3 待統一）
- `extractCardName`（`useBacklinks.ts`）優先取 H1/H2 標題：依賴 HTML regex `/<h[12][^>]*>(.*?)<\/h[12]>/i`，隱含了 H1/H2 是「標題」的假設
- `[[name]]` 在 view mode 中以 CSS class `wiki-link` 和 `data-wikilink` attribute 渲染成可點擊 span；這個轉換在每次渲染時用 `String.replace` 執行（`useMemo` 快取）

---

## 替代方案分析

| 方案 | 主要優勢 | 排除原因 |
|------|---------|---------|
| **TipTap JSON（ProseMirror）** | TipTap 的原生格式、結構語意清晰 | 需要 TipTap 才能渲染（view mode 無法用 `dangerouslySetInnerHTML`）；字串化的 JSON 比 HTML 略大；換編輯器時格式仍不通用 |
| **Markdown** | 可讀性高、與 `exportMarkdown.ts` 對齊 | TipTap 不原生輸出 Markdown（需要外掛）；顏色、底線等格式無法在標準 Markdown 表達；`[[]]` 語法在 Markdown 中衝突（MediaWiki 語法） |
| **Delta（Quill 格式）** | Quill 編輯器的格式 | 若不用 Quill，Delta 格式無意義；換成 Delta 意味著換整個編輯器 |

---

## 相關文件

- [docs/rich-text-editor.md](../rich-text-editor.md) — TipTap 設定與格式詳情
- [docs/search-and-links.md](../search-and-links.md) — [[]] 語法解析與 backlinks 索引
- [docs/card-shape-spec.md](../card-shape-spec.md) — `TLCardProps.text` 欄位說明
- [TipTap getHTML()](https://tiptap.dev/docs/editor/api/editor#get-html)
