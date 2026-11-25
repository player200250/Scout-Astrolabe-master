# P0 資料安全修復報告

- 日期：2026-11-24
- 基準：`2a9be43`（v1.8.3）
- 依據：`docs/product-audit/PRODUCT_AUDIT.md` §5 D1–D3
- 狀態：**已修、未 commit、未 push、未升版號、未打包**
- 專案沒有 `CLAUDE.md`

## 總結

| 項目 | 結果 |
|---|---|
| 完整測試 | **102 檔／1208 測試全綠**（修前 97 檔／1156） |
| 新增測試 | 52 條（5 個新測試檔共 44 條＋`useBoardManager.test.ts` 補 8 條） |
| 正式建置 `npm run build` | 成功（型別檢查通過） |
| ESLint（改動的 17 個檔） | 0 錯誤 |
| 實機（Electron）驗證 | 2026-11-24 使用者手動測試：步驟 1、2、4 **通過**（含重開 App）。2026-11-25 步驟 3（還原）實機**通過**：壞備份（0 塊白板）→ 跳出「還原失敗，目前的資料沒有被更動」，資料 hash 不變；與現況相同的備份 → 寫入成功（updatedAt 全推進）、重新載入後 34 塊／1498 張卡、hash 與測試前一致 |

三個問題都在**隔離的記憶體資料庫**（fake-indexeddb）裡重現過。修好之前的程式會出錯，修好之後通過：
- D1：新的垃圾桶 UI 測試套在舊 `TrashPanel.tsx` 上，**3 條中有 2 條失敗**（共用的圖片檔被刪）。
- D3：舊還原寫法遇到中途失敗時，原本兩塊白板 `cur1`、`cur2` **全沒了**，只剩 `r1`、`r3`，中間那塊 `r2` 也丟了。新寫法會整批回滾。
- D2：舊邏輯寫在 `WhiteboardTools` 元件裡，沒辦法單獨測。這次抽成 hook 後用測試驗證；舊程式碼的 cleanup 只做 `clearTimeout` 不存檔，這點直接讀程式碼就能確認。

---

## 修復 1：共用圖片檔被連帶刪除（D1）

**原因**：複製卡片（Ctrl+D、複製貼上）時，tldraw 會原樣複製 props，`storedName` 不會重新產生，所以兩張卡共用同一個實體檔。原本有三條刪除路徑會**直接刪檔、不檢查別處是否還在用**：
- 垃圾桶「永久刪除」
- 「清空垃圾桶」
- 啟動時的「14 天過期清理」

**修法**：沿用資料安全中心「清理孤兒檔」已經在用的引用判定（`collectReferencedStoredNames`），不另寫一套。
- `localCleanup.ts`：把「讀出所有引用」抽成 `loadReferencedStoredNames()`，掃描孤兒檔和這次的修法共用。新增：
  - `releaseStoredFiles(names)`：只刪全 vault 都沒人引用的檔。引用來源包括白板（含垃圾桶裡的）、垃圾桶單卡、模板、App 內自動備份。**讀不到資料庫時一律不刪。**
  - `storedNameOfTrashedCard()`
- `trashUtils.ts`：新增 `purgeTrashedCards(records)`，**先刪記錄、再釋放實體檔**。這個順序不能反，否則被刪的那張卡自己就算一個引用。
- 三條路徑改走上面兩個函式：`TrashPanel.tsx` 的單張永久刪除和清空垃圾桶，`useBoardManager.ts` 的過期清理。

**行為差異（刻意的）**：如果某張圖還被 App 內自動備份引用，刪卡時會**先保留**那個檔。等備份輪替掉後，它變成孤兒檔，由資料安全中心的「清理孤兒檔」收掉。以前是立刻刪，結果還原舊備份會拿到破圖。

**沒有改**：永久刪除整塊白板時，原本就不刪圖片檔（M9 設計決策），維持不動。

## 修復 2：切換白板時丟掉最後 500ms 的編輯（D2）

**原因**：白板用 `key={board.id}` 掛載，每次切板都會卸載。卸載時 cleanup 只取消存檔計時器、沒有先存，所以 debounce 期間的那次編輯就沒了。

**修法**：新增 `src/hooks/useBoardAutosave.ts`，把存檔生命週期從 `WhiteboardTools` 抽出來。這是唯一新增的模組，屬於小幅度抽取，不是重構。
1. 照舊 debounce 500ms，沒有改成每次變更就寫。
2. **卸載時有待存的變更就立刻存**（不等縮圖）。
3. 每次存檔都帶 `boardId`。卸載那一刻 App 的 `activeBoardId` 已經是下一塊板，不能再靠它判斷要寫進哪塊。
4. 等縮圖期間如果有更新的存檔開始，舊的那次直接放棄，不會用舊內容蓋掉新內容。
5. `pagehide`（關閉視窗、重新載入）時盡力補存。
6. 取不到 snapshot 或寫入丟錯時：不崩潰、記錄錯誤、不寫入半套資料。

