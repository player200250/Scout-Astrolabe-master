# Bug 追蹤索引

## 目的

維護已知 bug、設計決策、及待觀察問題的索引。詳細的原始掃描記錄與驗證報告見根目錄的 [BUGS.md](../../BUGS.md)。

## 適用範圍

本文件只記錄「尚未關閉」的問題，以及後續掃描中新發現的項目。已修且驗證通過的 bug 以根目錄 BUGS.md 為準。

## 相關檔案

- 根目錄 [BUGS.md](../../BUGS.md)：完整的初始掃描（20 項）與全面驗證報告（2026-05-07）

---

## 目前狀態摘要（截至 2026-09-20）

| 類別 | 數量 | 說明 |
|------|------|------|
| Critical | 0 | 全部修復（C1–C4） |
| Medium | 0 | 全部修復或列為設計決策（M1–M11） |
| Low | 0 | 全部修復（L1–L5） |
| 設計決策 | 1 | M9：軟刪白板時不逐一歸檔內部卡片 |
| 已修（部分）| 1 | P1-OOM：備份堆積導致 renderer OOM 白屏（備份已修，圖片治本 TD-IMG 已完成）|
| 已修 | 7 | TD-IMG：image 卡 base64 改存實體檔（astro-img protocol + 混合式遷移）；WO4：`[[]]` 補全按 Enter 無法選取；B-LINK：指向卡片的 `[[連結]]` 點了沒反應；B-DUP：批次刪除白板只刪掉最後一塊＋「清理重複」對序號副本無效（2026-07-30）；B-JRNL：「開啟今日日記」落在月曆分頁（2026-07-30）；WO1：link 卡三欄位從未填充（實為早已實作，2026-08-29 核實結案）；B-PREV：關 App 時的圖片預覽／編輯狀態會在重開後復活（2026-08-29）|
| 待修 | 1 | RC9（週回顧空殼卡）——**根因已確認**，修法明確 |
| 待觀察 | 0 | 無 |

2026-09-29 一天內修完並 commit 的復盤中心項目：
- `58cd34a` 月曆長待辦撐破格線（grid item 少了 `minWidth: 0`）
- `fe3d3de` 日檢視改為單日時間軸、日記退出日曆主區域（刪除 `DayAgenda.tsx`、檢視列收成日／週／月／年）
- `15aa5e2` 月／年檢視改週一起頭 ＋ 切檢視不再丟失選取日期
- `1486d0c` RC4／RC5／RC6
- `75a2716` RC7（空白週一鍵記為「沒有產出」）

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

### ~~B-JRNL：儀表板「開啟今日日記 →」打開復盤中心後停在月曆分頁~~ ✅ 已修（2026-07-30）

- **現象**：按鈕名稱承諾「今日日記」，實際落在**月曆**分頁，要自己再點一次。
- **根因**：`ReviewCenter` 的分頁是內部 state 且寫死起始值（`useState<ReviewTab>('calendar')`），
  呼叫端無從指定；`Dashboard` 的按鈕與側邊欄／`Ctrl+Shift+C`／命令面板走的是同一個
  `onOpenReviewCenter`，四個入口沒有任何差別。
- **修法**：`ReviewCenter` 新增 `initialTab?: ReviewTab`（預設 `'calendar'`，型別改成 export）；
  `App` 以 `reviewTab` state 決定，儀表板按鈕改走新的 `onOpenTodayJournal`。
  順帶移除 `Dashboard`／`Whiteboard` 上已無使用者的 `onOpenReviewCenter`
  （A5(a) 拿掉冗餘捷徑卡之後，那條 prop 只剩這顆按鈕在用）。
- **⚠️ 關鍵細節：分頁要在面板「關閉」時還原成月曆，不能在各個開啟點各自設定。**
  開啟點有四個，其中側邊欄那個直接呼叫 `usePanelState.openPanel`、碰不到 `App` 的 state；
  而關閉路徑一律會讓 `panels.reviewCenter` 變 `false`，掛在那裡才涵蓋得完。
  沒做這件事的話，開過一次日記頁之後，從側邊欄進去也會停在日記頁。
