# Scout Astrolabe 開發路線圖 v1.2.0 → v2.0.0

> 文件日期：2026-05-31
> 基準版本：v1.1.0（commit `43c364a`）
> 開發規模：單人開發，工作量以「人天」計

---

## 路線圖總覽

| 版本 | 代號 | 核心方向 | 預估工作量 | 前置條件 |
|------|------|---------|-----------|---------|
| v1.2.0 | **Stable Core** | 技術債清除 + UX 補強 + 小功能 | 22–26 人天 | — |
| v1.3.0 | **Intelligence** | AI 輔助功能（本機優先） | 30–36 人天 | v1.2.0 TD1+TD2 完成 |
| v1.4.0 | **Connected** | 同步與分享 | 33–40 人天 | v1.2.0 平台抽象層 |
| v2.0.0 | **Cosmos** | 完整智慧知識系統 | 100–130 人天 | v1.3.0 + v1.4.0 |

> **排程原則**：v1.2.0 是唯一必須完整完成才能進入下一版的版本；v1.3.0 與 v1.4.0 可部分並行開發。

---

## 未解決技術債現況（v1.1.0 遺留）

以下技術債將在 v1.2.0 全數清除，不應帶入 v1.3.0 以後：

| 識別碼 | 問題 | 嚴重度 | 阻斷何種後續工作 |
|--------|------|--------|-----------------|
| TD1 | `App.tsx` 持有 15+ 面板開關 boolean state | ✅ 完成（2026-06-21）| 已提取 `usePanelState`，App.tsx 不再直接持有面板 state（見 A1） |
| TD2 | `useBoardManager.ts` 約 800 行職責混雜 | ✅ 完成（commit d8f2b32）| 已拆為 8 個 sub-hook，主檔降至合成層（見 A2） |
| TD4 | `useBacklinks` 全量掃描 O(boards×shapes) | ✅ 完成（v1.1.1）| per-board useRef 快取；千板以上需 Dexie index（見 A3-ext） |
| TD5 | `stripHtml` 七處實作不一致 | ✅ 完成（2026-06-20）| 統一至 `utils/stringUtils.ts`，修正行內標籤誤插空格的 CJK bug |
| TD7 | `CalendarView`/`JournalDayView` 無掛載點；`useFileStorage` 疑似廢棄 | ✅ 完成（2026-06-20）| 三者皆孤兒，已刪除 |

---

## v1.2.0 — Stable Core

### 版本目標

在不引入新外部套件的前提下，清除既有技術債、補強現有功能的 UX 短板、新增 3–4 個高需求小功能。本版本的目標是讓程式碼庫的品質足以安全承載 v1.3.0 的 AI 整合。

**預估工作量**：22–26 人天（約 4–5 週）
**整體優先度**：🔴 最高（其他版本的前置條件）

---

### A 類：技術債清除（必做）

#### A1 — `usePanelState` hook 提取 ✅ 完成（2026-06-21）
**說明**：將 `App.tsx` 中 14 個面板開關 boolean state 提取為獨立 `usePanelState` hook，回傳 `{ panels, openPanel, closePanel, togglePanel }` 統一介面。`App.tsx` 只保留業務邏輯組合，不再直接持有面板 state。`PanelName` union（search/hotkey/overview/taskCenter/filter/reviewCenter/backup/knowledgeGraph/cardLibrary/quickCapture/onboarding/trash/quickSwitcher/overdueBanner）集中管理，之後新增面板只需加一個名字。

- **工作量**：1 人天（實際 0.5）
- **優先度**：🔴 高
- **依賴**：無
- **驗收標準**：
  - ✅ `App.tsx` 14 個面板 `useState` 全部移除（僅留 `isDark` 主題與 `movingCardShapeIds`/`deletingBoardId` 帶 payload 的 modal state）
  - ✅ `BoardTabBar` 的 12 個面板開啟 callback 合併為單一 `onOpenPanel(name)` prop；`SidebarFooter` 同步（6→3 props）
  - ✅ `tsc --noEmit` 零錯誤、ESLint 零警告
  - ✅ 新增 `usePanelState.test.ts`（7 案例：初始關閉、open/close/toggle 隔離、相同狀態回傳同參考），全專案 241 測試全綠
  - 備註：App.tsx 行數降至 365；≤200 行目標待 A2（useBoardManager 拆分）後達成

#### A2 — `useBoardManager` 拆分 ✅ 完成（commit d8f2b32）
**完成現況**：已拆為 **8 個 sub-hook**（超出原規劃的 5 個）：`useAutoBackup`、`useSidebar`、`useTrash`、`useNavigation`、`useBoardCRUD`、`useFolder`、`useJournal`、`useInboxCards`。`useBoardManager.ts` 由約 800 行降至 **275 行的合成層**：僅保留跨多個 state slice（boards / activeBoardId / navigationStack）的 handler（handleSwitch / handleSwitchToChild / handleSetParent / handleNew / 兩個刪除 handler / handleRestore / handleGoToWeeklyCard / 初始載入 effect）與對外 API 組裝。對外 handler 名稱完全不變，45 個 useBoardManager 測試全綠。

> **驗收標準調整（2026-06-21）**：原訂「主檔 ≤ 80 行」。實測剩下的 275 行皆為跨 state 的協調邏輯，硬搬進 sub-hook 會迫使各 hook 互傳大量 setter，pass-through 反而降低可讀性、且需動到 45 個測試的安全網——屬過度優化。決定以「核心職責已拆分、AI/同步 handler 已有明確落點」為 A2 完成標準，不強求行數。各 sub-hook 皆 < 200 行（達標）。

<details><summary>原規劃（5 個 sub-hook，保留供參）</summary>


| 新 Hook | 職責 | 大約行數 |
|---------|------|---------|
| `useBoardCRUD` | 白板建立/重命名/刪除/排序/釘選/封存 | 150 行 |
| `useTrash` | 軟刪除/永久刪除/清空/14 天排程 | 120 行 |
| `useNavigation` | `navigationStack` 麵包屑、前進/後退 | 80 行 |
| `useJournal` | Journal 白板自動建卡、週回顧觸發 | 100 行 |
| `useAutoBackup` | 備份觸發節流、過期備份清理 | 80 行 |

`useBoardManager` 改為薄包裝，組合以上 5 個 hook。

- **工作量**：3 人天
- **優先度**：🔴 高
- **依賴**：A1（`usePanelState` 先完成，減少 prop drilling 糾纏）
- **驗收標準**：
  - 各 sub-hook 各自在 200 行以內
  - 對外 API（`useBoardManager` 回傳的 handler 名稱）完全不變
  - `useBoardManager.ts` 本身降至 80 行以內
  - `tsc --noEmit` 零錯誤；手動測試所有白板 CRUD 操作正常

</details>

#### A3 — `useBacklinks` 增量更新 ✅ 完成（commit `34b0da4`）
**說明**：已從 `useMemo([boards])` 改為 `useRef` per-board 快取。以 `board.snapshot` reference 為 cache key，只重掃有異動的白板。實測（37 塊）：每次存檔只掃 1 塊 ≈ 0.4ms；平移時 hook 完全不執行。

#### A3-ext — `useBacklinks` Dexie 持久化 index（觀察中，千板以上觸發）
**說明**：當白板數量破千後，A3 的 per-board useRef 快取有兩個瓶頸：
1. 所有板的 snapshot 仍需常駐記憶體（1000 板 × ~100KB ≈ 100MB+）
2. 每次存檔的 merge 步驟仍需走完所有快取

改為 Dexie 持久化 index：
- Dexie 新增 `backlinks` table：`{ shapeId, boardId, boardName, targets[], preview, x, y }`
- `onSaveBoard` 時只針對該板做差量 upsert（不需掃其他板）
- `useBacklinks` 改為 Dexie reactive query，不依賴 `boards` array
- Snapshot 只保留「當前開著的板」在 memory
- **依賴**：A2（useBoardManager 拆分），需要獨立的 save hook 才方便掛 Dexie 寫入

- **工作量**：2–3 人天
- **優先度**：🔵 觀察中（目前 ~37 塊，流暢；超過 500 塊時重新評估）
- **觸發條件**：使用者白板數 > 500 或出現可量測的 merge 卡頓

#### A4 — `stripHtml` 統一 ✅ 完成（2026-06-20）
**說明**：在 `src/utils/stringUtils.ts` 新增統一的 `stripHtml`。盤點發現實為 **7 處** 本地實作（`SearchPanel`、`useBacklinks`、`DeleteBoardDialog`、`exportMarkdown`、`CardLibrary`、`FilterPanel`、`Dashboard`），全部改 import、移除本地定義。統一版以 `DOMParser` 解碼所有 entity，並修正舊版共同缺陷——只在區塊邊界插空格，行內標籤（`<strong>`/`<em>`/`<a>`）不插，避免 `<strong>粗</strong>體`→`粗 體` 的 CJK／搜尋 bug。新增 `stringUtils.test.ts`（7 案例）。

- **工作量**：0.5 人天（實際）
- **優先度**：🟢 低
- **依賴**：無
- **驗收標準**：✅ 7 處呼叫點全部改用 `stringUtils.stripHtml`，無本地定義；`npm run build` 與 228 測試全綠