`useBoardCRUD.handleSaveBoard` 跟著修：
- 接收 `boardId`，沒給時退回 `activeBoardId`，舊呼叫照常運作。
- 改從 `boardsRef` 讀最新的白板清單（已卸載的白板手上拿的是舊 closure）。
- **不寫已被刪除的板**：研究時發現，沒有這道檢查的話，刪掉目前白板時，卸載補存會把它從垃圾桶寫回來。
- **資料庫寫入失敗時跳出錯誤提示**，不再只印在 console。

## 修復 3：還原中途失敗留下半空的資料庫（D3）

**原因**：`boards.clear()` 跟逐筆 `put` 不在同一個交易裡。另外，App 內備份面板（`BackupPanel`）沒有等還原結果，失敗時畫面上什麼都不顯示。

**修法**：
- `boardDb.ts` 新增 `validateRestoreBoards()`：寫入前先驗證。陣列不可為空、每筆要有 id 和名稱、snapshot 型別正確、id 不能重複、至少要有一塊不在垃圾桶的板。**只要有一筆不合格就整份拒絕**，不會濾掉壞的那筆再還原其餘的。
- `boardDb.ts` 新增 `replaceAllBoards()`：清空與寫入放在**同一個 Dexie 交易**，交易內再數一次筆數。任何一步失敗就整批回滾。
- `handleRestore` 的順序：驗證 → 通知白板先補存 debounce 中的編輯（`flush-pending-board-save`）→ 交易寫入 → 成功後才清同步狀態、切換畫面。失敗就丟錯，畫面和同步狀態都不動。
  - 為什麼要先補存：否則白板在還原後卸載，補存會把還原前的內容蓋回剛還原的板（修復 2 帶出來的交互作用）。先補存的話，那次寫入在 IndexedDB 裡排在還原交易前面，有測試驗證。
- `BackupPanel`：改成等還原結果，失敗時跳出常駐錯誤提示「還原失敗，目前的資料沒有被更動」，按鈕也不會卡在「還原中…」。`DataSafetyPanel` 原本就有處理失敗，沒改。

**交易涵蓋不到的部分**：
- 圖片實體檔：從備份檔還原時，主程序會補回缺少的圖。這一步只新增、不覆蓋、不刪除，所以就算後面的還原失敗，也不需要回滾。
- 同步狀態：交易成功後才清除。

---

## 修改檔案

| 檔案 | 改了什麼 |
|---|---|
| `src/utils/localCleanup.ts` | 抽出引用讀取；新增 `releaseStoredFiles`、`storedNameOfTrashedCard` |
| `src/utils/trashUtils.ts` | 新增 `purgeTrashedCards` |
| `src/components/TrashPanel.tsx` | 兩條刪除路徑改用上面的函式；`onEmptyTrash` 型別可回傳 Promise |
| `src/hooks/useBoardManager.ts` | 過期清理改用 `purgeTrashedCards`；`handleRestore` 加驗證、先補存、交易寫入 |
| `src/hooks/useBoardAutosave.ts`（新） | 白板存檔生命週期 |
| `src/components/WhiteboardTools.tsx` | 存檔邏輯換成 `useBoardAutosave`；`onSaveBoard` 帶 `boardId` |
| `src/components/Whiteboard.tsx` | `onSaveBoard` 型別 |
| `src/hooks/useBoardCRUD.ts` | `handleSaveBoard`：帶 `boardId`、讀最新清單、不寫已刪除的板、失敗時提示 |
| `src/utils/boardDb.ts` | 新增 `validateRestoreBoards`、`replaceAllBoards` |
| `src/utils/appEvents.ts` | 新增事件 `flush-pending-board-save` |
| `src/components/BackupPanel.tsx` | 等還原結果、失敗時提示 |
| `package.json`／`package-lock.json` | **新增 devDependency `fake-indexeddb`**（測試用的隔離資料庫，不進正式包） |

UI 只動了一個地方：失敗時多一則錯誤提示（沿用既有的 toast），沒有新增或移除任何按鈕和畫面。

## 新增測試