- **驗證**：CDP 實測三輪——日記鈕 → `✍️ 今日日記`；`Ctrl+Shift+C` → `📅 月曆`（未被污染）；
  再點日記鈕 → `✍️ 今日日記`（可重複）。並確認開啟日記頁**不會**替當天生出空日記卡
  （日誌板 `updatedAt` 未變）。

### ~~B-DUP：批次刪除白板只刪掉最後一塊；「🧹 清理重複」對它的目標案例完全無效~~ ✅ 已修（2026-07-30）

三個互相獨立、但疊在同一條路徑上的問題。**共同症狀是「刪除動作靜默地只做了一部分」**，
使用者不會收到任何錯誤，只會覺得「我明明選了 5 塊」。

- **B-DUP-1：批次刪除只生效一塊**（最嚴重）
  - **位置**：`App.tsx` 的 `deletingBoardId: string | null`；呼叫端 `BoardOverview.deleteSelected()` 與「🧹 清理重複」都跑 `forEach(id => onDelete(id))`。
  - **根因**：`onDelete` ＝ `setDeletingBoardId(id)`，**單一值 state**。迴圈連設 N 次，只有最後一次留下 → 確認對話框只認得最後一塊板，其餘**靜默不刪**。
  - **修法**：state 改 `deletingBoardIds: string[]`，`DeleteBoardDialog` 的 `board` prop 改 `boards`（標題改講數量並列出每塊板名、卡片數改跨板合計）。

- **B-DUP-2：`moveToInbox` 在批次時互相覆蓋**（改批次時才會踩到，先一步擋掉）
  - **根因**：`handleSoftDeleteBoardWithInboxMove` 從 `boards` closure 讀收件匣 snapshot。同一個 tick 內連呼叫，第二次讀到的仍是還沒被追加過的舊 snapshot → 後者覆蓋前者，**只有最後一塊板的卡片真的進收件匣**。
  - **修法**：改成 `handleSoftDeleteBoardsWithInboxMove(ids[], moveToInbox)`，收件匣合併在一次走訪內完成、只存一次。單板版是它的特例（原單板 API 已移除，無其他呼叫端）。

- **B-DUP-3：「🧹 清理重複」對「為之而生」的案例是 no-op**
  - **根因**：舊邏輯用**完整名稱**分組，但重複白板天生就不同名——`uniqueName()` 會補「 (2)」「 (3)」。D1 主頁畫布搬遷產生的 `主頁白板` / `主頁白板 (2)` / `主頁白板 (3)` 因此永遠分不到同一組。
  - **另兩個附帶缺陷**：一組全空時 `empties` ＝整組，會**一塊都不留**；`!b.snapshot` 判空會漏掉「有 snapshot 但 0 個 shape」的板。
  - **修法**：抽成純函式 `utils/duplicateBoards.ts`（`baseBoardName` / `boardHasContent` / `findDuplicateBoards`），改比對去掉序號的**基底名**、實際數 shape、每組必留一塊，並排除資料夾／主頁／收件匣／已在垃圾桶的板，以及有子白板指著的空板。
  - **抽到 `utils/` 而非留在元件檔**：元件檔匯出純函式會踩 `react-refresh/only-export-components`（見 2026-07-29 的 CI lint 修復）。

- **驗證**：+21 測試（`duplicateBoards.test.ts` 16 案例、`DeleteBoardDialog.test.tsx` 批次 4 案例、`useBoardManager.test.ts` 批次併入 Inbox 1 案例）共 674 綠；真實 App 以 CDP 驗過多選 2/3 塊時對話框列出全部板名與跨板卡片數合計，取消後 IndexedDB 無變動。

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

### B-PREV：關 App 時開著的圖片預覽，重開後原樣復活擋住整個畫面 — 已修（2026-08-29）