#### A5 — 孤兒元件清理 ✅ 完成（2026-06-20）
**說明**：
1. ✅ 確認 `CalendarView`/`JournalDayView` standalone 全螢幕版無任何 JSX/import 引用（`ReviewCenter` 只用內嵌 `CalendarContent`/`JournalDayContent`），刪除兩個 standalone 包裝，保留 Content 版與共用子元件
2. ✅ 確認 `useFileStorage.ts` 無源碼 import，整檔刪除
3. ✅ 清掉 `CalendarView.tsx` 因此變未用的 `useEffect` import

- **工作量**：0.5 人天（實際）
- **優先度**：🟢 低
- **依賴**：無
- **驗收標準**：✅ 無孤立引用；`tsc -b` 零錯誤；228 測試全綠

#### A6 — 知識圖譜（`KnowledgeGraph.tsx`）優化（Bundle A ✅ / Bundle B ✅ / Bundle C 🟢 暫緩）
**背景**：盤點知識圖譜功能，發現其自成一套 wikilink 解析，與 App 其他部分（`useBacklinks` / `BacklinksPanel` / `appEvents` 實際跳轉）不一致，會畫出與真實連結語意不符的連線；同時重現了 TD4/TD5/A4 已清除的病灶。分三個 Bundle：

**Bundle A — wikilink 解析對齊 ✅ 完成（2026-07-06）**
> 做法：把 `buildGraph` 抽成純函式 `src/utils/knowledgeGraph.ts`，卡片命名改用 `extractCardName`、wikilink 連結改取 `useBacklinks` 的增量快取 `forwardLinks`（已 stripHtml + 去重）；`KnowledgeGraph.tsx` 改呼叫 `useBacklinks(boards)`（圖譜在 App 頂層、不在 Whiteboard 的 BacklinksContext 內，故自帶一份 hook 實例，開啟時全掃一次、之後存檔增量）。移除本地 `firstLine` / `extractWikilinks`，並把原「每板掃兩遍」收斂為單遍。
> 驗收：✅ 連線命名與 BacklinksPanel/`[[]]` 跳轉一致（含 H1 標題卡）；✅ 無本地 extractWikilinks/firstLine；✅ wikilink 解析改走增量快取（不再重新解析 HTML）；✅ `npm run build` exit 0、263 測試全綠、ESLint 0；✅ 新增 `src/utils/knowledgeGraph.test.ts`（9 案例）。

<details><summary>原問題與修法（保留供參）</summary>
1. **命名不一致**：圖譜用 `firstLine()`（去 tag 後前 48 字）當卡片名並據此連線，但全 App 其他處用 `extractCardName()`（優先 H1/H2 標題，否則前 40 字）。→ 有標題的卡片，圖上連線與實際 `[[xxx]]` 跳轉目標**對不上**。
2. **`extractWikilinks` 直接吃原始 HTML、不 `stripHtml`、不去重**（`KnowledgeGraph.tsx:38`），而 `useBacklinks.extractLinks` 先 stripHtml 再去重 → 分歧解析、重複連線。**TD5 病灶再現**。
3. **`firstLine` 自行去 tag** 未用 `stringUtils.stripHtml` → **A4 已修的行內標籤誤插空格 CJK bug 重生**（`<strong>重點</strong>筆記`→`重點 筆記`）。
4. **`buildGraph` 全量掃描 O(boards×shapes)，`useMemo([boards])`** → 圖譜開著時每次任一白板存檔整包重算，**TD4 病灶再現**。

   **修法**：改為複用 `useBacklinks` 已算好的增量快取（`forwardLinks`）與 `extractCardName`，一次解決 1–4：連線語意與 App 一致、消重複邏輯、順帶去掉全量重掃。

- **工作量**：1–1.5 人天
- **優先度**：🔴 高（正確性，且與既有技術債清理同調）
- **依賴**：`useBacklinks`（A3 已完成）、`stringUtils.stripHtml`（A4 已完成）
- **驗收標準**：
  - 圖譜連線的來源/目標與 BacklinksPanel、`[[xxx]]` 實際跳轉完全一致（含 H1 標題卡）
  - `KnowledgeGraph.tsx` 不再有本地 `extractWikilinks` / `firstLine` 去 tag 實作
  - 圖譜開啟期間存檔不再觸發全量重掃（複用增量快取）
  - `npm run build` exit 0、既有測試全綠；補圖譜 graph builder 單元測試

</details>

**Bundle B — 繪製優化 ✅ 完成（2026-07-06）**
5. ~~**每個 board 掃兩遍**：Pass 1 與 Pass 2 各呼叫一次 `getCardShapes`~~ ✅ 已於 Bundle A 順手收斂為單遍（連結改取 forwardLinks 後不需再掃第二遍）。
6. ~~**`paintNode` 未用 `globalScale` 做 LOD**~~ ✅ `paintNode` 加第三參數 `globalScale`，標籤顯示改由純函式 `shouldShowNodeLabel(type,val,globalScale)` 判斷（白板 > 0.6 顯示、卡片需 val≥3 且 > 1.2）→ 縮小看全局自動隱藏標籤、免重疊省重繪。補 3 條 LOD 單元測試。

- **工作量**：0.5 人天
- **優先度**：🟡 中（不動資料語意，風險極低）
- **依賴**：無（可與 Bundle A 分開）
- **驗收標準**：縮小到全局視圖時標籤自動隱藏、無重疊；`getCardShapes` 每板僅呼叫一次

**Bundle C — 功能/UX 增強（🟢 低，較主觀，暫緩）**
- 只有 text/journal 是節點；卡片與所屬白板無歸屬連線 → 無 wikilink 的卡是孤點（可加白板↔卡片歸屬邊，或維持現況靠「只顯示有連結的節點」toggle）
- 大圖無搜尋/聚焦/highlight、開啟無 zoom-to-fit
- 同名卡只連第一張、board 名恆優先於 card 名，歧義靜默處理

- **優先度**：🟢 低（屬新需求，非債務；roadmap 未列，日後再議）

> **建議排程**：先做 Bundle A（治本、與技術債清理同調），再視情況接 Bundle B；Bundle C 暫緩。

---

### B 類：UX 改善

#### B1 — 批次操作（多選）✅ 完成（2026-06-20）
**說明**：多選卡片（`opCount>1`）後右鍵選單新增（全部於 `contextMenuUtils.tsx`，以 `editor.batch` 套用）：
- ✅ **批次修改 Status**：📊 submenu（待辦/進行中/完成/清除）
- ✅ **批次修改 Priority**：⚑ submenu（高/中/低/清除）
- ✅ **批次修改標籤**：🏷 開 `BatchAddTagModal` 輸入，附加（去重、不覆蓋既有）
- ✅ **批次移動至白板**：📦 → `MoveCardModal`，`handleMoveCardsToBoard` 一次搬全部、水平排開附加。
  分兩步擴大涵蓋：先 Inbox-only（B），再泛化至任意白板（A，來源＝active 板、排除自己）
- ✅ **批次刪除**：移入垃圾桶（原已支援，逐張 saveCardToTrash）

- **工作量**：2 人天（實際分 4 個增量 commit：階段一狀態/優先級、階段二標籤、階段三-a Inbox 移動、階段三-b 泛化）
- **優先度**：🔴 高
- **依賴**：tldraw 多選狀態（`editor.getSelectedShapeIds()`）
- **驗收標準**：
  - ✅ 選取多張卡片後右鍵，可見批次操作子選單
  - ✅ 批次移動後目標白板含對應卡片（含非 Inbox 來源板）
  - ✅ 批次刪除後垃圾桶顯示對應記錄
  - ✅ 新增 2 測試（泛化來源批次移動、移到自己無操作），全專案 230 測試全綠

#### B2 — 快捷鍵補全 ✅ 完成（2026-06-21）
**說明**：補充目前缺少快捷鍵的卡片類型：

| 按鍵 | 功能 | 狀態 |
|------|------|------|
| `S` | 新增便利貼 | ✅ |
| `Shift+N` | 新增標題卡片 | ✅ |
| `Shift+T` | 新增表格卡片 | ✅ |
| `K` | 新增 Kanban 看板卡片 | ❌ 取消（C1 已跳過）|

實作：`HotkeyActions` 新增三個 optional handler；`Usehotkeys.tsx` 非修飾鍵分支以 `e.shiftKey` 將 `N`/`T` 分流（`Shift+N`→標題、`Shift+T`→表格），新增 `S`→便利貼；`WhiteboardTools` 將既有 `createStickyCard/createHeadingCard/createTableCard` 接入 `useHotkeys`。`HotkeyPanel`「新增卡片」段同步顯示。新增 `Usehotkeys.test.tsx`（4 案例：分流、input 內不觸發），全專案 234 測試全綠。

- **工作量**：0.5 人天（實際）
- **優先度**：🟡 中
- **依賴**：B1 完成後確認無快捷鍵衝突（已確認 `S`/`Shift+N`/`Shift+T` 與工具/面板鍵無衝突）
- **驗收標準**：✅ `HotkeyPanel` 顯示新快捷鍵；✅ 按鍵分派經單元測試驗證；`K`（Kanban）因 C1 已跳過而取消

#### B3 — 搜尋面板類型篩選
**說明**：在搜尋輸入框下方新增 chip 篩選列（全部 / 文字 / 待辦 / 連結 / 便利貼 / 表格 / …），點選後縮小搜尋範圍至該卡片類型。