| 檔案 | 條數 | 驗證什麼 |
|---|---|---|
| `src/utils/localCleanup.test.ts` | 12 | 共用檔不刪；最後一個引用移除時照舊刪；垃圾桶的板、垃圾桶單卡、模板、備份還在引用時都保留；讀不到資料庫時不刪；`purgeTrashedCards` 的順序與部分刪除 |
| `src/components/TrashPanel.test.tsx` | 3 | 真元件：永久刪除、清空垃圾桶不刪仍被引用的檔；沒有引用時照舊刪 |
| `src/hooks/useBoardAutosave.test.ts` | 13 | 快速連續修改只存最新一次；debounce 時間沒到不寫；**修改後立刻卸載會補存並寫對板**；沒有待存的變更時不寫；取 snapshot 或 onSave 丟錯不崩潰；縮圖競態；還原前補存；pagehide；**切板＋重新讀資料庫後兩塊板都是最新內容**（真 Dexie）；tldraw store 釋放後仍能取 snapshot |
| `src/hooks/useBoardManager.test.ts` | +8 | 補存寫對板；不讓刪除的板復活；舊 closure 讀到最新資料；寫入失敗時提示；還原失敗時畫面和同步狀態不動；無效備份不碰資料庫；先補存再還原；過期清理走新路徑 |
| `src/utils/boardDb.restore.test.ts` | 14 | **中途失敗整批回滾**；筆數不符時回滾；成功時資料庫恰好等於備份；補存與還原的先後順序；8 種無效備份都被拒絕；**完整往返**（白板、卡片、圖片、白板卡連結、待辦、垃圾桶的板，以及圖片引用完整） |
| `src/components/BackupPanel.test.tsx` | 2 | 失敗時有錯誤提示、按鈕可以再按；成功時沒有錯誤提示 |

既有的 4 條還原測試改寫了斷言：從「呼叫 `clear`／`put`」改成「呼叫 `replaceAllBoards`」，要驗的行為不變。

## 尚未驗證

1. **備份還原（修復 3）沒有在真正的 Electron App 裡跑過**。它的驗證只有 jsdom 加 fake-indexeddb 的自動測試；修復 1、2 已經過使用者手動測試（見「手動測試結果」）。
2. 切板補存是否真的有效，取決於 tldraw 在 `editor.dispose()` 之後還能不能取 snapshot。測試只驗了 `store.dispose()` 這一層，完整的 editor 卸載順序沒有實機確認。如果實機取不到，程式會記錄錯誤、不寫入，行為等同修復前，不會更糟。
3. `pagehide` 補存：頁面卸載時 IndexedDB 寫入不保證完成，只算盡力而為。
4. 大型 vault（數百 MB）在單一交易裡還原，會不會遇到記憶體或交易逾時，沒有測。
5. 雲端同步開啟時的還原流程沒有測（服務目前暫停）。

## 潛在風險

- **單一交易還原的記憶體尖峰**：整份備份要一次留在交易裡，大型 vault 可能比舊寫法更吃記憶體。代價是失敗時會回滾，而不是留下半空的資料庫。
- **孤兒檔可能多留一陣子**：被備份引用的圖會等備份輪替之後才變成孤兒檔，要靠資料安全中心清理，佔用的空間會稍微多一點。
- 從垃圾桶永久刪除時，若同一時間白板上剛貼了同一張圖的複本，而且還在 500ms debounce 內沒寫進資料庫，那張檔仍可能被判定沒人引用。觸發條件極窄，修復 2 讓這個時間窗不會再擴大。

## 建議手動測試（強烈建議，請用測試 vault）

⚠️ 打包版和 `ELECTRON_PROD_TEST` 共用同一份 vault，`--user-data-dir` 會被 `main.js` 覆蓋。開始前先到「文件\Scout Astrolabe 備份」確認有一份最新的硬碟備份，或先把正式 vault 整個資料夾複製出來。

1. 貼一張圖 → Ctrl+D 複製 → 刪掉複本 → 到垃圾桶永久刪除 → 原卡的圖仍然顯示；重開 App 後仍然顯示。
2. 拖動一張卡後**立刻**點側欄切到別塊板 → 切回來 → 位置是新的；重開 App 後仍然是新的。
3. 在資料安全中心從硬碟備份檔還原 → 白板、圖片、連結都正確。
4. 刪除目前開著的白板 → 它進了垃圾桶，重開 App 後沒有自己跑回側欄。

**手動測試通過之前不建議發版。**

### 手動測試結果（2026-11-24，測試版 `ELECTRON_PROD_TEST=1`）

測前已關閉正式版，並把整份資料複製到 `文件\Scout Astrolabe 備份\手動保全\userData-before-P0-test-20261124-2237`（185 MB）。

| 步驟 | 結果 |
|---|---|
| 1 共用圖片：複製 → 刪複本 → 永久刪除 → 原卡的圖仍在 | ✅ 通過 |
| 2 拖卡後立刻切板 → 切回來是新位置 | ✅ 通過 |
| 3 從自動備份還原（最新一份） | ⚠️ **未實機驗證**（本次未執行；只有自動測試覆蓋） |
| 4 刪除目前白板 → 進垃圾桶、不會復活 | ✅ 通過 |

通過的步驟在重開 App 後結果仍然維持。
