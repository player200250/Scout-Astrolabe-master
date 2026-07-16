# 重構路線圖

## 目的

整理 Scout Astrolabe 目前已識別的技術債，分析 `App.tsx` 和 `useBoardManager.ts` 的職責分布，並提出有優先順序的重構建議。

## 適用範圍

整個 `src/` 目錄，重點為 `src/App.tsx`、`src/hooks/useBoardManager.ts`、`src/components/WhiteboardTools.tsx`、`src/hooks/useBacklinks.ts`。

## 相關檔案

| 檔案 | 技術債說明 |
|------|-----------|
| `src/App.tsx` | ✅ TD1 面板 state 已收進 `usePanelState`（14 boolean → hook，僅剩 4 個 useState）；prop drilling 已部分收斂（BoardTabBar 12 個 `onOpenXxx` → 單一 `onOpenPanel`）；仍無路由層 |
| `src/hooks/useBoardManager.ts` | ✅ TD2 已拆分（677→303 行，職責下放至 8 hook + 2 util，合成層僅留跨領域 handler） |
| `src/components/WhiteboardTools.tsx` | 10+ useEffect 事件橋接、緊耦合 tldraw |
| `src/hooks/useBacklinks.ts` | ✅ TD4 已解（per-board `useRef` 增量快取，37× 加速）；千板以上的 Dexie 持久化 index 列入觀察（見 TD4 段） |
| `src/SearchPanel.tsx` | 全量掃描、無防抖、無分頁 |

---

## 技術債清單

### ~~TD1：App.tsx 承擔過多 UI 狀態（高優先）~~ ✅ 核心已完成（2026-06-21，commit `e6967de`）

> **驗收現況（2026-07-16 核實）**：`src/hooks/usePanelState.ts` 已存在，App.tsx **449 行、僅剩 4 個 useState**
> （A 群 14 個面板 boolean 全數收進 hook；留下的是主題 `isDark` 與兩個帶 payload 的 modal）。
> 行數比原盤點的 404 行更多，是因為此後又長進了 Command Palette（N1）等新功能——**面板 state 確實已抽走，
> 不是沒做**。Prop drilling 第二階段一併做了 BoardTabBar（12 個 `onOpenXxx` → 單一 `onOpenPanel`）。
> 安全網：`usePanelState.test.ts`（7 案例）。
>
> **原藍圖尚未抽的三個**（2026-07-16 以 grep 確認 `src/` 下不存在）：`useTheme`、`useOverdueStats`、
> `useGlobalHotkeys`。非 TD1 驗收必要，視後續需要再做。
>
> 以下保留原始盤點內容作為脈絡紀錄。

**原始盤點**（2026-06-20 核實，App.tsx 404 行，17 個 useState + 1 ref）：

| 群組 | 內容 | 數量 | 性質 |
|------|------|------|------|
| A. 面板開關 | search / hotkey / overview / taskCenter / filter / reviewCenter / backupPanel / knowledgeGraph / cardLibrary / quickCapture / onboarding / trash / quickSwitcher | 13 boolean | 純 open/close/toggle |
| B. 實體目標 modal | `movingCardShapeIds`（`string[]\|null`，批次移動）、`deletingBoardId`（`string\|null`） | 2 | 開啟時帶 id |
| C. 主題 | `isDark` + `toggleTheme` + `data-theme` effect + localStorage | 1 + effect | 自成一格 |
| D. 逾期橫幅 | `overdueBannerVisible` + `bannerShownRef` + 計時 effect | 1 + ref + effect | UI 回饋 |

衍生值（非 state，計算自 `boards`）：`overdueCount/todayCount`、`inboxCardCount`、`activePanel`、`sidebarWidth`、`activeBoard`。
Effects 共 4 個：onboarding 首開、逾期橫幅計時、`data-theme` 套用、全域鍵盤快捷鍵（toggle 7 面板 + goToInbox）。

**影響**：新增功能每次都要修改 `App.tsx` 和 `BoardTabBar` 的介面。Prop drilling 現況——`BoardTabBar` 收約 40 個 props（其中約 20 個是 `onOpenXxx`），`Whiteboard` 另收約 10 個 `onOpenXxx`。

**建議拆分（沿用 TD2 增量法，低→高風險；prop 介面先不動）**：

