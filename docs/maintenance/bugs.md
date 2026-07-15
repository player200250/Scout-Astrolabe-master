# Bug 追蹤索引

## 目的

維護已知 bug、設計決策、及待觀察問題的索引。詳細的原始掃描記錄與驗證報告見根目錄的 [BUGS.md](../../BUGS.md)。

## 適用範圍

本文件只記錄「尚未關閉」的問題，以及後續掃描中新發現的項目。已修且驗證通過的 bug 以根目錄 BUGS.md 為準。

## 相關檔案

- 根目錄 [BUGS.md](../../BUGS.md)：完整的初始掃描（20 項）與全面驗證報告（2026-05-07）

---

## 目前狀態摘要（截至 2026-05-08）

| 類別 | 數量 | 說明 |
|------|------|------|
| Critical | 0 | 全部修復（C1–C4） |
| Medium | 0 | 全部修復或列為設計決策（M1–M11） |
| Low | 0 | 全部修復（L1–L5） |
| 設計決策 | 1 | M9：軟刪白板時不逐一歸檔內部卡片 |
| 已修（部分）| 1 | P1-OOM：備份堆積導致 renderer OOM 白屏（備份已修，圖片治本 TD-IMG 已完成）|
| 已修 | 1 | TD-IMG：image 卡 base64 改存實體檔（astro-img protocol + 混合式遷移）|

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

## WO4：`[[]]` 補全的鍵盤處理可能被 ProseMirror 先攔截（待實測）

**發現**：2026-07-15，實作 `/` 選單（階段 1）時發現。

**問題**：`TextContent.tsx` 的 `handleEditorKeyDown` 掛在外層 div 的 React `onKeyDown`。
但 React 的事件是委派在 root 的 **bubble 階段**，而 ProseMirror 的 listener 直接掛在 contenteditable 上
（**target 階段**）→ PM 會先處理 Enter／Tab／方向鍵，等 React 收到時預設行為已經發生，
`preventDefault()` 已無意義。

**證據**：`/` 選單一開始用同一套 React `onKeyDown`，實測 Enter **無法套用命令**（`/h3` 原樣留在文字裡）；
改用 tiptap 的 `editorProps.handleKeyDown`（跑在 PM 內部）後立即正常。

**影響（推測，未證實）**：`[[]]` 補全的 Enter／Tab 選取可能沒生效、方向鍵可能同時移動游標又改選單索引。
`insertCompletion` 用 `deleteRange(suggest.from, curFrom)`，即使段落已被 Enter 切開也可能「剛好」得到近似正確的結果，
故問題可能一直被掩蓋。

**尚未確認**：兩次嘗試實測都因測試腳本自身的錯誤（Escape 先關掉編輯模式、選擇器抓錯卡片）而未取得結論。
**修法已知**：比照 `/` 選單改走 `editorProps.handleKeyDown`。

**狀態**：待實測確認後再修（不在 `/` 選單階段 1 的範圍內，避免夾帶）。

---

## 維護注意事項

- 每次修復 bug 後，在根目錄 BUGS.md 補上「已修」標記與確認點，並更新本文件的摘要數字。
- 「設計決策」類別的項目不算 bug，但需在此記錄以避免未來重複提出。
- `WO` 開頭（Watching）的項目表示已知的疑問，尚未確認是否為 bug。

## 外部參考

- 根目錄 [BUGS.md](../../BUGS.md)
