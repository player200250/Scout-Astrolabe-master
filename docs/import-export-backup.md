# 匯入、匯出與備份

## 目的

說明 Scout Astrolabe 的所有資料進出機制，包括 JSON 匯入/匯出、PNG/PDF 截圖匯出、Markdown 純文字匯出，以及自動備份與手動還原流程。

## 適用範圍

`src/utils/boardExport.ts`、`src/utils/exportMarkdown.ts`、`src/BackupPanel.tsx`、`src/components/WhiteboardTools.tsx`（觸發匯出的元件）、`src/hooks/useBoardManager.ts`（`handleRestore`）。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/utils/boardExport.ts` | JSON 匯入 / 匯出工具函式 |
| `src/utils/exportMarkdown.ts` | Markdown 匯出（含 HTML→Markdown 轉換） |
| `src/BackupPanel.tsx` | 備份清單 UI、手動還原、刪除備份 |
| `src/hooks/useBoardManager.ts` | `handleRestore(boards)` 將備份寫回 DB |
| `src/components/WhiteboardTools.tsx` | tldraw `editor.toImage()` 觸發 PNG/PDF 匯出 |
| `src/db.ts` | `BackupRecord` table（id, timestamp, boardCount, boards） |
| `src/constants.ts` | `BACKUP_THROTTLE_MS = 5 * 60 * 1000`（5 分鐘節流） |

---

## JSON 匯出入

### 匯出（`exportJSON`）

```typescript
// src/utils/boardExport.ts
export const exportJSON = (snapshot: TLEditorSnapshot, name: string) => {
    const dataStr = JSON.stringify({ snapshot }, null, 2)   // ⚠️ 外層包一層 { snapshot }
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
}
```

- **檔案結構是 `{ "snapshot": TLEditorSnapshot }`**（tldraw snapshot 被包在 `snapshot` 鍵下，**不是**裸的 snapshot）。這與匯入端 `d.snapshot!` 對稱、也與已退場的舊「儲存」鈕存進 electron-store 的格式相同。
- 匯出的是**單一白板**的 snapshot（含所有 shape、document、page），非整個 DB。

### 匯入（`importJSON`）

```typescript
export const importJSON = (file: File, onLoad: (data: WhiteboardData) => void) => {
    const reader = new FileReader()
    reader.onload = e => {
        try { onLoad(JSON.parse(e.target!.result as string)) }
        catch { alert('匯入失敗，檔案格式錯誤') }   // JSON.parse 失敗會被攔並提示
    }
    reader.readAsText(file)
}
// WhiteboardTools 呼叫點：importJSON(f, d => loadSnapshot(editor.store, sanitizeSnapshot(d.snapshot!)))
```

- `onLoad` 收到的是 `WhiteboardData = { snapshot }`；呼叫端取 `d.snapshot` 再經 **`sanitizeSnapshot`** 清理後 `loadSnapshot` 套用。
- JSON **解析錯誤**（非法 JSON）會被 try/catch 攔下並 `alert`；但**結構驗證有限**——若 JSON 合法但 `snapshot` 不符 tldraw schema，`loadSnapshot` 仍可能拋錯（`sanitizeSnapshot` 只做孤兒清理等，非完整 schema 驗證）。

---

## PNG 匯出

觸發位置：`WhiteboardTools.tsx` 的匯出按鈕

```typescript
// WhiteboardTools.tsx：用 tldraw 的 exportToBlob 輔助函式（非 editor.toImage）
const blob = await exportToBlob({ editor, ids, format: 'png', opts: { background: true, scale: 2 } })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `${board.name}.png`
a.click()
URL.revokeObjectURL(url)
```

- **API 是 `exportToBlob({ editor, ids, format, opts })`**（從 `'tldraw'` import 的獨立函式），不是 `editor.toImage()`。`ids` 指定要匯出的 shape（全板匯出時傳當前頁全部 shape id）。
- `scale: 2` — 匯出為 2× 解析度（Retina 等級），適合高清列印
- `background: true` — 包含白底（否則透明背景）
- 卡片庫縮圖也走同一函式，但 `scale: 0.15`（小圖省記憶體）

---

## PDF 匯出

觸發位置：`WhiteboardTools.tsx` 的匯出選單

```
exportToBlob({ editor, ids, format: 'png', opts: { background: true, scale: 2 } })
  → Blob → Image element
  → new jsPDF({...})（本地，不需網路）
  → pdf.addImage(imgData, 'PNG', 0, 0, img.width/2, img.height/2)   // /2 抵銷 scale:2
  → pdf.save(`${board.name}.pdf`)