**現象**：啟動 App 就卡在全螢幕圖片遮罩（下載／新分頁／關閉那層），沒點過任何東西。
關掉一層之後可能還有下一層（不同的卡）。**這是啟動時眼驗抓到的，不是使用者回報。**

**根因**：全螢幕預覽由 `p.preview` 驅動，而它是**卡片的持久化 prop**——
`CardShapeUtil.onDoubleClick` 用 `updateShape({ props: { preview: true } })` 打開它，
於是這個「使用者此刻正在看圖」的瞬時狀態被寫進 snapshot、跟著自動存檔進 IndexedDB，
下次載入原樣復活。`state: 'editing'` 同一條線
（`isEditing = editor.getEditingShapeId() === shape.id || p.state === 'editing'`）。

`sanitizeCardProps` 擋不住：它只補**缺漏／undefined** 的欄位，`preview: true` 是個有效值。

**第二層**（第一次修完仍復發才發現）：清乾淨本機後重開，**遮罩換了一張圖又出現**。
雲端那份 snapshot 也帶著髒旗標（另一台裝置或先前的自己推上去的），
拉回來／三方合併後**直接寫 db**（刻意不走 `saveBoard`，避免推回去無窮迴圈），
繞過啟動時的 `sanitizeBoards` ⇒ 遮罩會「從雲端長回來」。

**修法**（兩處，`EPHEMERAL_CARD_PROPS = { state: 'idle', preview: false }` 為單一事實來源）：
1. `sanitizeCardProps` 加一輪**無條件覆寫**（不是補缺漏），涵蓋啟動清理與「卡片存進垃圾桶」兩條路
2. `boardSync.fromRemoteRow` 呼叫新的 `resetEphemeralCardProps(snapshot)`——
   那是雲端資料進入本機的**唯一**入口（拉取／合併／「立即載入」三條路都經過它）

**驗證**（CDP 實測，非推論）：雙擊圖片卡開預覽 → 等自動存檔 → 查 IndexedDB 確認
`preview: true` 真的寫進去了 → 關掉 App → 重開 → **遮罩 0 層、DB 無髒旗標**。
單元測試 +10（`snapshot.test.ts` 9 案、`boardSync.test.ts` 1 案），842 全綠、`tsc -b` 0。

**留下的設計問題（未做）**：`preview` 本來就不該是持久化 prop，正解是移進 component state。
沒動是因為它同時被右鍵選單等處以 `updateShape` 操作，改動面比這次的歸位大得多；
現在的作法是「髒了就在邊界歸位」，成本低且兩條入口都堵住了。

---

## 復盤中心 UI（2026-08-30 回報，2026-09-20 三項全修完）

使用者 2026-08-30 回報「復盤中心的 UI 介面有問題需要調整」，三項都經他確認。
**三項都已於 2026-09-20 修復並實測驗證。**
以下診斷都是用 CDP 對真實 App 量到的數字，不是推論。

### ~~RC1：長日記時日期列／工具列消失、內容從中間開始~~ ✅ 已修（2026-09-20）

- **位置**：`src/JournalDayView.tsx:187`（編輯器容器）＋ `src/ReviewCenter.tsx:77`（body）
- **現象**：打開內容較長的日記時，上方日期導覽（← 2026年8月29日 →）與工具列（B I U H2）整排被捲走，
  內容從句子中間開始。
- **根因（2026-09-20 用 CDP 量到整條祖先鏈才確定，與 8/30 的推測只對了一半）**：
  `FullscreenPanel` 的內容格（`FullscreenPanel.tsx:73`）是 **block** 容器＋`overflowY:auto`、高度 913px。
  `ReviewCenter` 的 body 寫的是 `flex:1`——**但父層是 block，`flex:1` 在這裡完全不生效**，
  body 的高度於是由內容決定（實測 1719px），連帶編輯器容器 `flex:1 + overflowY:auto` 的
  computed `min-height` 是 `auto`、也不會縮（1645px）。
  ⇒ 三層都比視窗高，**真正在捲的是面板最外層那格**，日期列與工具列是它的子孫、於是一起被捲走。
  8/30 記的「`min-height:auto` 陷阱」是對的，但少了前半段：**body 根本沒有拿到高度**，
  只補編輯器的 `minHeight:0` 不夠。
