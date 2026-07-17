# Bug 追蹤索引

## 目的

維護已知 bug、設計決策、及待觀察問題的索引。詳細的原始掃描記錄與驗證報告見根目錄的 [BUGS.md](../../BUGS.md)。

## 適用範圍

本文件只記錄「尚未關閉」的問題，以及後續掃描中新發現的項目。已修且驗證通過的 bug 以根目錄 BUGS.md 為準。

## 相關檔案

- 根目錄 [BUGS.md](../../BUGS.md)：完整的初始掃描（20 項）與全面驗證報告（2026-05-07）

---

## 目前狀態摘要（截至 2026-07-15）

| 類別 | 數量 | 說明 |
|------|------|------|
| Critical | 0 | 全部修復（C1–C4） |
| Medium | 0 | 全部修復或列為設計決策（M1–M11） |
| Low | 0 | 全部修復（L1–L5） |
| 設計決策 | 1 | M9：軟刪白板時不逐一歸檔內部卡片 |
| 已修（部分）| 1 | P1-OOM：備份堆積導致 renderer OOM 白屏（備份已修，圖片治本 TD-IMG 已完成）|
| 已修 | 3 | TD-IMG：image 卡 base64 改存實體檔（astro-img protocol + 混合式遷移）；WO4：`[[]]` 補全按 Enter 無法選取；B-LINK：指向卡片的 `[[連結]]` 點了沒反應 |
| 待觀察 | 1 | WO1：link 卡片的 title / description / thumbnail 欄位從未填充 |

---

## 設計決策記錄

### M9：軟刪白板時不逐一歸檔卡片到 deletedCards

**現象**：將整個白板移到垃圾桶時，白板內的卡片不會出現在垃圾桶的「卡片」tab。

**決策**：目前行為為預期設計。使用者需還原整個白板才能取回其中的卡片。若需個別還原，未來可考慮在刪除白板時批次寫入 `deletedCards`。

**影響**：使用 `DeleteBoardDialog` 的「將卡片移到收件匣」選項可在刪板前先搶救卡片。

---

## 效能 / 記憶體問題

### P1-OOM：大型 vault 啟動白屏（renderer OOM）— 備份部分已修（2026-06-21）

**現象**：開啟沒多久整個螢幕白色、無限重載。`render-process-gone` 顯示 `reason:'oom'`（整個 renderer 程序被殺，非 JS 例外，故 ErrorBoundary 抓不到）。

**診斷**：使用者 466 張卡、IndexedDB 達 2.7GB；`http_localhost.indexeddb.blob` 3.1GB、`.leveldb` 僅 1MB；blob 為多份 ~63MB 等大檔。現用資料其實只 ~63MB，元兇是 `saveAutoBackup` 每份備份複製「全 vault 含 base64 圖片」且保留 30 份（`MAX_BACKUPS=30`）。使用者機器僅 7.9GB RAM。

**已修（commit cf105dc）**：
- `MAX_BACKUPS` 30→5；新增 `trimBackups()`（只刪 key 不載 blob）；`useBoardManager` 啟動載入後、render 前先 trim
- `main.js` 拉高 V8 heap（`--max-old-space-size=4096`）止血
- 縮圖改大板跳過/小板節流（commit f9673bc）；根節點 ErrorBoundary + 全域錯誤浮層（commit c33e84c）

**現況**：使用者另把卡片分散到子白板，單板負載降低後暫時不再白屏（治標）。

**備註**：IndexedDB blob 延遲回收，trim 後磁碟空間不會立即釋放。

---

### TD-IMG：image 卡 base64 改存實體檔（已完成，2026-07-04）

**問題**：`image` 卡把圖片以 base64 存在 board snapshot 內 → 載入/渲染/備份都吃滿記憶體與體積；是 P1-OOM 的深層病根。base64 會擴散到 `boards` snapshot、`backups`（複製全 vault ×5）、`deletedCards` 四處。