```

- 底圖同樣走 `exportToBlob`（PNG），再以 `jsPDF` 套件純本地嵌入，不需任何後端或雲端服務
- 實際上是將 PNG 圖片嵌入 PDF，不是向量格式
- 尺寸用 `img.width/2、img.height/2`（因 PNG 以 `scale:2` 產生，除以 2 還原邏輯尺寸）

---

## Markdown 匯出

### HTML → Markdown 轉換（`htmlToMarkdown`）

```typescript
// src/utils/exportMarkdown.ts
function htmlToMarkdown(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return nodeToMarkdown(doc.body).trim()
}
```

遞迴處理 DOM 節點（`nodeToMarkdown`），支援：
- `H1–H4` → `# / ## / ### / ####`
- `STRONG / B` → `**text**`；`EM / I` → `*text*`；`U` → `<u>text</u>`（markdown 無底線，保留 HTML）
- `MARK` → `==text==`（螢光筆）；`CODE` → `` `text` ``；`PRE` → ```` ```…``` ````
- `A` → `[text](href)`
- `UL / OL / LI` → `- text` / `1. text`
- `P` → 段落（前後換行）；`BR` → 換行
- `DIV.callout`（提示框）→ blockquote，每行前綴 `> `、首行 `> 💡`
- `DIV.math-block`（LaTeX）→ `$$…$$`（讀 `data-latex` 原始碼，不理會內部 katex markup）
- `DETAILS`（摺疊）→ `**summary**` + 內文（markdown 無 toggle 標準）
- 其他節點 → 遞迴其子節點（等同純文字）

### 各卡片類型 Markdown 格式（`cardToMarkdown`）

| type | 輸出格式 | 空值處理 |
|------|---------|---------|
| `text` | `htmlToMarkdown(text)`（**無標題前綴**） | 空內容 → `null`（略過該卡） |
| `journal` | `# [journalDate]` + `htmlToMarkdown(text)`（日期為 H1，非標題行） | 皆空 → `null` |
| `todo` | `## [stripHtml(text) 標題]` + 每項 `- [x]/[ ] [todo.text][ 📅 dueDate]` | 無標題無項目 → `null` |
| `link` | 有標題 `[title](url)`；無標題 `<url>`（**無 `## Link` 標頭**） | 無 url → `null` |
| `image` | `*[圖片卡片]*`（占位字串，不含 base64） | — |
| `board` | `*[白板連結：[stripHtml(text) 或「白板」]]*` | — |
| 其他型別 | — | `null` |

- todo 的到期日以 ` 📅 [dueDate]` 附在項目後（doc 舊版漏記）。
- `text` 卡**不加** `## 標題`——標題只是內文第一行、由 `htmlToMarkdown` 自然帶出。

### 白板整體匯出（`exportBoardToMarkdown`）

```typescript
export function exportBoardToMarkdown(shapes: TLShape[], boardName: string): void {
    const sections = shapes
        .filter(s => s.type === 'card')                       // 注意：s.type，非 s.props.type
        .map(s => cardToMarkdown((s as TLCardShape).props))
        .filter((s): s is string => s !== null && s.trim() !== '')  // 濾掉回傳 null 的卡
    if (sections.length === 0) { alert('白板沒有可匯出的卡片'); return }
    download(sections.join('\n\n---\n\n') + '\n', boardName)   // 無 `# boardName` 標頭
}
```

- 僅匯出 `s.type === 'card'` 的 shapes，忽略 frame、arrow 等；`cardToMarkdown` 回 `null` 的卡（空內容）也濾掉。
- **沒有** `# ${boardName}` 檔頭（doc 舊版誤記）；各卡片之間以 `---` 分隔線分開。全部卡片皆空時 `alert('白板沒有可匯出的卡片')` 並中止。
- 不含 tldraw 空間座標資訊（純文字內容）。
- **shape 來源是即時 editor**：`WhiteboardTools.exportMarkdown` 取 `editor.getCurrentPageShapes()`（非從 snapshot 讀）。`exportSelectedToMarkdown`——`selectedOnly` 時以 `editor.getSelectedShapeIds()` 過濾，空選取時 `alert('請先選取卡片')`。

