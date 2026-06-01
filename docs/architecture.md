# 系統架構

## 目的

說明 Scout Astrolabe 的整體分層結構、各模組職責、以及資料在元件間流動的方式。供新進開發者快速建立全局心智模型。

## 適用範圍

本文件描述 `src/` 目錄下所有模組。Electron 主程序（`main.js`、`preload.js`）僅略述。

## 相關檔案

| 檔案 | 職責 |
|------|------|
| `src/main.tsx` | React 進入點，以 `StrictMode` 掛載 `<App />` |
| `src/App.tsx` | 根元件，持有所有 panel 開關狀態，組合所有頂層 UI |
| `src/hooks/useBoardManager.ts` | 白板狀態機，所有白板 CRUD 集中於此 |
| `src/components/Whiteboard.tsx` | 單一白板的 tldraw 容器元件（以 ErrorBoundary 包覆） |
| `src/components/ErrorBoundary.tsx` | React Error Boundary，包覆 Whiteboard 防止 crash 擴散 |
| `src/components/WhiteboardTools.tsx` | tldraw `useEditor()` 工具集，card 建立、儲存、匯出、事件橋接 |
| `src/components/BoardTabBar.tsx` | 側邊欄，顯示白板清單、導航、工具圖示 |
| `src/utils/boardDb.ts` | IndexedDB CRUD 封裝（`saveBoard`、`deleteBoard`、`loadAllBoards`） |
| `src/utils/appEvents.ts` | 型別安全事件匯流排（`emitAppEvent` / `onAppEvent`，定義 `AppEventPayloads`） |
| `src/QuickSwitcher.tsx` | Ctrl+P 白板快速切換面板（搜尋、鍵盤導航、縮圖、相對時間戳） |
| `src/utils/contextMenuUtils.tsx` | `useContextMenu` hook、`BUILTIN_TEMPLATES` 常數、`alignShapes`/`distributeShapes`（從 ContextMenu.tsx 分離） |
| `src/utils/trashUtils.ts` | `saveCardToTrash`、`getCardPreview`（從 TrashPanel.tsx 分離） |
| `src/utils/weeklyReviewUtils.ts` | `getISOWeekKey`、`getWeekRange`（從 WeeklyReview.tsx 分離） |
| `src/utils/whiteboardUtils.ts` | `getExportBtnStyle`、`exportBtnStyle`（從 WhiteboardTools.tsx 分離） |
| `src/db.ts` | Dexie 實例定義，schema 版本歷史（v1–v7） |
| `main.js` | Electron 主程序：BrowserWindow、選單、`electronAPI` |
| `preload.js` | contextBridge，暴露 `window.electronAPI` |

---

## 技術棧

```
桌面層     Electron 37
前端層     React 19 + TypeScript 5.8 + Vite 7
畫布引擎   tldraw v3（ShapeUtil 擴充：CardShapeUtil）
富文本     TipTap 2（StarterKit + Underline + TextStyle + Color + CodeBlockLowlight）
資料持久化 Dexie.js → IndexedDB（schema v7）
匯出       jsPDF（離線 PDF）、exportToBlob（tldraw 內建 PNG）
知識圖譜   react-force-graph-2d
拖曳排序   @dnd-kit/core + @dnd-kit/sortable
```

---

## 分層架構

```
┌─────────────────────────────────────────────────────┐
│  App.tsx（根元件）                                   │
│  ├─ Panel 開關狀態（searchOpen / taskCenterOpen...） │
│  ├─ 呼叫 useBoardManager → 取得所有白板操作函式      │
│  ├─ Whiteboard（active board）                       │
│  └─ BoardTabBar（側邊欄）                            │
│                                                     │
│  Whiteboard.tsx                                     │
│  ├─ 若 isHome && homeView==='dashboard' → Dashboard │
│  └─ 否則 → <Tldraw> 包裹                            │
│       ├─ ThemeSync（同步 isDark 到 tldraw 偏好）      │
│       ├─ BacklinksContext.Provider                  │
│       ├─ BoardsContext.Provider                     │
│       └─ WhiteboardTools（useEditor hooks 集中地）   │
│                                                     │
│  CardShapeUtil（tldraw ShapeUtil<TLCardShape>）      │
│  ├─ component()：渲染卡片 HTML                       │
│  ├─ onDoubleClick()：依 type 觸發不同行為            │
│  └─ onResize()：呼叫 tldraw resizeBox               │
└─────────────────────────────────────────────────────┘
```

---

## 資料流

### 讀取流程（App 啟動）