**治本做法（已實作）**：
- **渲染**：新增自訂 protocol `astro-img://<storedName>`（`main.js` `protocol.handle` 串流 `userData/files`，basename 淨化防穿越），Chromium 直接讀檔、不進 JS heap，畫布 culling 時自動釋放。
- **儲存**：新增 `save-image` IPC（bytes→storedName）；建立 image 卡改走 `src/platform/imageStore.ts`（薄接縫，roadmap S0(a) 首個落地），snapshot 只存 `storedName`、`image:null`。渲染統一走 `getImageSrc`（storedName 優先、否則 fallback 舊 base64，向後相容）。
- **遷移（混合式）**：`src/hooks/useImageMigration.ts` 背景 idle 逐板遷移（跳過 active 板、冪等、可中斷續傳），遷移期間暫停 autoBackup、全部遷完做一次乾淨備份＋trim；BackupPanel 另有「立即遷移」手動鈕。
- **清理**：image 卡永久刪除/過期時比照 file 卡刪實體檔。

**驗證**：`npm run build` exit 0；vitest 254 全綠（新增 imageMigration/getImageSrc 純函式測試）；run-desktop 啟動畫面正常、log 無 render-process-gone。

**狀態**：已完成
**最後更新**：2026-07-04

---

## 已修（本次）

### ~~B-LINK：指向「卡片」的 `[[連結]]` 點了沒反應~~ ✅ 已修（2026-07-15）

- **位置**：`WhiteboardTools.tsx:248`（`jump-to-card` 的 `targetName` 分支）
- **現象**：`[[X]]` 只在 X 是**白板名**時會跳轉；X 是**卡片名**時點擊**完全沒反應**（靜默失敗，連提示都沒有）。
- **實測**：dogfooding vault 的真實連結 `卡片綁死單一白板 → [[Heptabase]]`（Heptabase 是卡片、非白板），
  以 CDP 點擊該 wikilink → 畫面不動、仍停在原板。
- **根因**：
  ```js
  const target = boards.find(b => b.name.toLowerCase() === targetName.toLowerCase())
  if (target) onSwitchBoard(target.id)
  return   // ← 找不到白板就直接 return，從不嘗試解析成卡片
  ```
- **同一個 `[[X]]` 在三處語意不一致**（這是病灶本身）：

  | 位置 | `[[X]]` 解析成 |
  |---|---|
  | 知識圖譜 `knowledgeGraph.ts:111` | 白板**或**卡片（`boardByName.get(tl) ?? cardByName.get(tl)?.[0]`）|
  | 實際跳轉 `WhiteboardTools.tsx:248` | **只有白板** |
  | 補全選單 `Whiteboard.tsx:65` | **只提示白板名** |

- **影響**：使用者無法連到卡片，只能連到白板。**可能是「20 節點只有 3 連結」的真正原因**
  ——不是不想連，是連了也沒用。
- **修法（已實作）**：
  - `useBacklinks` 的 `BoardCache` 新增 `cards`，merge 出 `cardIndex`（`cardName.toLowerCase() → CardTarget[]`），
    走既有的 board-level 增量失效，**不需要新機制**。
  - `scanBoard` 順手把**每張卡的 stripHtml 從 1~2 次收斂成恰好 1 次**（原本 `extractLinks` 一次、
    `preview` 再一次），名稱／連結／preview 共用同一份純文字。卡片索引在 `links.length === 0` 的
    early-return **之前**收集——沒有 `[[連結]]` 的卡正是要能被跳到的目標。
  - 新增純函式 `utils/cardLinks.ts`：`resolveLinkTarget`（白板優先、再卡片，與 `knowledgeGraph.ts:111` 同規則）
    ／`buildLinkTargets`／`filterLinkTargets`／`groupLinkTargets`（+18 測試）。
  - `WhiteboardTools` 的 `targetName` 分支改用 `resolveLinkTarget`，解析到卡片後**複用既有的
    `{boardId, shapeId, x, y}` 跳轉路徑**（`:253-260`）。
  - 補全選單納入卡片名並分組顯示（🗂️ 白板／📝 卡片），比照 `/` 選單的 `groupSlashCommands`。
