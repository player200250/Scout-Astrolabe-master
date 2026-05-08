# Journal 與復盤系統

## 目的

說明 Scout Astrolabe 的 Journal 白板機制、每日卡片與週回顧卡片的自動建立邏輯、`JournalDayView` 沉浸式編輯、`CalendarView` 月曆視圖，以及 `ReviewCenter` 三合一復盤中心的結構。

## 適用範圍

`src/JournalDayView.tsx`、`src/CalendarView.tsx`、`src/WeeklyReview.tsx`、`src/ReviewCenter.tsx`、`src/hooks/useBoardManager.ts`（`handleSaveJournal`、`handleGoToWeeklyCard`）。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/JournalDayView.tsx` | 單日日記沉浸式編輯器（獨立全螢幕 + 可嵌入） |
| `src/CalendarView.tsx` | 月曆視圖（獨立全螢幕 + 可嵌入） |
| `src/WeeklyReview.tsx` | 週回顧統計（獨立側邊板 + 可嵌入） |
| `src/ReviewCenter.tsx` | 三合一復盤中心（月曆 + 日記 + 週回顧） |
| `src/hooks/useBoardManager.ts` | `handleSaveJournal`、`handleGoToWeeklyCard`、`handleSetJournal` |
| `src/utils/date.ts` | `toDateStr`、`getTodayStr`、`getISOWeekKey` |

---

## Journal 白板設定

任何白板都可以被標記為 Journal 白板（`BoardRecord.isJournal = true`）。

### 設定方式

右鍵選單 → 「設為 Journal 白板」→ `handleSetJournal(boardId, true)`

```typescript
// useBoardManager.ts — handleSetJournal
const handleSetJournal = useCallback((boardId: string, isJournal: boolean) => {
    const board = boards.find(b => b.id === boardId)
    if (!board) return
    const updated = { ...board, isJournal }
    saveBoard(updated).catch(err => console.error(err))
    setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
}, [boards])
```

同一時間可以有多個 `isJournal = true` 的白板，但實際上僅有一個時，各功能行為最符合預期：
- `JournalDayView.findCard()` 遍歷 `boards.filter(b => b.isJournal)`，找到第一個符合 `journalDate` 的 shape 即停止
- `journalBoardId = boards.find(b => b.isJournal)?.id` — 只取第一個

---

## 每日日記卡片（`journal` type shape）

### shape 規格

```typescript
// 每日日記 shape 的關鍵欄位
{
    type: 'card',
    props: {
        type: 'journal',
        journalDate: 'YYYY-MM-DD',    // 唯一識別鍵，不可修改
        text: '<h2>...</h2><p>...</p>',  // HTML（TipTap 輸出）
        color: 'yellow',              // 預設黃色
    }
}
```

`journalDate` 是 `YYYY-MM-DD` 格式字串，作為「日期索引」。同一白板同一天只應有一張日記卡片（程式邏輯上以「找到第一個」為準，不強制唯一性）。

### 自動建立邏輯（handleSaveJournal）

`JournalDayView` 在每次自動儲存時呼叫 `onSaveJournal`：

```typescript
// useBoardManager.ts — handleSaveJournal
const handleSaveJournal = useCallback((boardId, dateStr, html, shapeId) => {
    const board = boards.find(b => b.id === boardId)
    if (!board) return
    const snap = toMutableSnapshot(board.snapshot)
    const store = snap.document.store

    if (shapeId && store[shapeId]) {
        // 已存在 → 更新 text
        store[shapeId] = { ...store[shapeId], props: { ...store[shapeId].props, text: html } }
    } else {
        // 不存在 → 建立新 shape
        const newId = `shape:${generateId()}`
        store[newId] = {
            id: newId, typeName: 'shape', type: 'card',
            parentId: /* pageId */,
            props: {
                type: 'journal', journalDate: dateStr, text: html,
                color: 'yellow', state: 'idle', preview: '',
                w: 480, h: 320,
                // 其他欄位...
            },
            // x, y 自動計算（避免與現有 shapes 重疊）
        }
    }

    const updated = { ...board, snapshot: toTLEditorSnapshot(snap), updatedAt: Date.now() }
    saveBoard(updated).catch(err => console.error(err))
    setBoards(prev => prev.map(b => b.id === boardId ? updated : b))
}, [boards])
```

**建立 vs 更新**：若 `shapeId` 有值且 store 中存在，就更新；否則建立新 shape。

---

## 週回顧卡片（`journalDate: 'week-YYYY-WW'`）

### 週格式計算（`getISOWeekKey`）

```typescript
// src/WeeklyReview.tsx
export function getISOWeekKey(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7   // 週一=1，週日=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)   // 移到週四
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `week-${d.getUTCFullYear()}-${String(weekNum).padStart(2, '0')}`
}
// 範例：2026-05-08（週五）→ 'week-2026-19'
```

遵循 ISO 8601 週數定義（週一開始，包含年內第一個週四的週為第 1 週）。

### 建立流程

`handleGoToWeeklyCard` 呼叫時：
1. 計算今天的 `getISOWeekKey(new Date())`
2. 在 Journal 白板的 snapshot 中尋找 `props.journalDate === weekKey` 的 shape
3. 若找到 → `handleJump(boardId, shapeId, x, y)`
4. 若未找到 → `handleSaveJournal(journalBoardId, weekKey, defaultWeekTemplate, null)` 建立新卡片，再切到 Journal 白板

週回顧 shape 的預設顏色為紫色（`color: 'purple'`）。

---

## JournalDayView 沉浸式編輯器

### 兩個型態

| 型態 | 元件 | 用途 |
|------|------|------|
| 全螢幕 | `JournalDayView` | 從側邊欄 Journal 圖示直接開啟 |
| 嵌入 | `JournalDayContent` | 嵌入於 `ReviewCenter` 的「今日日記」tab |

`JournalDayView` 是薄包裝（`position: fixed, inset: 0`），直接渲染 `JournalDayContent`。

### 自動儲存（debounce 900ms）

```typescript
// JournalDayView.tsx
onUpdate: ({ editor }) => {
    if (skipUpdate.current) return    // 防止 setContent 觸發 onUpdate
    setSaveStatus('pending')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
        setSaveStatus('saving')
        onSaveJournal(boardId, ds, editor.getHTML(), card?.shapeId ?? null)
        setTimeout(() => setSaveStatus('saved'), 400)
    }, 900)
}
```

`skipUpdate.current` flag 防止 `tiptap.commands.setContent()` 切換日期時觸發不必要的儲存。

### 預設模板

```typescript
function defaultTemplate(ds: string): string {
    const label = `${m}/${d}（${days[weekday]}）`
    return `<h2>${label}</h2>
<p><strong>今天做了什麼</strong></p><p></p>
<p><strong>學到什麼</strong></p><p></p>
<p><strong>卡住的地方</strong></p><p></p>
<p><strong>明天先做</strong></p><p></p>`
}
```

### 切換日期

- 左右箭頭按鈕 → `onDateChange(addDays(date, ±1))`
- 快捷鍵：`Ctrl+←` / `Ctrl+→`
- 切換日期後，`useEffect([ds])` 呼叫 `findCard(boards, ds)` 重新找卡片，再 `tiptap.commands.setContent(text ?? defaultTemplate)`

---

## CalendarView 月曆視圖

### 兩個型態

| 型態 | 元件 |
|------|------|
| 全螢幕 | `CalendarView`（含標題列）|
| 嵌入 | `CalendarContent`（嵌入 ReviewCenter）|

### 月曆格資料建立（`buildMonthEvents`）

```typescript
// 掃描所有白板，找當月的 journal 卡片和 todo 到期日
for (const board of boards) {
    if (board.isHome || board.isInbox) continue   // 跳過特殊白板
    for (const shape of getCardShapes(board.snapshot)) {
        // journal 卡片：hasJournal: true
        if (board.isJournal && shape.props.type === 'journal' && journalDate.startsWith(prefix))
        // todo 卡片：收集所有 todos[].dueDate
        if (shape.props.type === 'todo')
            for (const t of shape.props.todos)
                if (t.dueDate?.startsWith(prefix))
    }
}
```

每格顯示：
- 📔 日記（黃色標籤，若有 `hasJournal`）
- 最多 3 筆 todo（超出顯示 `+N 更多`）
- 已完成 todo 顯示灰色 + 刪除線

### 右側 Agenda 面板（`buildAgenda`）

點擊日期格後，右側顯示當日詳情：

| 區塊 | 資料來源 |
|------|---------|
| 📔 Journal | `findCard(boards, ds)`（找 `journalDate === ds`） |
| ✅ 待辦到期 | 所有白板的 `todos[].dueDate === ds` |
| 📋 白板活動 | `board.updatedAt` 在當日範圍內的白板 |

---

## WeeklyReview 週回顧統計

### 統計範圍

**本週（週一 00:00 至週日 23:59）有 `board.updatedAt` 在此範圍的白板**。

注意：`updatedAt` 是白板最後儲存時間，不是個別卡片的建立時間。

### 統計指標

| 指標 | 計算方式 |
|------|---------|
| 本週有活動的卡片數 | 符合範圍的白板中，所有 shapes 的總數（含非 card shape） |
| 完成待辦 | `shape.props.type === 'todo'` 且 `t.checked === true` 的 todos 總數 |
| `[[]]` 知識連結 | 所有 shapes 的 `props.text` 中 `\[\[[^\]]+\]\]` 的匹配數量 |

按白板分組顯示卡片數（降序）。

### 兩個型態

| 型態 | 元件 | 開啟方式 |
|------|------|---------|
| 側邊板 | `WeeklyReview`（固定右側，320px 寬）| Ctrl+Shift+C → ReviewCenter → 週回顧 tab |
| 嵌入 | `WeeklyReviewContent` | ReviewCenter 的「週回顧」tab |

---

## ReviewCenter 三合一復盤中心

### Tab 切換

```typescript
type ReviewTab = 'calendar' | 'journal' | 'weekly'