- **量測（8/29 那篇 3198 字的日記，視窗高 967）**：

  | 層 | overflow | clientHeight | scrollHeight |
  |---|---|---|---|
  | `.ProseMirror` | visible | 1563 | 1563 |
  | 編輯器容器 | auto | 1645 | 1645 |
  | ReviewCenter body | hidden | 1719 | 1719 |
  | FullscreenPanel 內容格 | **auto** | **913** | **1719** ← 實際捲的是這層（滾輪實測 scrollTop 0 → 400）|

- **修法**：body 補 `height:'100%'` ＋ `minHeight:0`（把父層那格的固定高度接下來），
  編輯器容器補 `minHeight:0`。**兩處都要**，只改一邊都無效。
- **驗證（修後實測）**：編輯器容器 840/1645（自己捲，滾輪 scrollTop → 700），
  body 與面板格皆 913/913＝不再外溢；捲到底時日期列 `top` 固定 66、工具列固定 106。
  月曆／週回顧兩個分頁一併截圖回歸，版面正常（兩者的根容器本來就是 `flex:1 + overflow:hidden`，
  本來就假設外層有固定高度——這也反證了「body 少給高度」才是病根）。
- **順帶**：`npm run build` exit 0、`npm test` 882 全綠。

### ~~RC2：內容欄太窄、兩側留白過多~~ ✅ 已修（2026-09-20）

- **位置**：`ReviewCenter.tsx`（週回顧分頁外層）、`WeeklyReview.tsx`
- **現象**：1920 寬的視窗下，週回顧鎖在中間 440px 的窄欄，兩側大片空白。
- **順便查出來的更大缺漏**：那一頁**根本看不到週回顧卡的內容**——只有「本週統計」加一顆
  「前往 Journal 白板」，寫好的週回顧得自己去畫布上找；而且永遠只有「本週」，翻不到上一週。
- **修法**（使用者選的做法）：拿掉 `maxWidth:440` 的居中包裝，改成
  **左統計 420px ＋ 右回顧卡內文**兩欄；內文用新的 `components/review/JournalCardEditor`
  直接讀寫該週的卡（與日記共用同一支 `onSaveJournal`，週的 key 是 `week-YYYY-WW`）。
  另加「← 上一週／下一週 →／本週」導覽，統計跟著所選的週重算。
- **驗證**：翻到第 36／37 週載入的是對應的卡；翻到沒有卡的第 39 週出現空模板，
  在面板裡打字 2.2 秒後 IndexedDB 出現 `shape:jd_week202639_*`（測試卡已刪除還原）。
- **順手移除**：檔尾那個 320px 的 standalone `WeeklyReview` 側邊面板**全專案沒有人 import**
  （孤兒，同 WO2），一併刪掉，只留 Content 版。

### ~~RC3：月曆格子擠、文字被截斷~~ ✅ 已修（2026-09-20）

- **位置**：`CalendarView.tsx` → 現在是 `components/calendar/MonthGrid.tsx`
- **真兇不是格子太窄，是雙重截斷**：chip 先 `t.text.slice(0, 12)` 硬切 12 字，
  外層又有 `textOverflow: ellipsis`。**不管格子多寬都只剩半句**。
- **修法**（使用者選的做法）：
  1. 拿掉 `slice(0, 12)`，讓 CSS 省略號負責到格寬為止；
  2. 每格最多顯示 **2 條**標題，其餘改成**密度點**（未完成紅、已完成灰，hover 出完整清單）；
  3. 版面比例翻轉——月曆吃剩餘寬度、右側 agenda 固定 380px（原本是月曆 40%／agenda 60%，
     密的那一半被擠、空的那一半浪費）。