- **工作量**：1 人天
- **優先度**：🟡 中
- **依賴**：`SearchPanel` 現有索引架構（`buildSearchIndex` 已含 `type` 欄位）
- **驗收標準**：選「待辦」後，搜尋結果僅顯示 `type === 'todo'` 的卡片；「全部」恢復全類型搜尋

#### B4 — 白板卡片縮圖懸停預覽
**說明**：在側邊欄白板清單、BoardOverview 的縮圖上，hover 時顯示 240×180px 的較大縮圖 tooltip（僅用已有 thumbnail data，無需重新渲染）。

- **工作量**：0.5 人天
- **優先度**：🟢 低
- **依賴**：現有 `board.thumbnail`（base64 PNG）
- **驗收標準**：hover 250ms 後出現預覽；離開後 150ms 消失；不影響側邊欄點擊切換白板功能

---

### C 類：新功能

#### C1 — Kanban 看板卡片 ❌ 跳過（2026-06-21）
> **決定：不做。** 理由：
> 1. **與既有功能互補但邊際價值低**：Kanban 是「階段視角」（按 `cardStatus` 分欄），而 App 已有 TaskCenter（死線視角）+ 卡片狀態徽章 + 右鍵批次改狀態。自用情境下「拖動換階段」的手感增益不足以justify一個新型別。
> 2. **避免型別膨脹**：現有 11 種卡片型別已偏多；新增 `kanban` 型別會在匯出/搜尋/批次/sanitize/記憶體全面增加維護面。參考 Heptabase（萬用卡+區塊）與 Milanote（容器組合）的「少型別」哲學——**優先用組合（如 frame）而非新型別**。
> 3. **真實需求已被滿足**：追問後發現使用者要的其實是「TaskCenter 看得出任務來源白板」，已以來源白板 chip 解決（commit 833ed90），與 Kanban 無關。
>
> 若未來確有「階段看板」需求，正解是「按 `cardStatus` 分組的視圖」或「frame + 現有卡片」組合，而非新增卡片型別。以下原規劃保留供參。

**說明**：新增 `type: 'kanban'` 卡片，在卡片內顯示三欄（待辦 / 進行中 / 完成），每欄可新增文字項目、拖曳排序、刪除。卡片尺寸預設 500×360px，可自由縮放。資料結構：

```typescript
type KanbanColumn = { id: string; title: string; items: { id: string; text: string }[] }
// TLCardProps.kanbanColumns: KanbanColumn[]
```

- **工作量**：4 人天
- **優先度**：🔴 高
- **依賴**：`@dnd-kit/core`（已安裝）；A2 完成後新增 handler 較易定位
- **驗收標準**：
  - 可從右鍵選單、工具列建立 Kanban 卡片
  - 三欄各可新增項目（Enter 確認）、刪除項目（× 按鈕）
  - 欄內項目可拖曳排序
  - 資料持久化（切換白板後回來資料不遺失）
  - 匯出 PNG/PDF 時 Kanban 卡片正確渲染

#### C2 — 連結卡片 OG Metadata 抓取 ✅ 完成（盤點發現已實作，2026-06-21）
**說明**：建立連結卡片時，透過 Electron 主程序解析 `og:title`/`og:description`/`og:image`（`twitter:image` 與 `<title>` fallback）並顯示於卡片。

**現況盤點**：完整鏈路**早已存在**，原描述「目前只抓 YouTube 標題」已過時：
- `main.js:103` IPC handler `get-link-preview`（以 `net.fetch` 抓取，regex 解析 og/meta tag）
- `preload.js:11` 暴露 `getLinkPreview`
- `embedUtils.ts:92` 一般 URL fallback 呼叫
- `LinkContent.tsx:214` 渲染 `<img src={p.image}>` 封面圖

- **優先度**：✅ 已完成（剩可選細節：逾時上限、og:image 卡內高度上限可再核對）
- **驗收標準**：✅ 貼入支援 OG 的 URL 顯示標題與封面圖；✅ 抓取失敗 fallback 不 crash

#### C3 — 表格卡片強化
**說明**：
1. ✅ **標題行切換（C3-1，2026-06-21）**：右鍵選單「開啟/關閉標題列」切換 `tableHeaderRow`（未設視為開啟，向後相容）；開啟時第一列以標題樣式顯示。順手修掉原本「首列硬編碼為標題、無法關閉」的瑕疵。
2. ✅ **列拖曳排序（C3-3，2026-06-21）**：列左側 hover 顯示拖曳把手（`⠿`），`@dnd-kit/sortable`（`SortableRow` render-prop + `DndContext`/`SortableContext`）；放開後重排 `tableData`。把手 `onPointerDown` stopPropagation 與 tldraw 隔離。注意：tldraw 縮放 ≠ 1 時拖曳位移視覺會略偏（dnd-kit 平移未隨畫布縮放），近 100% 縮放正常。
3. ✅ **欄數快速切換（C3-2，2026-06-21）**：右鍵「欄數」子選單（2/3/4），增欄補空格、減欄截斷最右欄；減欄且該欄有資料時 `window.confirm` 確認後才清除。（實作於右鍵選單而非屬性列，與 C3-1 一致）

- **工作量**：2 人天
- **優先度**：🟡 中
- **依賴**：`@dnd-kit/sortable`（已安裝）
- **驗收標準**：
  - 標題行開關後 UI 立即反應，切換白板後持久保存
  - 拖曳列順序後資料順序正確更新
  - 欄數從 3 改為 2 時彈出確認對話框，確認後最右欄資料清除

#### C4 — Markdown 匯入
**說明**：支援以下兩種觸發方式建立文字卡片：
1. **拖曳 `.md` 檔案**到白板 → 讀取內容，以 TipTap 格式轉換（標題/清單/程式碼區塊）建立文字卡片，卡片標題取 markdown 第一行 H1
2. **貼上純文字**：若剪貼板內容以 `# ` 開頭且含有多行，偵測為 Markdown，詢問是否建立文字卡片（避免覆蓋現有純文字貼上行為）

Markdown → TipTap 使用 `marked`（新增依賴，或手動解析常見語法）。

- **工作量**：2 人天
- **優先度**：🟢 低
- **依賴**：`marked`（需新增依賴）；Electron `ipcMain` 讀檔（已有類似機制）
- **驗收標準**：
  - 拖入含 H1/H2/清單/程式碼的 .md 檔案，文字卡片正確呈現對應樣式
  - 貼上一般文字時不觸發 Markdown 偵測

---

### v1.2.0 完成標準

所有以下條件同時成立，才視為 v1.2.0 完成：

1. **TypeScript 零錯誤**：以 `npm run build`（`tsc -b`）驗證 0 errors（注意：`npx tsc --noEmit` 有盲點會漏抓）
2. **ESLint 零警告**：`eslint src/ --ext .ts,.tsx` 輸出 0 warnings（目前仍有數個 exhaustive-deps，多為刻意）
3. **App.tsx 精簡**：面板相關 `useState` 全部移除（✅ A1）；檔案行數 ≤ 200 行（未達，現 365；A2 已結案不強求）
4. **useBoardManager 拆分**：✅ 已拆 8 sub-hook（A2 結案，主檔行數目標調整為現實標準）
5. **技術債清單**：TD1–TD5、TD7 全部標記為 ✅ 已解決
6. **新功能驗收**：C2 ✅（盤點已實作）、C3 ✅（三項完成）、**C1 ❌ 跳過**、C4 ⬜ 可做可不做（🟢 低）
7. **無功能迴歸**：既有 11 種卡片類型基本操作（建立/編輯/刪除/移動/匯出）手動全部驗證通過

---

## 待辦彙整（2026-07-04 手動測試 + AI 提案盤點）

> 來源：使用者手動測試逐項回報（D1–D8）＋ 外部 AI 的 18 條功能提案（去重、現況校正後）。
> 詳細記錄見 [`docs/maintenance/manual-test-2026-07-04.md`](maintenance/manual-test-2026-07-04.md)。
> 原則：交叉引用既有項目（A6/C4/E1/AI-4/AI-8/TD-IMG），**不重複造輪子**；已實作者不列為新功能。
> 優先序：🔴 高 ／ 🟡 中 ／ 🟢 低 ／ 🔵 觀察。前置依賴標於各列。

### 一、手動測試發現（D1–D8，多為 UX/效能，歸 v1.2.0 B 類補充）