---

## Markdown 匯入（C4，2026-07-28）

`utils/markdownImport.ts`——`exportMarkdown.ts` 的反向，純函式、有測試（16 案例）。

```typescript
export function looksLikeMarkdown(text: string): boolean  // 以 `# ` 開頭 + 多行
export function markdownTitle(md: string): string | null  // 第一行 H1／H2 純文字
export function markdownToHtml(md: string): string        // → 文字卡的 p.text
```

### 兩個觸發點（皆在 `WhiteboardTools.tsx`）

| 觸發 | 行為 |
|------|------|
| **貼上**（`paste`，capture） | `looksLikeMarkdown` 為真 → `window.confirm` 詢問 → 允許才 `preventDefault` 並建卡；取消則落回原本流程（URL 判斷／tldraw 原生貼上） |
| **拖放 `.md`／`.markdown`／`.mdown`**（`drop`，capture） | 不詢問，直接在放下的座標建卡；多檔以 32px 階梯錯開 |

- **confirm 是同步的**，所以「問完再 `preventDefault`」仍然來得及擋下預設行為——這是「不覆蓋現有純文字貼上行為」的實作關鍵。
- drop 走 **capture 階段**是為了搶在 tldraw 的 drop 處理之前；**只有真的是 `.md` 才 `stopPropagation`**，圖片等其他檔案原封不動交還 tldraw。
- 建出的卡片是 **400×400**（文字卡預設 280×320 對整篇文件太小），`props.type = 'text'`。

### 刻意不裝 `marked`

只需支援 TipTap schema 真的有的節點（StarterKit＋Link／Highlight／Callout／CodeBlockLowlight）；轉出 schema 以外的標籤，TipTap 載入時會整段丟掉。範圍固定，自解析比較好控。

| Markdown | 產出 | 備註 |
|----------|------|------|
| `#`～`######` | `<h1>`～`<h6>` | 第一個 `<h1>` 自動成為卡片標題（`splitTitleBody` 的規則） |
| ` ```lang ` | `<pre><code class="language-lang">` | 內部不套行內規則、HTML 逃脫 |
| `> 💡` 開頭的引用 | `<div class="callout">` | 與匯出端對稱，round-trip 不會把提示框降級 |
| 其他 `>` | `<blockquote>` | |
| `- ` / `1. ` | `<ul>` / `<ol>` | `- [ ]`／`- [x]` → `☐`／`☑` 字元（文字卡沒有 taskList 節點） |
| `**`／`*`／`==`／`` ` ``／`[]()` | `<strong>`／`<em>`／`<mark>`／`<code>`／`<a>` | 行內 code 先抽成佔位再處理，內部星號不被當語法 |
| `<u>…</u>` | `<u>` | 匯出端就是寫成原始 HTML，逃脫後要還原 |
| `---` | `<hr>` | |

**未支援**：巢狀清單、表格、圖片、`$$…$$` 數學式（MathBlock 需要 katex 渲染結果一起存進 HTML，成本不成比例）——這些會退化成一般段落。

---

## 自動備份

### 觸發時機

| 觸發事件 | 說明 |
|---------|------|
| 切換白板（`handleSwitch`） | 每次離開當前板時嘗試備份 |
| `visibilitychange` 進入背景 | `document.hidden` 時觸發 |

### 節流機制

```typescript
// src/constants.ts
export const BACKUP_THROTTLE_MS = 5 * 60 * 1000  // 5 分鐘

// useBoardManager.ts（示意）
const now = Date.now()
if (now - lastBackupRef.current < BACKUP_THROTTLE_MS) return
lastBackupRef.current = now
// 執行備份
```

5 分鐘內無論觸發多少次，只執行一次備份。`lastBackupRef` 是 ref（不觸發 re-render）。

### 備份上限與清理

