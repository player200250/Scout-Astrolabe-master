# 重構路線圖

## 目的

整理 Scout Astrolabe 目前已識別的技術債，分析 `App.tsx` 和 `useBoardManager.ts` 的職責分布，並提出有優先順序的重構建議。

## 適用範圍

整個 `src/` 目錄，重點為 `src/App.tsx`、`src/hooks/useBoardManager.ts`、`src/components/WhiteboardTools.tsx`、`src/hooks/useBacklinks.ts`。

## 相關檔案

| 檔案 | 技術債說明 |
|------|-----------|
| `src/App.tsx` | 14+ boolean state、prop drilling、無路由層 |
| `src/hooks/useBoardManager.ts` | ~800 行、職責過多、handler 相互依賴 |
| `src/components/WhiteboardTools.tsx` | 10+ useEffect 事件橋接、緊耦合 tldraw |
| `src/hooks/useBacklinks.ts` | 全量掃描效能、無索引快取 |
| `src/SearchPanel.tsx` | 全量掃描、無防抖、無分頁 |

---

## 技術債清單

### TD1：App.tsx 承擔過多 UI 狀態（高優先）

**現狀**：`App.tsx` 管理 14+ 個 boolean state（面板開關）和 4 個字串/null state，共 18+ 個 useState，全部通過 prop drilling 傳入 `BoardTabBar`（約 25 個 props）。

```typescript
// App.tsx — 14 個面板開關 state
const [searchOpen, setSearchOpen] = useState(false)
const [hotkeyOpen, setHotkeyOpen] = useState(false)
const [overviewOpen, setOverviewOpen] = useState(false)
const [taskCenterOpen, setTaskCenterOpen] = useState(false)
const [filterOpen, setFilterOpen] = useState(false)
const [reviewCenterOpen, setReviewCenterOpen] = useState(false)
const [backupPanelOpen, setBackupPanelOpen] = useState(false)
const [movingCardShapeId, setMovingCardShapeId] = useState<string | null>(null)
const [knowledgeGraphOpen, setKnowledgeGraphOpen] = useState(false)
const [cardLibraryOpen, setCardLibraryOpen] = useState(false)
const [quickCaptureOpen, setQuickCaptureOpen] = useState(false)
const [onboardingOpen, setOnboardingOpen] = useState(false)
const [trashOpen, setTrashOpen] = useState(false)
const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null)
```

**影響**：新增功能每次都要修改 `App.tsx` 和 `BoardTabBar` 的介面。

**建議重構**：將面板狀態提取到 `usePanelState` hook 或使用 `useReducer`；長遠可引入 Zustand/Jotai 等輕量狀態管理。

---

### TD2：useBoardManager 職責過多（高優先）

**現狀**：`useBoardManager.ts` 約 800 行，包含：
- 白板 CRUD（8 個 handler）
- 導航（6 個 handler）
- 收件匣（2 個 handler）
- 垃圾桶（5 個 handler）
- Journal（3 個 handler）
- 備份觸發邏輯
- 啟動時 sanitizeBoards、14 天清除、過期備份清理
- `navigationStack` 麵包屑管理

單一 hook 承擔的職責過多，`useCallback` 依賴陣列複雜，維護時難以定位。

**建議重構**：拆分為：
- `useBoardCRUD`：白板建立/更新/刪除
- `useTrash`：垃圾桶（軟刪、永久刪、清空、14 天）
- `useNavigation`：navigationStack 管理
- `useJournal`：Journal 相關 handler
- `useAutoBackup`：備份觸發與節流

---

### ~~TD3：WhiteboardTools 多重 useEffect 事件橋接~~ ✅ 已解決（commit `c7661c8`，2026-05-23）

**解決方案**：建立 `src/utils/appEvents.ts`，定義 `AppEventPayloads` interface（包含 10 種事件的完整型別），以 `emitAppEvent<K>` / `onAppEvent<K>` 包裝 `window.CustomEvent`。TypeScript 泛型在編譯期驗證事件名稱與 payload 型別，完全消除裸字串事件名稱。

已更新：`TrashPanel`、`useBoardManager`、`CardShapeUtil`、`BacklinksPanel`、`TextContent`、`WhiteboardTools`（共 6 支）。

---

### TD4：useBacklinks 全量掃描（中優先）

**現狀**：`useBacklinks` 的 `useMemo([boards])` 在任何白板更新時重新掃描所有 snapshot，時間複雜度 O(boards × shapes)。