- **驗證**：9/03 那格的「❌ 失敗｜武器 icon 12 顆上色 ＋ 稀有度分級底板（6h）」現在整句看得到。

---

### ~~RC4：還沒有日記的日子，右上角照樣顯示綠色「已儲存」~~ ✅ 已修（2026-09-29）

- **位置**：`src/JournalDayView.tsx:48`（`saveStatus` 的 useState 初值）
- **現象**：一進「今日日記」分頁，右上角就是綠色「已儲存」，但那天其實一張日記卡都還沒建立——
  同一時間月曆右欄寫的是「尚無日記，點擊建立」。週回顧分頁同樣症狀。
- **根因**：`useState<'saved' | 'saving' | 'pending'>('saved')` 初值直接給 `'saved'`，
  而 `statusText`（:104）只看這個值，不看「到底有沒有對應的 shape」。
- **影響範圍**：每天第一次打開日記的人，會以為東西已經存了。
- **建議修法**：初值改成能表達「尚未存過」的狀態（多一個 `'none'`，或讓狀態列在 `shapeId == null` 時不顯示）。
- **狀態**：✅ 已修（2026-09-29，commit `1486d0c`）
- **最後更新**：2026-09-29

### ~~RC5：週／日檢視的白板活動只印分鐘，`15 · 日誌` 會被讀成 15 點~~ ✅ 已修（2026-09-29）

- **位置**：`src/components/calendar/TimeGrid.tsx:97`
- **現象**：14:00 那一列出現「15 · 日誌」「16 · 作品集·求職」「18 · 星塵拾荒者」，
  看起來像 15、16、18 點的三筆，實際上是 14:15／14:16／14:18。
- **根因**：`{String(a.minute).padStart(2,'0')} · {a.boardName}` 只印分鐘；靠「它在第幾列」表達小時，
  但三筆堆在同一格時那個線索就不夠了。（`title` 屬性有完整時刻，但要 hover 才看得到。）
- **影響範圍**：只影響判讀，不影響資料。
- **建議修法**：改印 `HH:mm`（`a.hour` 已經在資料裡，`DayAgenda` 被刪掉前就是這樣印的）。
- **狀態**：✅ 已修（2026-09-29，commit `1486d0c`）
- **最後更新**：2026-09-29

### ~~RC6：右側議程欄的待辦列，長文字與來源標籤擠在同一行~~ ✅ 已修（2026-09-29）

- **位置**：`src/components/calendar/AgendaPanel.tsx`（待辦區塊）
- **現象**：380px 寬的右欄裡，一行要塞下勾選框＋待辦全文＋來源白板的 chip，
  長待辦被壓到幾乎貼著邊緣（實測畫面：`❌ 失敗｜武器 icon 12 顆上色 ＋ 稀…` ＋「🎨 作品集·求職」）。
- **根因**：單行 flex，沒有換行或截斷策略。
- **影響範圍**：右欄在所有檢視都常駐（2026-09-29 起），所以天天看得到。
- **建議修法**：來源 chip 換到第二行，或給文字 `minWidth: 0` ＋ 省略號並用 `title` 補全文
  （與 `TodoChip` 同一套做法，見 `components/calendar/primitives.tsx`）。
- **狀態**：✅ 已修（2026-09-29，commit `1486d0c`）
- **最後更新**：2026-09-29

### ~~RC7：週回顧的空狀態三張卡全 0，資訊量太低~~ ✅ 已處理（2026-09-29）

- **位置**：`src/WeeklyReview.tsx`（`statCard` 區塊）
- **現象**：沒有活動的那一週，「有活動的卡片 0／完成待辦 0／知識連結 0」三張卡並排，
  加上一句「這週尚無活動」，佔掉整個左欄卻沒說任何事。