```typescript
// utils/backupSettings.ts — N17（2026-07-28）起可設定：3／5／10／20，預設 5
export function getBackupLimit(): number

// db.ts — trimBackups()：只比對 timestamp 鍵、不載入 blob（記憶體成本低）
export async function trimBackups(): Promise<number> {
    const limit = getBackupLimit()
    const keys = await db.table('backups').orderBy('timestamp').primaryKeys()
    if (keys.length <= limit) return 0
    const toDelete = keys.slice(0, keys.length - limit)
    await db.table('backups').bulkDelete(toDelete)
    return toDelete.length
}
// saveAutoBackup 寫入後呼叫 trimBackups；useBoardManager 啟動載入後也呼叫一次
```

超過保留份數時刪除最舊的備份。**為何 2026-06-21 由 30 降為 5**：每份備份是整個 vault 的完整複製（含 base64 圖片），保留 30 份會把 IndexedDB 撐到數 GB 並造成 renderer OOM 白屏（見 `maintenance/bugs.md` P1-OOM）。設定入口在**資料安全中心**；在那裡調小份數會**立刻**刪掉超額的舊備份。

### `BackupRecord` 結構

```typescript
interface BackupRecord {
    id: string          // 自動產生
    timestamp: number   // Date.now()
    boardCount: number  // 備份時的白板數量
    boards: BoardRecord[]  // 所有白板的完整快照（含 snapshot）
}
```

備份儲存的是所有白板的完整資料，包括 tldraw snapshot JSON（base64 圖片 + shapes）。**備份體積可能很大**，視白板數量與圖片數量而定——這也是保留份數由 30 降為 5 的原因（含圖片 vault ×30 會撐爆 IndexedDB／記憶體）。治本方向見 `maintenance/bugs.md` 的 **TD-IMG**（image 卡改存檔、不再 base64 內嵌，已完成）。

---

## 手動備份與還原

### `BackupPanel.tsx` 功能

- **載入清單**：mount 時呼叫 `db.table('backups').orderBy('timestamp').reverse().toArray()`，顯示最多 5 筆，每筆顯示日期、時間、白板數量。注意：此處 `toArray()` 會載入所有備份的完整 boards（含圖片），備份很多/很大時開啟此面板本身也可能造成記憶體壓力
- **還原**：確認後呼叫 `onRestore(backup.boards)`
- **刪除單筆**：呼叫 `deleteBackup(id)` + 更新本地 state

### `handleRestore`（`useBoardManager.ts`）

```typescript
const handleRestore = useCallback(async (restoredBoards: BoardRecord[]) => {
    await db.table('boards').clear()
    await db.table('boards').bulkPut(restoredBoards)
    // 重新載入所有白板
    const loaded = await db.table('boards')
        .filter(b => !b.deletedAt)
        .sortBy('sortOrder')
    setBoards(loaded)
    setActiveBoardId(loaded[0]?.id ?? null)
}, [])
```

還原會**完全清空**目前的 boards table，再批次寫入備份資料。此操作不可逆，`BackupPanel` 有確認步驟。

---

## 維護注意事項

- `exportJSON` / `importJSON` 處理單一白板 snapshot；備份系統處理所有白板的 `BoardRecord` 陣列，兩者格式不同。
- PDF 匯出是 PNG 嵌入 PDF，非向量格式。若需向量輸出，需替換為 SVG → PDF 流程（tldraw 支援 `toSvg()`，但 jsPDF 的 SVG 支援有限）。
- `BACKUP_THROTTLE_MS` 修改後，現有的 `lastBackupRef` 不會重置（ref 存在於 component 生命週期中），重開 App 才生效。
- 若白板含大量高解析度 base64 圖片，`BackupRecord.boards` 序列化後可能超過 IndexedDB 單筆大小限制（通常 250MB+），需注意。

## 待確認

- PDF 匯出使用的 canvas 尺寸上限為何？tldraw `editor.toImage()` 在超大白板時是否有截斷？
- `visibilitychange` 備份觸發時，若 App 正在執行非同步操作（如大量卡片移入收件匣），是否有 race condition？

## 外部參考

- [jsPDF 文件](https://rawgit.com/MrRio/jsPDF/master/docs/)
- [tldraw editor.toImage()](https://tldraw.dev/reference/editor/Editor#toImage)
- [Dexie.js bulkPut](https://dexie.org/docs/Table/Table.bulkPut())