| ID | 發現 | 優先序 | 前置依賴 | 落點 / 備註 |
|----|------|--------|---------|------------|
| B5（D3） | 白板預覽卡片無法區分主板/子板 | ✅ 完成（2026-07-14） | 無（`parentId` 已有） | `BoardOverview` 子板縮圖左上加藍色「↳ 父板名」chip（非選取模式），與父板黑色「N 個子板」badge 區隔；新增 `parentName` helper（容 null）。commit `ae3cd44` |
| B6（D5） | 卡片庫列表檢視辨識度不足（無文字標籤、類型無色、文字卡未分層） | ✅ 完成（2026-07-13） | 無（`TYPE_LABEL` 已有） | 列表/格狀補類型文字標籤＋`TYPE_COLOR` 類型上色（圖示/標籤）＋文字卡 H1/H2 標題分層（新純函式 `splitTitleBody`，+7 測試） |
| B7（D6） | 大量物件一律橫向排列 | ✅ 完成（2026-07-13） | 無 | `useInboxCards.ts` 搬卡（`gridLayout` 近正方形）＋快速捕捉（`nextGridSlot` 5 欄）改網格換行；純函式抽至 `snapshotCards.ts`（+18 測試），未來圖片集體上傳可共用 |
| B8（D4） | 側邊欄拖拽歸類（拖進資料夾） | 🟡 中 | 無（`@dnd-kit` 已用） | 把右鍵「移入資料夾」升級為拖放（方案 A）；「最近使用」本質自動排序，不做拖排序 |
| B9（D2） | 右鍵選單無規範文件（可發現性差） | ✅ 完成（2026-07-14） | 無 | `docs/context-menu-spec.md`（完整規範各情境選單項＋捷徑對照）＋README 索引；App 內提示現況＝OnboardingModal 已涵蓋。commit `be064bc` |
| P-DRAW（D8） | 筆刷卡頓 | 🟡 中 | **實測先行**（TD-IMG ✅ 後重測） | 已排除存檔/縮圖；疑重型卡片重繪，需 DevTools Performance 量測；TD-IMG 已移除 base64 圖片內嵌，應先重測是否已緩解再決定是否進一步治 |
| 討論（D1） | 主頁儀表板/白板雙模式不直覺 | ✅ 完成（2026-07-15） | 產品決策已拍板 | **決議：主頁永遠是儀表板，砍掉雙模式**（使用者確認幾乎不用主頁畫布，都在其他白板）。移除 `homeView` state／localStorage `home-view`／Dashboard 與 WhiteboardTools 兩組切換鈕；`Whiteboard.tsx` 改為 `if (board.isHome) return <Dashboard/>`。舊主頁畫布內容由 `loadAllBoards` 自動整份搬成普通白板「主頁白板」（`utils/homeBoardMigration.ts`，只搬不刪、+11 測試）；主頁保留 board record 當導覽錨點（不動 `activeBoardId` 導覽模型，見下方註）。`uniqueName` 從 useBoardCRUD 移到 utils/boardDb（避免資料層 → hook 的循環匯入） |
| 討論（D7） | 任務中心/復盤中心使用率低 | ✅ 決議完成（2026-07-15）；實作待排 | 產品決策已拍板 | **完整討論見 [product-redesign-2026-07.md](product-redesign-2026-07.md)**。關鍵發現：①D7 前提錯誤——兩個中心不對稱（復盤中心是 127 行的殼、任務中心有 330 行真邏輯）；②兩者是按「功能類別」歸檔而非「使用時機」，補丁救不了；③使用者很少設 dueDate → **整條死線視角恆為 0**（儀表板 4 格統計死 3 格、逾期 banner 永不出現、任務中心 5 頁籤死 3 個）；④真正需求是「憶起」不是死線管理，架構根源見 [ADR 0007](adr/0007-cards-bound-to-single-board.md)。**決議**：砍月曆＋復盤中心＋死統計；週回顧統計／日記時間軸／未完成摘要搬儀表板；任務中心留但脫掉行事曆外衣 |

### 二、新增功能候選（AI 提案去重 + 校正後）

> ⚠️ 已實作、勿當新功能重做：**卡片模板系統**（右鍵已有內建+自訂模板）、**Markdown 匯出**（`exportMarkdown.ts`）、**JSON 匯入匯出**、Onboarding modal、暗色模式、Journal 每日自動建卡、週回顧、日曆檢視、Vitest。

| ID | 功能 | 優先序 | 前置依賴 | 校正 / 落點 |
|----|------|--------|---------|------------|
| N1 | 全域 Command Palette（擴充 QuickSwitcher） | ✅ 完成（2026-07-14） | 無 | Ctrl+K；資料驅動命令 registry（`utils/commands.ts` 17 命令 + filterCommands）+ `CommandPalette.tsx`（命令+白板切換併一面板）；QuickSwitcher(Ctrl+P) 保留純切板。一併改善 D1/D7 可發現性。commit `01883b8` |
| N2 | Inbox Triage 收件匣整理模式 | ✅ 完成（2026-07-15） | 無 | Ctrl+Shift+E；一次一張做一個決定（移到白板 M／標為任務 T／保留 K／刪除 D／略過 S），完成畫面給統計。純函式 `utils/inboxTriage.ts`（佇列/游標/統計，+19 測試）＋ `InboxTriage.tsx`；佇列開啟時建一次避免卡片跳位。資料層複用既有 `handleMoveCardsToBoard`，新增 `handleUpdateInboxCardProps`（inbox 領域）與 `handleTrashInboxCard`（跨領域，走既有垃圾桶流程）。不動資料模型 |
| N3 | 系統托盤 + 全域快速捕捉 | ✅ 完成（2026-07-15） | Electron only | 托盤圖示（`assets/tray-icon.png`，`scripts/gen-tray-icon.mjs` 可重產）＋選單（顯示/快速捕捉/最小化開關/離開）；關視窗＝收進托盤（可從托盤選單關閉此行為，存 electron-store）；全域 `Ctrl+Shift+Space` 捕捉；單一實例鎖（再點捷徑＝叫回視窗） |
| N4 | Tag Manager 標籤管理中心 | ✅ 完成（2026-07-15） | 無 | 跨白板統計/改名/合併（改成既有標籤即合併）/顏色/移除。純函式 `utils/tagManager.ts`（+16 測試）＋ `utils/tagColors.ts`（+13 測試，顏色存 localStorage、未指定者用名稱雜湊固定色）；`useTags` hook 逐張發 `update-shape-props-in-editor` 同步已掛載 editor。類型 metadata 抽至 `utils/cardMeta.ts` 供 CardLibrary/InboxTriage 共用；標籤色已套用到 CardLibrary 與 FilterPanel（圖譜未動） |
| N5 | Smart Collections 智慧集合 | 🟢 低（2026-07-15 下調） | 無 | **原定位有誤**：被寫成篩選器功能，但真正需要的是「主動浮現」（見 [product-redesign-2026-07.md](product-redesign-2026-07.md)）——浮現的部分已改由儀表板重組＋N6 承接。剩下的「逾期/高優先」預設集合對本使用者恆為空（無 dueDate）；「孤立卡片」短期是雜訊（2026-07 才開始用 `[[]]`，無 backlink ≈ 全部舊卡）。可做可不做 |
| N6 | 未連結提及偵測（Unlinked mentions） | 🔴 **高（2026-07-15 上調，脫離 A6 獨立）** | ~~效能驗證先行~~ **✅ 前置已解除（2026-07-15）** | **重新定位：這不是圖譜裝飾，是「憶起」的主力機制**（見 [ADR 0007](adr/0007-cards-bound-to-single-board.md)）。寫下 `[[專案A]]` 時指出「另有 3 張舊卡提到過但沒連結」＝用新連結打撈舊卡，且自帶時機（寫作當下浮現，不需使用者記得去看）。比「久未造訪」高明：後者靠時間推東西，常推出已結案的死板＝雜訊；前者靠語意相關。~~前置：需驗證能否掛上 `useBacklinks` 增量快取~~ → **✅ 已實測，效能非問題**（見 [n6-performance-2026-07-15.md](maintenance/n6-performance-2026-07-15.md)）：`stripHtml` 是**沉沒成本**（`scanBoard` 今天就對每張卡跑 DOMParser，N6 要的純文字正是那個算完被丟掉的東西）；真實粒度（board-level 失效）下每次編輯 1000 卡 < 8ms、3000 卡 22.8ms；**掛上去反而讓 useBacklinks 快 32%**（現在有連結的卡 strip 兩次）。**風險改為「準確度／雜訊」**：樸素子字串比對會把「主頁白板」誤判進「主頁白板 (2)」的內文，且句子型標題全數落空 → 下一個要解的是**比對規則**，不是速度 |
| N7 | 範例白板（首次啟動 seed） | ✅ 完成（2026-07-14） | 無 | 全新使用者首次建板時 seed 4 張範例卡（走 editor.createShape 避 schema 風險，純資料 `EXAMPLE_CARDS`）。commit `e8f8472` |
| N8 | 測試覆蓋報告 + CI | ✅ 完成（2026-07-14） | 無 | `@vitest/coverage-v8`＋`test:coverage`（不設 threshold）；CI 跑 coverage 並上傳 artifact。commit `25df96c` |
| N9 | Diagnostics / Debug 面板 | 🟡 中 | 無 | main.js 已有 console 轉發/崩潰監聽；面板化＋debug report；支援 D8 排錯 |
| N10 | 資料安全中心（容量統計 + 一鍵清理） | 🟡 唯讀版完成（2026-07-14）；清理待做 | 無（唯讀先行） | `DataSafetyPanel` 顯示 IndexedDB 用量/白板/卡片/體積明細（純函式 `computeVaultStats`）；**清理舊備份/無用縮圖尚未開放**。commit `c746b44` |
| N11 | 檔案卡片進階（拖放建卡/PDF 預覽/遺失檢查） | 🟡 中 | 無 | File card 基礎已有；OCR 依賴 AI-7 |
| N12 | 主題/外觀自訂（accent/圓角/字級/背景樣式） | 🟢 低 | 無 | 暗色已有，擴充樣式 |
| N13 | 任務排程強化（Calendar 拖曳改期/重複/提醒） | 🟡 中 | 無 | 日曆/到期/逾期已有，補排程互動 |
| N14 | Daily/Weekly 自動化（rollover/自動嵌入/月回顧） | 🟡 中 | 連動 AI-4 | Journal/週回顧已有，補自動化 |
| N15 | Markdown/Obsidian 匯入 | 🟡 中 | **= C4（已排程）** | 併入 C4，不另列；Obsidian vault 匯入為 C4 擴充 |
| N16 | 完整 Vault Export（.astrolabe 打包） | 🟡 中 | **依賴 E1（v1.4.0）**（TD-IMG ✅ 已完成） | 打包 boards+cards+files+backups+settings；重疊 E1 |
| N17 | 備份保留數設定 | 🟡 中 | ✅ **TD-IMG 已完成，前置解除** | image 卡已改存實體檔，base64 不再內嵌；放大備份數風險大降，仍建議加容量警告 |
| N18 | 大型 Vault 效能模式（只載 metadata 安全模式） | 🔴 高（長期） | **依賴 A3-ext**（TD-IMG ✅ 已完成） | 架構級；延遲載入 snapshot、容量偵測；TD-IMG 已拔除 base64 圖片病根，剩 snapshot 常駐待 A3-ext |