- **根因**：不是 bug，是空狀態沒有單獨設計——統計卡直接照常渲染 0。
- **影響範圍**：週初、或整週沒開工時（例如 8/31–9/19 那三週）每次打開都是這個畫面。
- **建議修法**：**先決定空狀態要給使用者看什麼**（上一週的數字？最近一次有活動的週？直接給「開始寫本週回顧」的入口？），
  再動手。屬於設計題，不是照著改就好的那種。
- **決定**（使用者 2026-09-29 選的方向）：不是換掉統計卡，而是給一個動作——
  統計全 0 且卡片還沒被動過時，出現「記為：這週沒有產出」按鈕，一按就寫入並結案。
  理由來自使用者自己的資料：第 36／37 週同樣沒產出，但卡片沒留空，內容是
  「沒有任何產出紀錄。無 commit」——**空白的一週本身就是值得記下的事實**。
  被否決的方向：甲（顯示上次有紀錄那週）太多餘、乙（提醒去寫）「太忙還是會忘記」。
- **狀態**：✅ 已修（2026-09-29，commit `75a2716`）
- **最後更新**：2026-09-29

---

### ~~RC8：週回顧左欄加「最近 8 週」迷你走勢圖（功能，非 bug）~~ ✅ 已做（2026-09-29）

- **位置**：`src/WeeklyReview.tsx` 左欄（固定 420px）
- **要做什麼**：在週導覽（← 第 N 週 →）的正下方、統計卡的上方，放一排 8 根柱子代表最近 8 週的活動量，
  柱子可點，點了跳到那一週。
- **為什麼放那裡**（2026-09-29 與使用者討論後定的）：
  1. 它的本質是**導覽**不是統計——現在要翻到第 33 週得按 ← 六次，八根柱子等於 ← → 的視覺化版本
  2. 它要**常駐**；RC7 的按鈕只在空白週出現，兩者放同一層會打架，所以丙 在統計卡上方
  3. 斷層一眼可見——34–37 那四週（兩週空殼、兩週「沒有產出」）會是連續四根矮柱
- **版面**：420px 放 8 根柱子綽綽有餘，高度約 40px，不會把統計卡擠下去。
- **資料來源**：`computeWeekStats` 已經算得出單週數字，走勢只是對最近 8 週各跑一次。
- **實作**：`recentWeekStarts(anchor, count)` 抽到 `utils/weeklyReviewUtils.ts`（純函式，含跨年測試），
  視窗跟著 anchor 移動＝最右邊永遠是正在看的那一週，點柱子即跳週。
  柱高 `3 + (totalCards / 該視窗最大值) * 27`，0 活動的週留 3px 基線（仍可點）。
- **狀態**：✅ 已做（2026-09-29）
- **最後更新**：2026-09-29

### RC9：週回顧會留下「只有模板、一個字沒填」的空殼卡 — 根因已確認（2026-09-29）

- **位置**：`src/components/review/JournalCardEditor.tsx` 的 `onUpdate` debounce 存檔
- **現象**：📔 日誌白板的 10 張週回顧卡裡有 **3 張是空殼**（第 34、35、40 週），
  原始 HTML 與 `weeklyTemplate()` 的輸出**一個字元都不差**：

  ```html
  <h2>第 34 週回顧（8/17 - 8/23）</h2>
  <p><strong>這週完成了什麼</strong></p><p></p>
  <p><strong>這週學到什麼</strong></p><p></p>
  <p><strong>卡住的地方 &amp; 解法</strong></p><p></p>
  <p><strong>下週目標（3 件事）</strong></p><p></p>
  <p><strong>需要跟進的白板</strong></p><p></p>
  ```

