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
export function exportJSON(snapshot: TLEditorSnapshot | null, name: string): void {
    const json = JSON.stringify(snapshot, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
}
```

- 輸出格式：tldraw `TLEditorSnapshot` JSON，包含所有 shape、document、page 資料
- 匯出的是**單一白板**的 snapshot，非整個 DB

### 匯入（`importJSON`）

```typescript
export function importJSON(file: File, onLoad: (snapshot: TLEditorSnapshot) => void): void {
    const reader = new FileReader()
    reader.onload = (e) => {
        const json = JSON.parse(e.target!.result as string)
        onLoad(json)
    }
    reader.readAsText(file)
}
```

- 匯入後呼叫 `onLoad` callback，由呼叫端決定如何套用（通常是 `editor.loadSnapshot()`）
- 無 schema 驗證，若 JSON 格式不符 tldraw 格式，`editor.loadSnapshot` 會拋錯

---

## PNG 匯出

觸發位置：`WhiteboardTools.tsx` 的匯出按鈕或快捷鍵

```typescript
// WhiteboardTools.tsx（示意）
const blob = await editor.toImage('png', { scale: 2, background: true })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `${boardName}.png`
a.click()
URL.revokeObjectURL(url)
```

- `scale: 2` — 匯出為 2× 解析度（Retina 等級），適合高清列印
- `background: true` — 包含白底（否則透明背景）
- 使用 tldraw 內建的 `editor.toImage()`，不需額外 canvas 操作

---

## PDF 匯出

觸發位置：`WhiteboardTools.tsx` 的匯出選單

```
editor.toImage('png', { scale: 2 })
  → Blob → Image element
  → jsPDF（本地，不需網路）
  → pdf.addImage(canvas, 'PNG', ...)
  → pdf.save(`${boardName}.pdf`)
```

- 使用 `jsPDF` 套件，純本地產生，不需任何後端或雲端服務
- 實際上是將 PNG 圖片嵌入 PDF，不是向量格式
- A4 比例：若白板長寬比不符，會等比縮放置中

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

遞迴處理 DOM 節點，支援：
- `H1–H3` → `# / ## / ###`
- `STRONG / B` → `**text**`
- `EM / I` → `*text*`
- `A` → `[text](href)`
- `UL / OL / LI` → `- text` / `1. text`
- `P` → 段落（前後換行）
- 其他節點 → 純文字

### 各卡片類型 Markdown 格式（`cardToMarkdown`）

| type | 輸出格式 |
|------|---------|
| `text` / `journal` | `## [標題行]\n\n[htmlToMarkdown(text)]` |
| `todo` | `## [標題]\n\n- [x] 已完成項目\n- [ ] 未完成項目` |
| `link` | `## Link\n\n[title \| url](url)` |
| `image` | `## Image\n\n[圖片（base64 略）]` |
| `board` | `## Board: [text]\n\n（子白板，不含內容）` |

### 白板整體匯出（`exportBoardToMarkdown`）

```typescript
export function exportBoardToMarkdown(shapes: SnapshotCardShape[], boardName: string): void {
    const sections = shapes
        .filter(s => s.props.type === 'card')  // 只匯出 card shapes
        .map(s => cardToMarkdown(s.props))
        .join('\n\n---\n\n')
    const md = `# ${boardName}\n\n${sections}`
    // 下載 boardName.md
}
```

- 僅匯出 `type === 'card'` 的 shapes，忽略 frame、arrow 等
- 各卡片之間以 `---` 分隔線分開
- 不含 tldraw 空間座標資訊（純文字內容）

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
// db.ts
export const MAX_BACKUPS = 5   // 2026-06-21 由 30 降為 5

// trimBackups()：只比對 timestamp 鍵、不載入 blob（記憶體成本低）
export async function trimBackups(): Promise<number> {
    const keys = await db.table('backups').orderBy('timestamp').primaryKeys()
    if (keys.length <= MAX_BACKUPS) return 0
    const toDelete = keys.slice(0, keys.length - MAX_BACKUPS)
    await db.table('backups').bulkDelete(toDelete)
    return toDelete.length
}
// saveAutoBackup 寫入後呼叫 trimBackups；useBoardManager 啟動載入後也呼叫一次
```

超過 5 筆時刪除最舊的備份。**為何由 30 降為 5**：每份備份是整個 vault 的完整複製（含 base64 圖片），保留 30 份會把 IndexedDB 撐到數 GB 並造成 renderer OOM 白屏（見 `maintenance/bugs.md` P1-OOM）。

### `BackupRecord` 結構

```typescript
interface BackupRecord {
    id: string          // 自動產生
    timestamp: number   // Date.now()
    boardCount: number  // 備份時的白板數量
    boards: BoardRecord[]  // 所有白板的完整快照（含 snapshot）
}
```

備份儲存的是所有白板的完整資料，包括 tldraw snapshot JSON（base64 圖片 + shapes）。**備份體積可能很大**，視白板數量與圖片數量而定——這也是 `MAX_BACKUPS` 由 30 降為 5 的原因（含圖片 vault ×30 會撐爆 IndexedDB／記憶體）。治本方向見 `maintenance/bugs.md` 的 **TD-IMG**（image 卡改存檔、不再 base64 內嵌）。

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
- `exportBoardToMarkdown` 的 shape 來源是直接傳入還是從 snapshot 讀取？（需確認 `WhiteboardTools` 的呼叫點）
- `visibilitychange` 備份觸發時，若 App 正在執行非同步操作（如大量卡片移入收件匣），是否有 race condition？

## 外部參考

- [jsPDF 文件](https://rawgit.com/MrRio/jsPDF/master/docs/)
- [tldraw editor.toImage()](https://tldraw.dev/reference/editor/Editor#toImage)
- [Dexie.js bulkPut](https://dexie.org/docs/Table/Table.bulkPut())