### 三、建議排程（波次）

- **Wave 1｜低風險速贏（v1.2.0 收尾）**：✅ **全部完成（2026-07-14）**——B5/B6/B7（D3/D5/D6）、N7（範例白板）、N8（coverage/CI）、N10（資料安全中心唯讀版）、B9（右鍵文件）。
- **Wave 2｜高價值真新（v1.2.x → v1.3 前）**：✅ **全部完成（2026-07-15）**——N1（Command Palette，07-14）、N2（Inbox Triage）、N3（系統托盤 + 全域捕捉）、N4（Tag Manager）。
- **Wave 3｜前置依賴解鎖後**：**TD-IMG ✅ 已完成（治本 OOM/圖片體積，commit `7eaf7f5`）** → N17（備份保留數）前置已解除、N18 剩 A3-ext；P-DRAW 可重新實測 TD-IMG 是否已緩解；圖譜相關 N6 併 A6；MD 匯入併 C4。
- **需產品決策先行**：~~D1（主頁定位）~~ ✅ 已拍板（2026-07-15，主頁＝儀表板）；**D7（任務/復盤存廢）仍待討論**。
  - D1 定案後，D7 的「降低進入門檻：主頁嵌入小工具」其實已是既成事實——儀表板本來就嵌了今日待辦／今日日記＋卡片庫/復盤中心/知識圖譜捷徑。
  - D7 真正剩下的是：**任務中心／復盤中心該不該續存為獨立面板**（提升 engagement vs 簡化合併）。
- **D1 已知取捨（未來若要再收斂）**：主頁現在是「一筆永遠不渲染成白板的 board record」。乾淨做法是讓主頁不是 board、改成獨立 view，但要動 `activeBoardId` 導覽模型（navigationStack／QuickSwitcher／Command Palette 切板都假設「當前位置＝一個 boardId」）。使用者感受不到差別，故刻意不做。

---

## v1.3.0 — Intelligence

### 版本目標

在「隱私優先、完全本機」的設計前提下，引入 AI 輔助功能。以 **Ollama**（本機 LLM）為主要 AI 提供者，同時支援使用者自行設定 OpenAI / Claude API key。本版本不依賴任何強制雲端服務。

**預估工作量**：30–36 人天（約 6–7 週）
**整體優先度**：🟡 中高
**前置條件**：v1.2.0 TD1（usePanelState）+ TD2（useBoardManager 拆分）完成

---

### AI 架構設計（v1.3.0 基礎，必須先完成）

#### AI-0 — AI Provider 抽象層
**說明**：新增 `src/ai/` 模組，定義統一介面：

```typescript
// src/ai/types.ts
interface AIProvider {
  name: string
  isAvailable(): Promise<boolean>
  complete(prompt: string, opts?: CompleteOptions): Promise<string>
  embed(text: string): Promise<number[]>   // 語意搜尋用
}
```

實作三個 Provider：
- `OllamaProvider`：呼叫 `http://localhost:11434/api/generate`
- `OpenAIProvider`：呼叫 OpenAI API（使用者提供 key）
- `ClaudeProvider`：呼叫 Anthropic API（使用者提供 key）

`src/ai/index.ts` 導出 `getActiveProvider()`，從設定讀取選擇。

- **工作量**：2 人天
- **優先度**：🔴 高（本版本所有 AI 功能的前置）
- **依賴**：無
- **驗收標準**：`OllamaProvider.isAvailable()` 在 Ollama 未啟動時回傳 `false` 不 crash；三個 Provider 可互換

#### AI-1 — AI 設定頁面
**說明**：在側邊欄底部「⋯」選單新增「🤖 AI 設定」入口，開啟設定面板：
- **Provider 選擇**：Ollama（本機）/ OpenAI / Claude / 停用
- **Ollama**：endpoint 設定（預設 `http://localhost:11434`）、模型選擇（從 Ollama 動態抓取已安裝模型清單）
- **OpenAI / Claude**：API Key 輸入（存入 Electron `safeStorage` 加密，不存入 IndexedDB）
- **測試連線**按鈕（呼叫簡單的 `complete("hi")` 確認可用）

- **工作量**：2 人天
- **優先度**：🔴 高（所有 AI 功能的入口）
- **依賴**：AI-0；Electron `safeStorage` API
- **驗收標準**：
  - API Key 存入後重啟 App，key 仍存在且不明文顯示
  - 測試連線失敗時顯示具體錯誤訊息（timeout / 401 / 503 等）
  - AI 停用時，所有 AI 相關 UI 元素隱藏

---

### AI 功能一覽

#### AI-2 — 文字卡片 AI 輔助選單
**說明**：在文字卡片（`type: 'text'`）的右鍵選單新增「AI 輔助 ▶」子選單：

| 選項 | 動作 |
|------|------|
| 📄 摘要 | 將卡片全文摘要為 3–5 句，建立新的文字卡片（位置偏移 +20px） |
| ✨ 展開 | 補充現有內容的細節，在原卡片追加段落 |
| ✍️ 改寫（精簡） | 縮短至原文 60% 以內 |
| 🌐 翻譯為英文 | 建立英文翻譯卡片 |
| 🌐 翻譯為中文 | 建立中文翻譯卡片 |

所有動作執行時顯示 loading spinner，完成後 toast 通知。

- **工作量**：3 人天
- **優先度**：🔴 高
- **依賴**：AI-0、AI-1
- **驗收標準**：
  - 文字卡片含 200 字以上時，「摘要」建立的新卡片在 30 秒內出現
  - AI 回應為空時顯示錯誤 toast，不建立空卡片

#### AI-3 — 待辦卡片 AI 任務拆解
**說明**：在待辦卡片右鍵選單新增「🧩 AI 拆解任務」。輸入一段描述性文字（或讀取卡片現有項目），AI 輸出 5–10 個具體子任務，以 JSON array 回傳後新增至卡片待辦清單。

提示詞模板（可在 AI 設定頁自訂）：
```
你是一個專業的任務管理助理。請將以下目標拆解為 5–10 個具體、可執行的待辦事項（以 JSON string array 回傳）：
{input}
```

- **工作量**：2 人天
- **優先度**：🟡 中
- **依賴**：AI-0、AI-1
- **驗收標準**：輸入「準備簡報」後，AI 回傳至少 5 個具體項目並加入待辦清單；JSON 解析失敗時以逐行解析 fallback

#### AI-4 — 週回顧 AI 草稿生成
**說明**：在 `ReviewCenter` 面板新增「✨ AI 生成草稿」按鈕。讀取本週 Journal 卡片文字、已完成待辦清單、知識連結建立數作為上下文，生成週回顧草稿並填入 WeeklyReview 卡片的對應段落（完成/學習/卡住/目標/待跟進）。使用者可在 AI 填入後自行修改。

- **工作量**：3 人天
- **優先度**：🟡 中
- **依賴**：AI-0、AI-1；需讀取本週 Journal 快照（已有 `getISOWeekKey` 工具）
- **驗收標準**：按鈕出現時本週有日記卡片；草稿填入後，週回顧卡片各段落非空且結構正確

#### AI-5 — 智慧標籤建議
**說明**：建立或編輯文字/便利貼/Journal 卡片時，在標籤輸入框旁顯示「💡 AI 建議」按鈕。呼叫後分析卡片內容，回傳 3–5 個建議標籤（排除已有標籤），以 chip 形式顯示供使用者一鍵套用。

- **工作量**：2 人天
- **優先度**：🟢 低
- **依賴**：AI-0、AI-1
- **驗收標準**：建議標籤與內容相關（主觀判斷）；點擊建議 chip 後立即加入標籤欄位

#### AI-6 — 語意搜尋
**說明**：在 `SearchPanel` 新增「語意搜尋」切換鈕（預設關閉）。開啟後：
1. 首次啟動時建立語意向量索引（`buildEmbeddingIndex`）：對所有卡片呼叫 `provider.embed()` 取得 embedding，存入記憶體 Map
2. 搜尋時計算 query embedding，以 cosine similarity 排序結果
3. 每次 boards 更新時增量更新索引（僅更新有變更的卡片）

**注意**：僅在 Ollama provider 下支援（OpenAI embedding 需額外費用，預設不啟用）。