| 步驟 | 產出 | 內容 | 風險 |
|------|------|------|------|
| 步驟 | 產出 | 內容 | 風險 | 狀態 |
|------|------|------|------|------|
| 1 | `hooks/useTheme.ts` | `isDark` + `toggleTheme` + localStorage + `data-theme` effect | 🟢 最低，完全獨立 | ⬜ 未做 |
| 2 | `hooks/useOverdueStats.ts` | `overdueCount/todayCount` memo（純算 boards） | 🟢 純函式 | ⬜ 未做 |
| 3 | `hooks/usePanelState.ts` | A 群 13 boolean + B 群 2 modal，統一 open/close/toggle API | 🟡 核心，動最多處 | ✅ **已完成**（`e6967de`，含逾期橫幅共 14 個） |
| 4 | `hooks/useGlobalHotkeys.ts` | keydown effect，依賴步驟 3 的 setter | 🟡 依賴 3 | ⬜ 未做 |

逾期橫幅（D 群）可併入 `usePanelState` 或留在 App。**Prop drilling 收斂（BoardTabBar 40 props → 收成 `panels` 物件或 Context）屬第二階段大手術，TD1 一期不做。**

> **實際結果（2026-06-21）**：逾期橫幅**已併入** `usePanelState`（共 14 個面板）。Prop drilling 收斂也**一併做了 BoardTabBar**
> （12 個 `onOpenXxx` → 單一 `onOpenPanel`，SidebarFooter props 6→3），沒有留到第二階段；`Whiteboard` 仍保留個別
> `onOpenXxx`（內部呼叫 `openPanel`）。

**⚠️ 安全網缺口**：App.tsx 目前零測試覆蓋（子元件雖有 7 個 test，但 App 組裝層無守護）。動工前需先決定：補 App 冒煙測試（需 mock 回傳 40+ 值的 `useBoardManager`）／靠 `tsc --noEmit` + `npm run build` + 手動點過面板／各新 hook 寫 `renderHook` 單元測試。

> **實際採用**：第三案——`usePanelState.test.ts`（7 案例）+ 更新 `SidebarFooter.test.tsx`，未補 App 冒煙測試。
> App.tsx 組裝層至今仍無測試覆蓋，這個缺口**依然存在**。

**~~觸發時機~~**（此段已由事實推翻，保留供對照）：~~純面板開關目前 **13 個**，離原訂觸發點「新增第 15 個面板前」尚有 2 個緩衝。2026-06-20 評估結論為**現在先不動**——觸發條件是「痛了才動」，目前無正在開發的新面板逼改 App.tsx/BoardTabBar，且 TD2 剛收尾、App.tsx 是其主要消費端，預先重構等於在剛變動的介面上再疊風險。**建議讓重構跟著功能走**：下次新增面板，或開始做圖片集體上傳（會新增 modal）時，順手帶 `usePanelState`，把風險攤提進功能開發。最低風險的 `useTheme` + `useOverdueStats` 完全獨立，若要清雜訊可單獨先抽，但仍屬預先重構。~~

> **後續發展（2026-07-16 回填）**：此段的兩個前提都已不成立——TD1 隔天（2026-06-21）就動工完成了，而「圖片集體上傳」
> 也早在 2026-06-09 就已實作（commit `fdd44ae`），且**沒有新增 modal**（只在既有 file picker 加 `multiple`），
> 因此從未成為預想中的觸發點。「讓重構跟著功能走」的原則本身仍然成立，只是這個具體預測落空了。

---

### ~~TD2：useBoardManager 職責過多（高優先）~~ ✅ 已解決（2026-06-12）

**原始現狀**：`useBoardManager.ts` 約 800 行（2026-06-07 起逐步降至 677），單一 hook 承擔白板 CRUD、導航、收件匣、垃圾桶、Journal、備份、啟動清理、麵包屑等職責，`useCallback` 依賴陣列複雜，維護時難以定位。

**採用策略**：增量法「方案 B（抽純函式＋低風險 hook）→ 方案 A（領域子 hook）」。核心安全網＝43 個 useBoardManager 測試全走公開 API，回傳物件形狀＋行為不變即綠燈。每步 `tsc --noEmit` + `npm test` 全綠才 commit 一個檢查點。**已排除方案 C（useReducer）**：副作用密度高（saveBoard/emitAppEvent/setTimeout/alert 不能進 reducer），報酬低風險高。