```
loadAllBoards()
  → Dexie 讀取 boards table（全部）
  → 若無 homeBoard → 自動建立（id: 'home_board'）
  → 若無 inboxBoard → 自動建立（id: 'inbox_board'）
  → 若無普通白板 → 建立「我的白板」（嘗試遷移舊 snapshots table）
  → sanitizeBoards()（修補缺欄位的 card props）
  → setBoards() → React state
```

### 儲存流程（每次編輯）

```
editor.store.listen（scope: 'document'）
  → 500ms debounce（saveDebounce）
  → generateThumbnail()（scale: 0.15 PNG）
  → onSaveBoardRef.current(snap, thumbnail)
  → useBoardManager.handleSaveBoard()
  → saveBoard(updated)（Dexie put）
  → setBoards(prev → updated)
```

### 特殊白板

| ID | 欄位 | 建立時機 |
|----|------|---------|
| `home_board` | `isHome: true` | `loadAllBoards` 第一次執行時自動建立 |
| `inbox_board` | `isInbox: true` | 同上 |

---

## 跨元件通訊

React props 向下傳遞的補充機制是**型別安全事件匯流排**（`src/utils/appEvents.ts`）。

```typescript
// 發送（型別全部由 AppEventPayloads 推斷）
emitAppEvent('jump-to-card', { shapeId: '...', boardId: '...' })

// 訂閱（在 useEffect 呼叫，cleanup 中呼叫回傳的 off 函式）
const off = onAppEvent('jump-to-card', detail => { /* ... */ })
return () => off()
```

底層仍使用 `window.CustomEvent`，但 `emitAppEvent` / `onAppEvent` 透過 TypeScript 泛型在編譯期驗證事件名稱與 payload 型別，防止字串拼錯或 payload 結構錯誤。詳細事件清單見 [state-and-events.md](state-and-events.md)。

主要原因：`CardShapeUtil.component()` 在 tldraw 的 React tree 內部，無法直接存取 App 層的 callback，故透過全域事件橋接。

---

## Context

| Context | 定義檔 | Provider 位置 | 消費端 |
|---------|--------|---------------|--------|
| `BacklinksContext` | `src/hooks/useBacklinks.ts` | `Whiteboard.tsx` | `BacklinksPanel.tsx`、`TextContent.tsx` |
| `BoardsContext` | `src/components/card-shape/BoardsContext.ts` | `Whiteboard.tsx` | `Boardcontent.tsx`（Board 卡片縮圖） |

---

## 特殊設計決策

### CustomSelectTool（雙擊停用）

```typescript
class CustomSelectTool extends SelectTool {
    static id = 'select' as const
    override onDoubleClick() { return }
}
```

tldraw 預設雙擊 shape 進入編輯模式；此處覆蓋後，雙擊行為完全由 `CardShapeUtil.onDoubleClick()` 控制，不同卡片類型有不同的展開行為。

### onSaveBoardRef 穩定閉包

`WhiteboardTools.tsx` 中 `onSaveBoard` 隨 `boards` state 更新而每次重建，若直接作為 store listener 依賴則每次 update 都會 unsubscribe / re-subscribe，導致 debounce 計時器被取消。解法：把最新的 `onSaveBoard` 存在 ref，store listener 只依賴 ref（不在依賴陣列中），保持穩定。

### thumbnail 只存 raster

`loadAllBoards()` 在讀取時會把舊的 SVG thumbnail（非 `data:image/png;...` 或 `jpeg`）清除為 `null`，避免 UI 渲染異常。

---

## 維護注意事項

- `WhiteboardTools` 以 `key={activeBoard.id}` 掛載，切換白板時整個元件 re-mount，所有 ref / state 重置。`recentlyTrashedShapeIds` 已特別提升到 `useBoardManager` 避免被重置。
- `useBoardManager` 中多數 `useCallback` 依賴 `boards`（array reference），每次儲存都會重建 callback；此模式目前可接受，但若效能問題出現，考慮改用 `useReducer` 或 Zustand。
- Electron 環境下 `window.electronAPI` 存在；純 Web dev 模式（`npm run dev`）下不存在，相關按鈕（儲存）不顯示。

## 待確認

- `CalendarView.tsx`、`JournalDayView.tsx` 在目前 `App.tsx` 中無獨立渲染點（功能透過 `ReviewCenter` 提供），獨立元件是否廢棄待確認。
- `src/hooks/useFileStorage.ts` 未在任何 tsx 中 import，功能待確認是否廢棄。

## 外部參考

- [tldraw ShapeUtil 文件](https://tldraw.dev/docs/shapes)
- [Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