- **工作量**：5 人天
- **優先度**：🟡 中
- **依賴**：AI-0、AI-1；A3（增量索引概念可複用）
- **完成標準**：
  - 輸入「下週會議」時能找到含「下周開會」的卡片
  - 索引建立時顯示進度（「正在建立語意索引 23/50...」）
  - Ollama 未啟動時，語意搜尋切換鈕顯示 disabled 狀態

#### AI-7 — 圖片卡片 OCR + AI 描述
**說明**：圖片卡片右鍵選單新增「🔍 AI 識別圖片」：
1. **OCR**（Ollama Vision 模型，如 `llava`）：識別圖片中的文字，結果存入 `card.aiOcrText`，顯示在卡片底部可展開區域
2. **AI 描述**：生成圖片的自然語言描述，存入 `card.aiDescription`，用於全域搜尋索引（讓圖片可被文字搜尋）

- **工作量**：3 人天
- **優先度**：🟢 低
- **依賴**：AI-0、AI-1；需要支援 Vision 的 Ollama 模型（`llava`）
- **驗收標準**：含文字的截圖 OCR 結果正確率 > 80%；OCR 結果存入後，`SearchPanel` 能搜尋到該圖片卡片

#### AI-8 — 知識圖譜 AI 主題聚類
**說明**：在 `KnowledgeGraph` 面板新增「🌐 AI 聚類」按鈕。分析所有白板/卡片的文字內容，以 k-means 聚類（k=5 可調），以不同顏色在圖譜中標示主題群組，並自動命名每個群組（如「工作任務」「學習筆記」）。

- **工作量**：4 人天
- **優先度**：🟢 低
- **依賴**：AI-6（embedding 基礎架構）
- **驗收標準**：20 個以上白板場景下，聚類結果有語意上的合理性（主觀判斷）；聚類顏色與 legend 同步

---

### v1.3.0 完成標準

1. **AI 提供者**：Ollama / OpenAI / Claude 三種 provider 可切換，設定持久化
2. **核心 AI 功能**：AI-2、AI-3、AI-4（高優先度）全部通過驗收
3. **隱私保護**：API Key 以 Electron `safeStorage` 加密；AI 請求在 Ollama 模式下完全本機
4. **降級行為**：AI 停用時，App 所有既有功能正常（無 AI 依賴的 runtime error）
5. **TypeScript 零錯誤**：`tsc --noEmit` 零錯誤

---

## v1.4.0 — Connected

### 版本目標

為「本機優先」的應用打開對外連結的窗口：支援跨裝置同步、白板分享、跨平台（macOS/Linux），並建立平台抽象層為未來 Web 版本鋪路。

**預估工作量**：33–40 人天（約 7–8 週）
**整體優先度**：🟡 中
**前置條件**：v1.2.0 完成（尤其 TD1+TD2）

---

### 平台抽象層（必做）

#### P1 — `src/platform/` 抽象層
> 🔀 **2026-06-21 併入行動端計畫**：此項即 [roadmap-mobile.md](roadmap-mobile.md) 的 **S0(a)**，為手機 PWA 編譯的前置。以行動端路線圖為準。

**說明**：新增 `src/platform/` 目錄，封裝所有 Electron 依賴呼叫：

```typescript
// src/platform/fs.ts
export async function readFile(path: string): Promise<Uint8Array>
export async function writeFile(path: string, data: Uint8Array): Promise<void>
export async function openInSystem(path: string): Promise<void>

// src/platform/dialog.ts
export async function showSaveDialog(opts): Promise<string | null>
export async function showOpenDialog(opts): Promise<string[] | null>

// src/platform/storage.ts
export async function getSecureItem(key: string): Promise<string | null>
export async function setSecureItem(key: string, value: string): Promise<void>
```

Electron 實作透過 `window.electronAPI`；Web fallback 使用 `File System Access API` 或 `localStorage`。

- **工作量**：3 人天
- **優先度**：🔴 高（本版本所有功能的前置）
- **依賴**：無
- **驗收標準**：現有 Electron 功能（開啟檔案、儲存匯出）全部改用 `platform/` 呼叫後行為不變；`npm run dev`（Web 模式）可編譯且不 crash

---

### 匯入/匯出強化

#### E1 — 完整 JSON 匯入
**說明**：目前只有 JSON 匯出，補充匯入功能。支援：
1. 匯入 Scout Astrolabe 匯出的 JSON（單一或多個白板）
2. 匯入前顯示預覽（含白板名稱、卡片數量、衝突白板警告）
3. 衝突解決策略：「建立副本」（預設）/ 「覆蓋」/ 「跳過」

- **工作量**：2.5 人天
- **優先度**：🔴 高（資料可攜帶性的基礎）
- **依賴**：P1
- **驗收標準**：匯出後刪除白板，再匯入，白板與所有卡片完整還原；衝突時三種策略行為正確

#### E2 — 靜態 HTML 匯出（可分享快照）
**說明**：新增匯出選項「匯出為可分享 HTML」。生成一份**自包含的靜態 HTML 檔案**：
- 嵌入所有卡片資料（JSON inline）
- 嵌入縮圖圖片（base64）
- 嵌入最小化的渲染 CSS
- 允許在瀏覽器中**唯讀瀏覽**：可平移/縮放、可查看卡片內容，但不可編輯

生成的 HTML 大小目標：≤ 2MB（不含大圖片）。

- **工作量**：4 人天
- **優先度**：🟡 中
- **依賴**：P1
- **驗收標準**：
  - 生成的 HTML 在 Chrome/Firefox/Edge 中可開啟
  - 含文字/待辦/表格卡片的白板，HTML 版本顯示一致
  - 大圖片卡片自動降解析度（最長邊 800px）

---

### 同步功能

#### S1 — 雲端備份（Google Drive / Dropbox / OneDrive）
> 🔀 **2026-06-21 部分重疊**：[roadmap-mobile.md](roadmap-mobile.md) 的雲端同步（Supabase）已涵蓋「資料上雲」核心；此項可後續整併，非獨立優先。

**說明**：在備份面板新增「雲端備份」區塊。使用者授權後，每次本機自動備份同時將 JSON 備份上傳至雲端指定資料夾。策略：
- 備份格式與本機完全相同（BoardRecord JSON array）
- 每個白板維持最多 30 份雲端備份（與本機同步）
- 可手動下載雲端備份至本機還原

支援的服務（用 OAuth 授權，API key 不由 App 持有）：
- Google Drive（Google Drive API v3）
- Dropbox（Dropbox API v2）

- **工作量**：6 人天
- **優先度**：🟡 中
- **依賴**：P1；Electron BrowserWindow popup 處理 OAuth 流程
- **驗收標準**：
  - 授權後，手動觸發備份，Google Drive 對應資料夾出現備份 JSON
  - 斷網時備份失敗，顯示錯誤 toast，本機備份不受影響
  - 重新授權流程（token 過期）可正常完成

#### S2 — 區域網路同步（LAN Sync）
> ❌ **2026-06-21 廢棄**：核心需求是「人在外面用手機」，LAN Sync 僅在同一 Wi-Fi 有效，外網場景無效。由 [roadmap-mobile.md](roadmap-mobile.md) 的雲端同步取代。

**說明**：同一 Wi-Fi 的兩台裝置間自動同步 boards。採用**主從架構**（一台作為 Host，其他為 Client），使用 mDNS 服務發現（`bonjour` / `mdns`）：

1. **Host 模式**：啟動本機 HTTP server（port 12345），對外提供 `/boards` GET API
2. **Client 模式**：透過 mDNS 發現同網路的 Host，定期（30 秒）pull boards 快照
3. **衝突解決**：Last-write-wins（`updatedAt` 時間戳比較）

初版不支援即時協作（非 CRDT），每 30 秒同步一次。

- **工作量**：7 人天
- **優先度**：🟡 中
- **依賴**：P1；E1（JSON 匯入邏輯可複用）；需新增 `mdns` 套件
- **驗收標準**：
  - 兩台裝置同網路，開啟 Host 模式後，Client 30 秒內看到最新白板
  - 離線後 Client 顯示「同步已暫停」不 crash
  - 同時編輯同一白板，30 秒後以較新的 `updatedAt` 為準（last-write-wins）

#### S3 — 唯讀分享連結（LAN）
**說明**：在 S1/S2 的 Host HTTP server 基礎上，新增 `/share/:boardId` 路由，提供 E2 生成的靜態 HTML 快照。分享按鈕會複製局域網 URL（如 `http://192.168.1.5:12345/share/board-abc`）。

- **工作量**：1.5 人天
- **優先度**：🟢 低
- **依賴**：E2、S2
- **驗收標準**：複製 URL 後，在同網路手機瀏覽器可查看白板快照

---

### 跨平台

#### X1 — macOS 支援
**說明**：調整 Electron 設定、native API 差異，確保在 macOS 12+ 正常運作：
- `electron-builder` 設定：新增 `mac` target（DMG + ZIP）
- 選單列：macOS App 選單（About / Preferences / Quit 等標準項目）
- 快捷鍵：將 `Ctrl` 改為 `Meta`（macOS Command 鍵）
- 檔案路徑：`app.getPath('userData')` 在 macOS 為 `~/Library/Application Support/`
- `window.electronAPI.openInSystem`：macOS 使用 `shell.openPath`（已支援，無需修改）