**進度**（2026-06-12 完成，`useBoardManager` 677 → **303 行**，−55%）：

| 階段 | 產出 | commit | 狀態 |
|------|------|--------|------|
| 一（方案 B） | `utils/boardSanitize.ts`、`hooks/useAutoBackup.ts` | `260ecac` | ✅ |
| 二·1 | `hooks/useSidebar.ts` | `7bea304` | ✅ |
| 二·2 | `hooks/useTrash.ts` | `7354abc` | ✅ |
| 二·3 | `hooks/useNavigation.ts` | `1ad54d6` | ✅ |
| 二·4 | `hooks/useBoardCRUD.ts`（含模組層 `uniqueName`） | `6f87cb9` | ✅ |
| 二·5 | `hooks/useFolder.ts` | `ec25d56` | ✅ |
| 二·6 | `utils/snapshotCards.ts`（消除 4 處 snapshot 樣板重複，+10 測試） | `15df140` | ✅ |
| 二·7 | `hooks/useJournal.ts`、`hooks/useInboxCards.ts` | `783386d` | ✅ |

**合成層 `useBoardManager` 最終只剩**：跨領域 handler（`handleSetParent`、`handlePermanentDeleteBoard`、`handleSoftDeleteBoardWithInboxMove`、`handleNew`、`handleSwitch`、`handleSwitchToChild`、`handleGoToWeeklyCard`、`handleRestore`）＋ 啟動載入 effect ＋ core state（boards/activeBoardId/loading）。

**設計原則**：子 hook 以「單一 `state` 物件」傳遞共用 core state（boards/setBoards/activeBoardId/setActiveBoardId 等）。**跨領域 handler 一律留在 `useBoardManager` 合成層**，由它組合各子 hook 的原子動作——目前留下 6 個：`handleSetParent`、`handlePermanentDeleteBoard`、`handleSoftDeleteBoardWithInboxMove`、`handleNew`、`handleSwitch`、`handleGoToWeeklyCard`。

> 註：本次拆分屬「整理收納＋消重複」，提升可讀/可測/可維護性，但未解開「`boards` 大陣列＋全量 `setBoards`、人人依賴」這根最粗的耦合線——那需動 Dexie reactive query（見 TD4 觀察與下方 React Query 段），屬大手術，暫不在範圍。

---

### ~~TD3：WhiteboardTools 多重 useEffect 事件橋接~~ ✅ 已解決（commit `c7661c8`，2026-05-23）

**解決方案**：建立 `src/utils/appEvents.ts`，定義 `AppEventPayloads` interface（包含 10 種事件的完整型別），以 `emitAppEvent<K>` / `onAppEvent<K>` 包裝 `window.CustomEvent`。TypeScript 泛型在編譯期驗證事件名稱與 payload 型別，完全消除裸字串事件名稱。

已更新：`TrashPanel`、`useBoardManager`、`CardShapeUtil`、`BacklinksPanel`、`TextContent`、`WhiteboardTools`（共 6 支）。

---

### ~~TD4：useBacklinks 全量掃描（中優先）~~ ✅ 已解決（commit `34b0da4`）

**原始現狀**：`useBacklinks` 的 `useMemo([boards])` 在任何白板更新時重新掃描所有 snapshot，時間複雜度 O(boards × shapes)。

**解決方案**：改為 `useRef` per-board 快取，以 `board.snapshot` reference 為 cache key，只重掃有異動的白板。實測（37 塊）：每次存檔只掃 1 塊 ≈ 0.4ms（舊 ~15ms，約 37× 加速）；平移時 hook 完全不執行。

**待觀察（A3-ext）**：白板數破千後，per-board useRef 快取仍有 snapshot 常駐記憶體與 O(N) merge 兩個瓶頸，屆時改 Dexie 持久化 index（觸發條件：白板數 > 500，見 roadmap-v2 A3-ext）。

---

### ~~TD5：stripHtml 多個不一致的實作（低優先）~~ ✅ 已解決（2026-06-20）

**原始現狀**（WO3）：實際盤點發現 **7 處** 各自為政的 `stripHtml`（比原記 4 處多）：`SearchPanel.tsx`、`useBacklinks.ts`、`DeleteBoardDialog.tsx`、`exportMarkdown.ts`、`CardLibrary.tsx`、`FilterPanel.tsx`、`Dashboard.tsx`。差異：標籤換空格 vs 空字串、entity 處理範圍不一（有的只處理 `&nbsp;`）、是否 collapse/trim 不一。