**現況效能評估**：20 個白板、每板 50 張卡片 = 1000 次掃描，現代 JS 引擎下約 5–20ms，目前可接受。但白板數量增加後（100+ 板）會明顯延遲。

**建議重構**：
1. 改為增量更新：只在特定 boardId 的 snapshot 改變時重新掃描該板
2. 或移入 Web Worker（不阻塞主執行緒）

---

### TD5：stripHtml 多個不一致的實作（低優先）

**現狀**（WO3）：`SearchPanel.tsx`（已改用索引）、`useBacklinks.ts`、`DeleteBoardDialog.tsx`、`exportMarkdown.ts` 各自有略有差異的 `stripHtml`：

| 檔案 | 差異點 |
|------|--------|
| `SearchPanel.tsx` | 已改為 `buildSearchIndex` 時預處理，stripHtml 僅執行一次 |
| `useBacklinks.ts` | 只處理 `&nbsp;` |
| `DeleteBoardDialog.tsx` | 只處理 `&nbsp;` |
| `exportMarkdown.ts` | 使用 `DOMParser`（最完整） |

**影響**：反向連結和預覽的 HTML 剝除結果可能不一致（空白、特殊字元處理差異）。

**建議重構**：統一到 `src/utils/stringUtils.ts` 導出，各處 import 使用。

---

### ~~TD6：SearchPanel 無防抖與分頁~~ ✅ 已解決（commit `ff38071`，2026-05-23）

**解決方案**：
1. `buildSearchIndex(boards)`：純函式，一次 parse snapshot + stripHtml，結果預存 lowercase，`useMemo([boards])` — boards 變更才重建，搜尋不再碰 snapshot
2. `searchFromIndex(index, query)`：只做 `string.includes`，無重複 HTML parse
3. 300ms debounce（`setTimeout` + cleanup ref）：打字停頓後才觸發搜尋
4. 最多顯示 50 筆結果，超過顯示「還有 N 筆未顯示」
5. 打字中顯示「搜尋中...」的視覺回饋

---

### TD7：CalendarView / JournalDayView 無掛載點（低優先）

**現狀**（WO2）：`CalendarView.tsx` 和 `JournalDayView.tsx` 各自有獨立的全螢幕元件（`CalendarView`、`JournalDayView`），但 `App.tsx` 中只有 `ReviewCenter` 嵌入版本。獨立版本目前沒有被 `App.tsx` 渲染。

**現況**：功能透過 `ReviewCenter` 完整提供，獨立元件是舊架構的殘留（或為未來分離出 ReviewCenter 的準備）。

**建議**：若確認不需要，刪除 `CalendarView` 和 `JournalDayView` 的獨立全螢幕包裝；或保留但在 README 說明用途。

---

### ~~TD-P1~P4：魔術數字常數化 + 基礎架構補強~~ ✅ 已解決（commit `dc600f4`，2026-05-23）

**解決方案**：
- `constants.ts` 新增 `JUMP_DELAY_MS`（400ms）、`SAVE_STATUS_RESET_MS`（400ms），替換 5 處魔術延遲
- `constants.ts` 新增 `Z_TOOL_SUBMENU`、`Z_PANEL`、`Z_BACKUP_PANEL`、`Z_MODAL_BACKDROP`、`Z_CLICK_AWAY`、`Z_MODAL`、`Z_ABOVE_MODAL`，替換全專案 30+ 處魔術 z-index
- 新增 `ErrorBoundary` 元件，以 `key={activeBoard.id}` 包覆 `<Whiteboard>`，防止單一白板 crash 擴散

---

### ~~TD-utility：component 職責過重~~ ✅ 已解決（commit `672e93f`，2026-05-23）

**解決方案**：將混入各元件的 utility 邏輯分離到 `src/utils/`：

| 新檔案 | 來源 | 內容 |
|--------|------|------|
| `src/utils/contextMenuUtils.tsx` | `ContextMenu.tsx` | `useContextMenu` hook、`BUILTIN_TEMPLATES` |
| `src/utils/trashUtils.ts` | `TrashPanel.tsx` | `saveCardToTrash`、`getCardPreview` |
| `src/utils/weeklyReviewUtils.ts` | `WeeklyReview.tsx` | `getISOWeekKey`、`getWeekRange` |
| `src/utils/whiteboardUtils.ts` | `WhiteboardTools.tsx` | `getExportBtnStyle`、`exportBtnStyle` |

消除了 `react-refresh/only-export-components` ESLint 錯誤。`tsc --noEmit` 零錯誤。

---

## App.tsx 職責分析