- **工作量**：3 人天
- **優先度**：🟡 中
- **依賴**：P1
- **驗收標準**：macOS 上所有卡片類型可建立/編輯；快捷鍵正常；DMG 安裝包可在 macOS 12 安裝執行

#### X2 — Web 版本（PWA）
> 🔀 **2026-06-21 併入行動端計畫**：PWA 即手機端載體，見 [roadmap-mobile.md](roadmap-mobile.md) S0–S3。但定位調整為**「看全部 + 簡單編輯，不含畫布」**——手機不跑 tldraw，僅以清單渲染卡片。下方原「完整畫布 Web 版」描述僅供桌面瀏覽器情境參考。

**說明**：利用 P1 平台抽象層，將 App 發布為可在瀏覽器中執行的 PWA：
- 資料層：`platform/storage.ts` 在 Web 版切換為 `OPFS`（Origin Private File System）或 `IndexedDB` direct
- 檔案功能：使用 `File System Access API`（不支援時降級為下載/上傳）
- 安裝為 PWA：manifest.json + Service Worker（離線快取靜態資源）
- AI 功能：僅支援 OpenAI/Claude（瀏覽器無法連 localhost:11434）

- **工作量**：8 人天
- **優先度**：🟡 中
- **依賴**：P1；所有 `window.electronAPI` 呼叫已完全移入 `platform/`
- **驗收標準**：
  - `npm run dev` 在 Chrome 可建立/編輯/儲存白板
  - 刷新頁面後資料不遺失
  - 已安裝的 PWA 在無網路時可使用（靜態資源已快取）

---

### v1.4.0 完成標準

1. **平台抽象層**：`src/` 中無直接 `window.electronAPI` 呼叫（全部透過 `platform/`）
2. **資料可攜性**：JSON 完整匯出入、靜態 HTML 匯出三者通過驗收
3. **同步功能**：雲端備份（至少一個服務）或 LAN Sync 通過驗收（二選一）
4. **跨平台**：macOS DMG 可安裝執行，核心功能正常
5. **無迴歸**：Electron 版本既有功能全部正常

---

## v2.0.0 — Cosmos

### 版本目標

從「個人桌面白板」升級為「完整智慧知識系統」。本版本涵蓋架構級別的演進，包含外掛系統、多人協作、進階 AI 知識助理，以及移動端支援。工作量大，建議分多個 milestone 交付。

**預估工作量**：100–130 人天（約 5–6 個月）
**整體優先度**：🟡 中長期
**前置條件**：v1.3.0 + v1.4.0 全部完成

---

### 里程碑規劃

| Milestone | 名稱 | 核心交付 | 預估工作量 |
|-----------|------|---------|-----------|
| M1 | 外掛系統 | Plugin API + SDK | 20 人天 |
| M2 | 多人協作 | CRDT 即時同步 | 28 人天 |
| M3 | AI 知識助理 | RAG + 主動建議 | 22 人天 |
| M4 | 行動端 | iOS/Android App | 30 人天 |
| M5 | 自動化工作流 | 觸發-動作系統 | 20 人天 |
| M6 | 外部整合 | REST API + Webhook | 14 人天 |

---

### M1 — 外掛系統（Plugin API）

#### PL1 — Plugin API 設計與沙盒機制
**說明**：定義 `ScoutPlugin` interface，允許社群開發者擴充：
- 新卡片類型（實作 `PluginShapeUtil`，繼承 `CardShapeUtil`）
- 新側邊欄面板（`PluginPanel` React component）
- 新右鍵選單項目（`PluginContextMenuContributor`）
- 新 AI 工具（`PluginAITool`，掛入 AI-2 的輔助選單）

外掛以 **npm 套件**形式分發，安裝到 `userData/plugins/`，透過 Electron 動態 `require`（有限 API 沙盒，不可直接存取 IndexedDB）。

- **工作量**：15 人天
- **優先度**：🟡 中
- **依賴**：v1.2.0 A2（拆分後的 sub-hooks 才有穩定 API）
- **驗收標準**：
  - 一個範例外掛（如「Pomodoro 計時器卡片」）可透過 UI 安裝/移除
  - 外掛 crash 不影響主 App（沙盒隔離）
  - Plugin API 文件（`docs/plugin-api.md`）完整

#### PL2 — 外掛市集 UI
**說明**：在設定頁新增「外掛市集」標籤，從 GitHub Releases 或自訂 registry URL 抓取外掛清單（JSON 格式），顯示名稱/描述/評分，支援一鍵安裝。

- **工作量**：5 人天
- **優先度**：🟢 低
- **依賴**：PL1
- **驗收標準**：可從 registry 下載並安裝外掛，無需手動操作檔案系統

---

### M2 — 多人協作（CRDT）

#### CO1 — CRDT 資料層（Yjs 整合）
**說明**：引入 `Yjs` 作為底層 CRDT 引擎，將每個 `BoardRecord.snapshot` 的 shape 資料遷移至 `Y.Map`。每個 white board 對應一個 `Y.Doc`，shape 的增刪改轉為 Yjs op。

IndexedDB 持久化改用 `y-indexeddb` provider。

- **工作量**：12 人天
- **優先度**：🔴 高（本里程碑核心）
- **依賴**：v1.4.0 P1（平台抽象層）
- **驗收標準**：
  - 單人使用下，Yjs 版本與現有 tldraw snapshot 版本行為完全一致
  - Undo/redo 基於 Yjs history（行為不迴歸）
  - 資料遷移腳本：舊版 IndexedDB schema 自動升級，資料不遺失

#### CO2 — 即時協作（WebRTC/WebSocket）
**說明**：支援多人同時編輯同一白板：
- **WebRTC P2P**（局域網優先）：使用 `y-webrtc`，無需伺服器，適合家庭/小型團隊
- **WebSocket 中繼**（可選）：使用 `y-websocket` + 自架 `y-websocket-server`（Docker 一鍵部署）

UI：白板右上角顯示在線用戶頭像（隨機顏色），游標追蹤（顯示其他用戶游標位置與名稱）。

- **工作量**：10 人天
- **優先度**：🟡 中
- **依賴**：CO1
- **驗收標準**：
  - 兩台裝置同時開啟同一白板，一人新增卡片，另一人 < 1 秒內看到
  - 斷線重連後，離線期間的修改合併無衝突
  - 三人同時編輯不同卡片，無資料遺失

#### CO3 — 分享白板（唯讀連結 + 協作連結）
**說明**：擴充 v1.4.0 S3，支援：
- **唯讀連結**：URL 含 token，任何人可查看但無法編輯
- **協作連結**：URL 含 room ID，持有連結者可加入協作（可設密碼）
- **權限管理**：白板擁有者可撤銷連結、設定過期時間

- **工作量**：6 人天
- **優先度**：🟢 低
- **依賴**：CO2
- **驗收標準**：唯讀連結無法觸發任何編輯操作；協作連結密碼驗證正確

---

### M3 — AI 知識助理

#### AI-9 — RAG 個人知識庫
**說明**：在 v1.3.0 語意搜尋（AI-6）的基礎上，建立完整 RAG（Retrieval-Augmented Generation）流程：
1. 所有卡片文字定期建立向量索引（本機 `hnswlib-node` 或 `faiss-node`）
2. 新增**知識助理面板**（`Ctrl+Shift+A`）：自然語言問答界面
3. 問題輸入後，先從向量索引找最相關的 5–10 張卡片，再以 LLM 生成回答，並附上「資料來源」卡片連結

- **工作量**：10 人天
- **優先度**：🔴 高
- **依賴**：AI-6；向量資料庫套件（`hnswlib-node`）
- **驗收標準**：
  - 問「我上週做了什麼」，回答引用本週 Journal 卡片內容
  - 每個回答下方顯示 3 個以上「參考卡片」連結，點擊可跳轉

#### AI-10 — 主動建議（Proactive Insights）
**說明**：App 在背景分析使用者的知識庫，主動推送：
- **關聯建議**：「這張卡片與《XXX》白板有高度相關，要建立連結嗎？」
- **遺忘提醒**（間隔重複）：識別超過 14 天未查看的重要卡片，提醒複習
- **待辦逾期預警**：在任務中心現有逾期提醒基礎上，AI 預測「哪些待辦有逾期風險」

所有建議顯示為側邊欄鈴鐺通知，可接受/忽略/停用某類別。

- **工作量**：8 人天
- **優先度**：🟡 中
- **依賴**：AI-9；需後台排程（Electron `setInterval` 或 `node-cron`）
- **驗收標準**：後台建議每天最多推送 3 條，不騷擾；可在設定頁關閉各類別

#### AI-11 — 對話式白板建立
**說明**：在快速捕捉面板新增「對話模式」：
- 使用者輸入「幫我規劃下週的工作白板」
- AI 生成白板結構提案（包含 Frame 佈局、卡片類型和初始內容）
- 使用者確認後，一鍵建立整個白板（含所有卡片）

- **工作量**：4 人天
- **優先度**：🟢 低
- **依賴**：AI-9；C1 Kanban 卡片（AI 可能生成 Kanban 結構）
- **驗收標準**：輸入描述後，AI 生成的白板提案包含至少 3 種不同卡片類型；使用者確認後一鍵建立

---

### M4 — 行動端（iOS/Android）