- **⚠️ 眼驗才抓到的坑**：補全的顯示上限原本是**共用一個總額 8**，實測 **7 個白板就把額度吃光、
  一張卡片名都出不來**。改為**分組各自配額**（白板 5／卡片 8）。單元測試沒抓到——它測的是
  「limit 有沒有生效」這種抽象性質，不是真實的板數配置。
- **驗證**：CDP 實測——修改前點 `[[Heptabase]]` 毫無反應，修改後跳到競品參考板並定位到該卡；
  `[[` 顯示白板／卡片兩組；`[[Hep` 過濾出 Heptabase 且白板不亂入。413 測試全綠、build exit 0、ESLint 0 errors。
- **與 N6 的關係**：本修法建立的 `cardIndex` 正是 N6 需要的索引；stripHtml 收斂成一次後，
  N6 要的純文字也只差快取一份。詳見 [n6-performance-2026-07-15.md](n6-performance-2026-07-15.md)。
  **⚠️ 2026-07-17 更新：N6 已結案（階段 2/3 不做）**，`cardIndex` 不再是為 N6 鋪路——
  它現在的用途就是本修法本身（`[[卡片名]]` 的解析與補全），**是既有功能的一部分，不是預留的死碼**。
- **狀態**：✅ 已修並眼驗
- **最後更新**：2026-07-15

---

## 待觀察問題

### WO1：link 卡片的 title / description / thumbnail 欄位從未填充

- 位置：`CardShape.ts` TLCardProps
- 現象：介面定義了 `title?`、`description?`、`thumbnail?`，但程式碼中無任何自動抓取邏輯
- 影響：這三個欄位目前恆為 undefined
- 待確認：是否為廢棄的計劃功能，或有外部填充邏輯尚未找到

### ~~WO2：CalendarView / JournalDayView 無掛載點~~ ✅ 已解決（2026-06-20）

- 位置：`src/CalendarView.tsx`、`src/JournalDayView.tsx`
- 現象：standalone 全螢幕版存在但無任何引用（`ReviewCenter` 只用內嵌 `*Content`）
- 結論：確認為孤兒，已刪除 standalone 包裝（保留 Content 版）；連同孤兒 `useFileStorage.ts` 一併刪除（roadmap-v2 A5 / TD7）

### ~~WO3：stripHtml 函式有多個不同實作~~ ✅ 已解決（2026-06-20）

- 位置：實為 7 處（`SearchPanel`、`useBacklinks`、`DeleteBoardDialog`、`exportMarkdown`、`CardLibrary`、`FilterPanel`、`Dashboard`）
- 結論：統一至 `src/utils/stringUtils.ts`，修正行內標籤誤插空格的 CJK bug（roadmap-v2 A4 / TD5）

### ~~WO4：`[[]]` 補全按 Enter 無法選取~~ ✅ 已修（2026-07-15）

**發現**：2026-07-15 實作 `/` 選單（階段 1）時發現，**同日以 CDP 實測確認並修復**。

**位置**：`TextContent.tsx` 的 `handleEditorKeyDown`（掛在外層 div 的 React `onKeyDown`，委派在 root 的
**bubble 階段**），而 ProseMirror 的 listener 直接掛在 contenteditable 上（**target 階段**）。

**實測結果（CDP，非推論）**：**只有 Enter 壞，Tab 與方向鍵都正常。**

| 鍵 | 結果 | 原因 |
|----|------|------|
| **Enter** | ❌ 段落被切開、補全**完全沒套用**、`[[技` 原樣留在文字裡、浮層關閉 | PM 的 listener 在 target 階段就把 Enter 轉成 `splitBlock` transaction **送出**；`preventDefault()` 救不回已 dispatch 的 transaction |
| Tab | ✅ 正常插入 | 焦點轉移是瀏覽器**預設動作**，預設動作在傳播結束後才跑 → bubble 階段 `preventDefault()` 仍攔得掉 |
| ↑／↓ | ✅ 正常改索引、游標不動 | 同上，游標移動也是預設動作 |