**解決方案**：統一到 `src/utils/stringUtils.ts` 的單一 `stripHtml`，7 處全部改 import、移除本地定義。統一版取各版超集並修正一個共同缺陷：
1. **只在區塊邊界**（`</p>`、`</div>`、`</li>`、`</h1-6>`、`<br>` 等）插空格保留詞界，行內格式（`<strong>`、`<em>`、`<a>`）不插空格——修掉舊「全標籤換空格」版把 `<strong>粗</strong>體` 拆成 `粗 體` 的 bug（對 CJK 與搜尋比對尤其重要）
2. 以 `DOMParser` 移除其餘標籤並解碼所有 HTML entity（含數值 entity，比手寫 regex 完整）
3. 折疊連續空白 + trim

新增 `src/utils/stringUtils.test.ts`（7 案例）。`npm run build` 與 228 測試全綠。

---

### ~~TD6：SearchPanel 無防抖與分頁~~ ✅ 已解決（commit `ff38071`，2026-05-23）

**解決方案**：
1. `buildSearchIndex(boards)`：純函式，一次 parse snapshot + stripHtml，結果預存 lowercase，`useMemo([boards])` — boards 變更才重建，搜尋不再碰 snapshot
2. `searchFromIndex(index, query)`：只做 `string.includes`，無重複 HTML parse
3. 300ms debounce（`setTimeout` + cleanup ref）：打字停頓後才觸發搜尋
4. 最多顯示 50 筆結果，超過顯示「還有 N 筆未顯示」
5. 打字中顯示「搜尋中...」的視覺回饋

---

### ~~TD7：CalendarView / JournalDayView 無掛載點 + useFileStorage 廢棄（低優先）~~ ✅ 已解決（2026-06-20）

**原始現狀**（WO2）：`CalendarView.tsx`、`JournalDayView.tsx` 各有獨立全螢幕元件（`CalendarView`、`JournalDayView`），但無任何 JSX/import 引用——`ReviewCenter` 只用內嵌的 `CalendarContent`/`JournalDayContent`。另 `src/hooks/useFileStorage.ts` 無任何源碼 import。

**解決方案**：確認三者皆為孤兒後刪除——移除兩個 standalone 全螢幕包裝（保留 `CalendarContent`/`JournalDayContent` 與共用子元件 Section/AgendaRow/Tag/EmptyNote）、整檔刪除 `useFileStorage.ts`、清掉 `CalendarView.tsx` 因此變未用的 `useEffect` import。`git grep` 確認無孤立引用，`tsc -b` 零錯誤。

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
| 🔴 高 | TD1：App.tsx 面板狀態 | 已盤點未動工（2026-06-20） | 新增第 15 個面板前（目前 13 個，先不動，讓重構跟功能走） |
| ✅ 完成 | TD2：useBoardManager 拆分 | 已解決（677→303 行，commit `783386d`） | — |
| ✅ 完成 | TD3：CustomEvent 型別安全 | 已解決 `c7661c8` | — |
| ✅ 完成 | TD4：useBacklinks 增量更新 | 已解決 `34b0da4`（千板以上觀察 A3-ext） | — |
| ✅ 完成 | TD5：stripHtml 統一 | 已解決（2026-06-20，7 處 → `utils/stringUtils.ts`） | — |
| ✅ 完成 | TD6：SearchPanel 防抖＋索引 | 已解決 `ff38071` | — |
| ✅ 完成 | TD7：孤兒元件清理 | 已解決（2026-06-20，刪 CalendarView/JournalDayView standalone + useFileStorage） | — |

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
- ~~`CalendarView` 和 `JournalDayView` 的獨立全螢幕版本是否有計畫的觸發路徑？~~ 已確認無觸發路徑，TD7 已刪除（2026-06-20）。

## 外部參考

- [React useReducer 替代多個 useState](https://react.dev/reference/react/useReducer)
- [Zustand 輕量狀態管理](https://zustand-demo.pmnd.rs/)
- [Fuse.js 模糊搜尋](https://fusejs.io/)
- [React Query 伺服器狀態管理（適用 IndexedDB）](https://tanstack.com/query/latest)