- **✅ 根因（實測確認，非推理）**：存檔是 **900ms debounce**，而它存的是
  **「900ms 之後」的文件狀態，不是觸發當下的狀態**。所以只要在同一個 900ms 視窗內
  「打了字又刪掉」（或打完馬上 undo），`onUpdate` 已經觸發 ⇒ 排定存檔 ⇒ 時間到時文件
  已經變回模板 ⇒ **卡片被建立，內容正好是模板**。空殼就是這樣誕生的。

  **重現步驟**（2026-09-29 用 CDP 實測，第 28 週原本無卡）：
  1. 開週回顧 → 翻到一個沒有卡片的週
  2. 點進內文，輸入任一字元，**在 900ms 內** Backspace 刪掉
  3. 等 4 秒 → 週卡數 10 → 11，新卡 `shape:jd_week202628_dje33`，
     內容與模板一字不差（測完已刪除並 reload 驗證還原）

- **實測排除的三條假路**（別再往這些方向查）：
  1. **「掛載／導覽就會建卡」不成立** —— 連翻 20 個沒有卡片的週、每次都掛載編輯器、
     等 4 秒，週卡數 10 → 10，一張都沒多。
  2. **「點進編輯器就會建卡」不成立** —— 把游標點進內文、不輸入任何字元、等 4 秒，
     週卡數不變，RC4 的狀態列也維持隱藏（＝卡片確實不存在）。
  3. **`skipUpdate` 的 120ms 時間窗不是元兇** —— `setContent(content, false)` 的第二個參數
     是 `emitUpdate`，預設就是 `false` 且程式碼明確傳 `false`（見
     `@tiptap/core` 2.27.2 的 `commands/setContent.d.ts`），**掛載時的 setContent 根本不發
     `onUpdate`**。那個旗標在守一個不會發生的事件。先前寫在本條目的「競態假設」已證偽。

- **影響範圍**：空殼混在 📔 日誌白板裡；也讓「這週有沒有卡片」失去意義——
  RC7 的按鈕靠「卡片有沒有被動過」決定要不要出現。RC7 目前是比對內容與模板來擋，
  所以不會誤判，但那是繞過而不是解決。

- **建議修法**：存檔前加一道守門——**卡片還不存在、且內容與模板一字不差時，不要寫檔**。
  述詞與 RC7 的 `cardUntouched` 相同，可以抽出來共用。
  已存在的卡片仍照常存（使用者可能是刻意清空）。`JournalDayView` 有同一套邏輯，要一起改。

- **狀態**：待修（根因已確認，修法明確）
- **最後更新**：2026-09-29

---

## 待觀察問題

### ~~WO1：link 卡片的 title / description / thumbnail 欄位從未填充~~ ✅ 已解決（核實於 2026-08-29）

- 位置：`CardShape.ts` TLCardProps
- 原記載：介面定義了 `title?`、`description?`、`thumbnail?`，但找不到自動抓取邏輯，三欄位恆為 undefined
- **核實結果：本項自 2026-05-09（commit `0b17397`「連結卡片系列修復」）起就已不成立**，
  這份文件漏更新了三個半月。填充路徑在 `LinkContent.tsx` 的 `updateLinkData`：
  URL 輸入完成（`isFinal`）時 `await fetchLinkMeta(url, embedData)`，抓到什麼就填什麼
  （`if (meta.title) …` 三行，抓不到就維持 undefined、不覆蓋既有值）。
- 資料來源分兩條（`embedUtils.ts` 的 `fetchLinkMeta`）：
  - **可內嵌的網域**（YouTube／Vimeo）走各家公開 oEmbed API，免 server、無 CORS 問題，回 `title` + `thumbnail`
  - **其餘網址**退回 `getLinkPreview()` 平台接縫＝Electron 主程序的 scraper，回 `title`／`description`／`image`；
    **網頁版（PWA）沒有這個接縫，回 null ⇒ 手機端三欄位確實仍為空**，這是平台差異不是 bug
- 教訓：又一次「功能是藏起來不是沒有」——`CardShape.ts` 只看得到型別宣告，填充邏輯在兩層之外的
  sub-component 裡。查「欄位沒人填」時要從**寫入端**（`updateShape` 的 payload）反查，不是從型別定義找。

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