| 職責 | 目前位置 | 建議 |
|------|---------|------|
| 業務邏輯（CRUD、導航） | `useBoardManager` | 維持，但可拆分 |
| 面板開關狀態 | `App.tsx` useState | 提取為 `usePanelState` |
| 全域鍵盤快捷鍵 | `App.tsx` useEffect | 提取為 `useGlobalHotkeys` |
| 逾期 todo 統計 | `App.tsx` useMemo | 提取為 `useOverdueStats` |
| 主題（dark/light）| `App.tsx` useState | 提取為 `useTheme` |
| 渲染所有 panel | `App.tsx` JSX | 可考慮 `<PanelLayer>` 元件 |

---

## 重構優先順序

| 優先度 | 技術債 | 狀態 | 建議時機 |
|--------|--------|------|---------|
| 🔴 高 | TD1：App.tsx 面板狀態 | 未解決 | 新增第 15 個面板前 |
| 🔴 高 | TD2：useBoardManager 拆分 | 未解決 | 新增任何跨領域 handler 前 |
| ✅ 完成 | TD3：CustomEvent 型別安全 | 已解決 `c7661c8` | — |
| 🟡 中 | TD4：useBacklinks 增量更新 | 未解決 | 白板數量超過 50 時 |
| 🟢 低 | TD5：stripHtml 統一 | 未解決 | 下一次修改相關邏輯時 |
| ✅ 完成 | TD6：SearchPanel 防抖＋索引 | 已解決 `ff38071` | — |
| 🟢 低 | TD7：CalendarView 獨立元件 | 未解決 | 功能需求確認後清理 |

---

## 搜尋效能優化方向

**當前瓶頸**：每次 keypress 全量掃描所有 `board.snapshot`（記憶體中）。

**短期（成本低）**：
- 加入 150ms debounce（1 行 hook）
- 搜尋結果限制最多顯示 50 筆（目前無上限）

**中期（需要較多工作）**：
- 維護一個「搜尋 index」Map（`boardId+shapeId → plainText`），每次 snapshot 更新時增量更新，搜尋時只掃 index 而非 snapshot

**長期（較大架構改變）**：
- Fuse.js：本地模糊搜尋，支援容錯輸入
- 移入 Web Worker：不阻塞 UI 渲染

---

## 長期架構演進建議

### 1. 分離 Electron 平台層

目前 `window.electronAPI` 在渲染層直接呼叫。建議建立 `src/platform/` 層：

```typescript
// src/platform/storage.ts
export async function saveDocument(data: string): Promise<void> {
    if (window.electronAPI) {
        window.electronAPI.saveDocument(data)
    } else {
        localStorage.setItem('tldraw-document', data)  // Web fallback
    }
}
```

好處：Web 版本和 Electron 版本可共用邏輯，測試時可 mock platform 層。

### 2. Context 替代 prop drilling

`BacklinksContext` 是好的起點。建議延伸：
- `BoardsContext`（已部分存在於 `src/components/card-shape/BoardsContext.ts`）
- `ThemeContext`（替代 `isDark` prop drilling）

### 3. 考慮 React Query 或 SWR 管理 DB 狀態

目前所有 DB 操作都手動管理 state（`setBoards`、loading flag）。React Query 可以：
- 自動快取和重新驗證
- 提供 loading/error 狀態
- 減少 useBoardManager 的手動狀態管理

---

## 維護注意事項

- 任何重構不應改變 `docs/state-and-events.md` 中的 CustomEvent 名稱（除非同時更新所有發送方和接收方）。
- `useBoardManager` 拆分時需特別注意各 handler 間的依賴（如 `handleSoftDeleteBoardWithInboxMove` 同時依賴 `boards`、`activeBoardId`、`refreshTrashCount`）。
- TypeScript 零錯誤（`tsc --noEmit`）是重構後的最低驗證要求。

## 待確認

- `src/components/card-shape/BoardsContext.ts` 的現有用途和覆蓋範圍？（目前未詳讀，待確認是否已有 Context 傳遞 boards）
- `CalendarView` 和 `JournalDayView` 的獨立全螢幕版本是否有計畫的觸發路徑（如特定鍵盤快捷鍵）？

## 外部參考

- [React useReducer 替代多個 useState](https://react.dev/reference/react/useReducer)
- [Zustand 輕量狀態管理](https://zustand-demo.pmnd.rs/)
- [Fuse.js 模糊搜尋](https://fusejs.io/)
- [React Query 伺服器狀態管理（適用 IndexedDB）](https://tanstack.com/query/latest)