> ❌ **2026-06-21 取消（自用定位）**：自用不需原生全功能客戶端。行動端改以 **PWA「看全部 + 簡單編輯」** 滿足，見 [roadmap-mobile.md](roadmap-mobile.md)。下方 React Native 規劃保留供未來「若要商業化原生體驗」時參考，非現行計畫。

#### MOB1 — React Native 版本（核心功能）
**說明**：以 React Native 重新實作行動端介面（不複用 tldraw，改用原生觸控手勢的輕量畫布）。核心功能：
- 查看白板（縮放/平移）
- 快速捕捉（語音/文字）
- 待辦卡片管理
- 推播通知（逾期提醒）

資料同步透過 v2.0.0 CO2 的 Yjs 協作通道。

- **工作量**：25 人天
- **優先度**：🟡 中
- **依賴**：CO1（Yjs 資料層）；v1.4.0 P1（平台抽象概念）
- **驗收標準**：
  - iOS/Android 可查看所有白板縮圖與卡片清單
  - 快速捕捉語音後，在桌面版收件匣出現新卡片（透過 Yjs 同步）
  - 推播通知在 App 背景時正常發送

#### MOB2 — 行動端編輯（進階）
**說明**：在 MOB1 基礎上補充行動端編輯能力：
- 文字卡片行動端編輯（簡化工具列，支援觸控鍵盤）
- 便利貼建立（長按白板空白區域）
- 圖片卡片（相機/相簿匯入）

- **工作量**：5 人天
- **優先度**：🟢 低
- **依賴**：MOB1
- **驗收標準**：行動端新增的文字/便利貼/圖片卡片在桌面版可見

---

### M5 — 自動化工作流

#### WF1 — 觸發-動作系統（Automations）
**說明**：新增自動化規則引擎，支援：
- **觸發條件**：卡片狀態改變 / 到期日到達 / 新卡片建立 / 特定標籤新增
- **動作**：移動至指定白板 / 建立新卡片 / 發送桌面通知 / 呼叫 Webhook / 執行 AI 操作
- 規則以視覺化 if-then 介面設定（非程式碼）

- **工作量**：15 人天
- **優先度**：🟡 中
- **依賴**：v1.2.0 A2（useBoardManager 提供穩定的 handler API）；appEvents.ts（事件匯流排）
- **驗收標準**：
  - 設定「待辦卡片到期時發送通知」規則，到期後確實觸發 Electron 通知
  - 設定「標籤 #archive 新增時移動至封存白板」，手動新增標籤後卡片移動

#### WF2 — 外部 Webhook 整合
**說明**：WF1 的動作支援呼叫外部 Webhook（如 Discord / Slack / 自訂 API），使用者在動作設定中輸入 URL 和 payload 模板（支援 `{card.title}`、`{board.name}` 等變數）。

- **工作量**：5 人天
- **優先度**：🟢 低
- **依賴**：WF1
- **驗收標準**：設定 Webhook 到 Discord Bot 後，卡片狀態改變時 Discord 收到通知

---

### M6 — 外部整合

#### INT1 — REST API
**說明**：在本機啟動 REST API server（port 可設定），提供：
- `GET /boards`、`GET /boards/:id`：讀取白板
- `POST /boards/:id/cards`：建立卡片
- `PUT /boards/:id/cards/:shapeId`：更新卡片
- Bearer token 認證（在設定頁生成 token）

供第三方工具（VS Code 擴充、Alfred workflow 等）整合。

- **工作量**：8 人天
- **優先度**：🟢 低
- **依賴**：CO1（Yjs 資料層穩定後才值得暴露 API）
- **驗收標準**：`curl -H "Authorization: Bearer <token>" localhost:9876/boards` 回傳正確 JSON

#### INT2 — 匯入外部來源
**說明**：支援從以下來源匯入卡片：
- Notion 頁面（透過 Notion API，使用者提供 token）
- Obsidian vault（掃描本機 .md 檔案資料夾）
- Roam Research JSON 格式

- **工作量**：6 人天
- **優先度**：🟢 低
- **依賴**：E1（JSON 匯入基礎）
- **驗收標準**：從 Obsidian vault 匯入 10 份 .md 後，文字卡片格式正確且雙向連結被識別

---

### v2.0.0 完成標準

1. **外掛系統**：至少 1 個範例外掛可透過 UI 安裝並正常運作（M1）
2. **多人協作**：2 人即時協作 < 1 秒延遲；斷線重連無資料遺失（M2）
3. **AI 知識助理**：RAG 問答能引用正確來源卡片（M3）
4. **行動端**：iOS/Android 核心功能（查看 + 快速捕捉 + 同步）通過驗收（M4）
5. **自動化**：至少 3 種觸發條件 + 3 種動作可組合使用（M5）
6. **無迴歸**：v1.x 的所有核心功能在 v2.0.0 下正常（全系統回歸測試）

---

## 功能依賴關係圖

```
v1.1.0（基準）
│
├─► v1.2.0 Stable Core
│    ├─ TD1 usePanelState ──────────────────────────► AI-1 (AI 設定面板)
│    ├─ TD2 useBoardManager 拆分 ─────────────────────► WF1 (自動化)、PL1 (外掛)
│    ├─ TD4 useBacklinks 增量 ────────────────────────► AI-6 (語意搜尋)
│    ├─ C1 Kanban 卡片 ───────────────────────────────► AI-11 (對話式建立)
│    └─ P1 平台抽象層（技術準備）─────────────────────► X1、X2、CO1、MOB1
│
├─► v1.3.0 Intelligence（需要 TD1+TD2）
│    ├─ AI-0 Provider 抽象 ──────────────────────────► 所有 AI 功能
│    ├─ AI-6 語意搜尋（embedding）───────────────────► AI-9 RAG、AI-8 KG 聚類
│    └─ AI-2/AI-3/AI-4（核心 AI 功能）
│
├─► v1.4.0 Connected（需要 P1）
│    ├─ E1 JSON 匯入 ─────────────────────────────────► INT2 外部匯入
│    ├─ E2 靜態 HTML ─────────────────────────────────► CO3 分享連結
│    ├─ S2 LAN Sync ──────────────────────────────────► S3 唯讀分享
│    └─ X2 Web PWA ───────────────────────────────────► MOB（概念準備）
│
└─► v2.0.0 Cosmos（需要 v1.3.0 + v1.4.0）
     ├─ M1 外掛系統 ─────────────────────────────────► 社群生態
     ├─ CO1 Yjs ──────────────────────────────────────► CO2、CO3、MOB1、INT1
     ├─ M3 RAG ──────────────────────────────────────► AI-10、AI-11
     └─ M4 行動端 ─────────────────────────────────────► WF2 Webhook（行動觸發）
```

---

## 技術風險評估

| 風險 | 影響版本 | 嚴重度 | 緩解策略 |
|------|---------|--------|---------|
| Ollama 使用者安裝率低 | v1.3.0 | 🟡 中 | 確保 AI 停用時 App 完整可用；Cloud AI provider 作為備選 |
| tldraw v3 → v4 破壞性升級 | v1.2.0+ | 🟡 中 | 鎖定 `tldraw@3.x`；升級時以 worktree 分支實驗 |
| Yjs 與 tldraw snapshot 整合複雜度 | v2.0.0 M2 | 🔴 高 | v2.0.0 M2 前建立 PoC；若複雜度過高改採 operational transform 或 snapshot merge |
| LAN Sync Last-Write-Wins 資料遺失 | v1.4.0 S2 | 🟡 中 | 同步前自動備份；衝突時通知使用者而非靜默覆蓋 |
| React Native 行動端工作量超標 | v2.0.0 M4 | 🔴 高 | 以「查看+捕捉」為 MVP，不含白板編輯；M4 最後排期 |
| Plugin 沙盒安全性（惡意外掛） | v2.0.0 M1 | 🟡 中 | 外掛僅能呼叫有限 Plugin API；無直接 DB/FS 存取；外掛市集人工審核 |

---

## 快速參考：版本工作量彙整

| 版本 | 類別 | 項目數 | 合計人天 |
|------|------|--------|---------|
| v1.2.0 | 技術債（A1–A6）| 6 | ~8 |
| | UX 改善（B1–B4）| 4 | 4 |
| | 新功能（C1–C4）| 4 | 10 |
| | **小計** | **14** | **~24–28** |
| v1.3.0 | AI 架構（AI-0/AI-1）| 2 | 4 |
| | 核心 AI（AI-2~AI-5）| 4 | 10 |
| | 進階 AI（AI-6~AI-8）| 3 | 12 |
| | **小計** | **9** | **~30–36** |
| v1.4.0 | 平台層（P1）| 1 | 3 |
| | 匯入匯出（E1/E2）| 2 | 6.5 |
| | 同步（S1~S3）| 3 | 14.5 |
| | 跨平台（X1/X2）| 2 | 11 |
| | **小計** | **8** | **~33–40** |
| v2.0.0 | M1 外掛 | 2 | 20 |
| | M2 協作 | 3 | 28 |
| | M3 AI 助理 | 3 | 22 |
| | M4 行動端 | 2 | 30 |
| | M5 自動化 | 2 | 20 |
| | M6 整合 | 2 | 14 |
| | **小計** | **14** | **~100–130** |
| **總計** | | **44** | **185–232 人天** |

---

*路線圖由 Scout Astrolabe 開發記錄（2026-05-31）自動生成，應定期依實際開發進度更新。*