**兩個原本的推測都被實測推翻**：
1. ~~「方向鍵可能同時移動游標又改選單索引」~~ → 方向鍵完全正常。
2. ~~「`deleteRange` 跨過段落斷點可能「剛好」得到近似正確的結果，掩蓋問題」~~ → 沒有被掩蓋，
   補全**根本沒執行**：PM 切段落後 `selectionUpdate` 先觸發，`textBefore` 變成 `[[技\n`
   （`\n` 不是 `]`，正則仍匹配但 query 變成 `技\n`）→ 比對不到白板 → `setSuggest(null)`；
   等 React 的 `onKeyDown` 收到時 `suggest` 已是 null，直接 return。

**修法**：新增 `suggestKeyRef` 併進 `editorProps.handleKeyDown`
（`slashKeyRef.current(event) || suggestKeyRef.current(event)`），移除 React `onKeyDown` 路徑。
比照 `/` 選單，機制詳見 [rich-text-editor.md](../rich-text-editor.md)。

**驗證**：CDP 實測四項全過——Enter 正確插入 `[[技術債]]` 且不切段落；ArrowDown 後 Tab 插入索引 1 的項目
（證明方向鍵與 Tab 未退化）。395 單元測試全綠、`npm run build` exit 0。

**Esc 行為：完全沒變**（實測 2026-07-15）。修復當下曾誤以為「Esc 從此只關浮層、不再退出編輯模式」，
**實測推翻**：Esc 關掉浮層後**仍然退出編輯模式**，與修復前一致。

原因是同一個陷阱的又一次現形：**PM 的 `handleKeyDown` 回傳 `true` 只會 `preventDefault()`，不會 `stopPropagation()`**
——它擋的是「瀏覽器的預設動作」，擋不住事件繼續往上冒。Esc 照樣冒到 tldraw 的容器被吃掉並退出編輯模式。
「回傳 true ＝ 攔下」只在 PM 自己的範圍內成立，對**外層的 listener 無效**。

> 附帶觀察（既有小瑕疵，非本次造成）：浮層底部提示「Esc 關閉」，但 Esc 實際上連編輯器一起關掉。
> 若要讓 Esc 只關浮層，得在 capture 階段攔（比照 `CardShapeUtil.tsx` 的 `handleEscape` 用
> `addEventListener(..., true)` 搶在前面）——目前刻意不做，見「維護注意事項」。

**踩坑筆記（給下次驅動 App 實測的人）**：前兩次實測失敗都是**腳本自身**的錯，不是 App——
Escape 先關掉編輯模式、選擇器抓錯卡片。這次的作法：先 `[data-shape-type="card"]` 傾印卡片座標再用明確座標雙擊；
雙擊前先點空白處清掉選取（殘留選取會讓雙擊行為不同）；全程不用 Escape。

---

## 新增 Bug 格式範本

```markdown
### [嚴重度][流水號] — 簡短標題
- 位置：`檔案.ts:行號`（函式名）
- 現象：（使用者可觀察到的行為）
- 根因：（技術原因）
- 影響範圍：（哪些使用者 / 操作路徑）
- 建議修法：
- 狀態：待修 / 修復中 / 已修 / 設計決策
- 最後更新：YYYY-MM-DD
```

---

## 維護注意事項

- 每次修復 bug 後，在根目錄 BUGS.md 補上「已修」標記與確認點，並更新本文件的摘要數字。
- 「設計決策」類別的項目不算 bug，但需在此記錄以避免未來重複提出。
- `WO` 開頭（Watching）的項目表示已知的疑問，尚未確認是否為 bug。

## 外部參考

- 根目錄 [BUGS.md](../../BUGS.md)