// Tab 切換時不 unmount 其他 tab（條件渲染），避免 tiptap 重新初始化
{tab === 'calendar' && <CalendarContent ... />}
{tab === 'journal'  && <JournalDayContent ... />}
{tab === 'weekly'   && <WeeklyReviewContent ... />}
```

從月曆點擊某日的 Journal 欄位 → `handleOpenJournalDay(date)` → 切到 `journal` tab 並設定日期。

### 快捷鍵

`Ctrl+Shift+C` → `setReviewCenterOpen(prev => !prev)`

---

## 維護注意事項

- `JournalDayView.findCard` 遍歷所有 `isJournal` 的白板；若有多個 Journal 白板，取找到的第一個 shape。多 Journal 白板場景未被明確禁止，但行為可能不一致。
- `handleSaveJournal` 建立新 shape 時，x/y 座標需要計算避免與現有 shapes 重疊；若 Journal 白板有很多卡片，新卡片可能疊在其他卡片上（待確認實際計算邏輯）。
- `WeeklyReview` 的統計以 `board.updatedAt` 為準，而非卡片的建立時間。若使用者在周末批次更新舊白板，統計數字可能虛高。
- `CalendarView` 的月曆資料 `buildMonthEvents` 掃描所有白板，白板數量多時效能會受影響（`useMemo` 依 `[boards, viewYear, viewMonth]` 快取）。

## 待確認

- `getISOWeekKey` 在跨年週（如 12/31 屬於下一年第 1 週）的計算是否正確？（程式碼使用 ISO 8601，理論上正確，但需邊緣案例驗證）
- `handleSaveJournal` 建立新卡片時的 x/y 座標計算邏輯？（summary 階段未完整讀取此部分）

## 外部參考

- [ISO 8601 週數](https://en.wikipedia.org/wiki/ISO_week_date)
- [TipTap editor.commands.setContent](https://tiptap.dev/docs/editor/api/commands/set-content)
