# 資料安全與防護機制

## 目的

說明 Scout Astrolabe 的資料儲存限制、多層防護機制（sanitize、soft delete、備份）、已知風險，以及 Dexie 版本遷移的安全設計。

## 適用範圍

`src/db.ts`（Dexie schema）、`src/utils/snapshot.ts`（sanitize）、`src/hooks/useBoardManager.ts`（14 天清除、sanitizeBoards）、`src/BackupPanel.tsx`（備份）、`src/platform/imageStore.ts`（圖片改存實體檔）、`src/components/DataSafetyPanel.tsx`（唯讀容量統計）。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/db.ts` | IndexedDB schema v1–v8、所有 table 定義、`MAX_BACKUPS`/`trimBackups` |
| `src/utils/snapshot.ts` | `sanitizeSnapshot`、`sanitizeCardProps`、`CARD_PROP_DEFAULTS` |
| `src/hooks/useBoardManager.ts` | 啟動時 sanitizeBoards、14 天自動清除、備份觸發 |
| `src/BackupPanel.tsx` | 備份清單 UI、手動還原、手動「立即遷移」圖片 |
| `src/platform/imageStore.ts` | image 卡改存 `userData/files`（astro-img protocol）；snapshot 只存 `storedName`（TD-IMG） |
| `src/utils/dataSafetyStats.ts` + `src/components/DataSafetyPanel.tsx` | 資料安全中心：`computeVaultStats` 純函式 + 唯讀統計面板（N10） |
| `src/constants.ts` | `BACKUP_THROTTLE_MS`（5 分鐘） |

---

## IndexedDB 儲存限制

### 瀏覽器層限制

| 限制類型 | 典型值 | 說明 |
|---------|--------|------|
| 總配額 | 50% 可用磁碟空間 | Chromium 動態配額，視作業系統空間而定 |
| 單筆記錄大小 | 無明文上限（實測 ~250MB） | 過大的 value 會導致 OOM |
| transaction 超時 | 無明文設定（瀏覽器自管） | 長時間寫入可能被中止 |

**Electron 的差異**：Electron 使用 Chromium 的 IndexedDB 實作，預設配額更寬鬆（通常可用 `app.getPath('userData')` 所在磁碟的大量空間），但具體上限取決於 Electron 版本和作業系統設定。

### 實際儲存規模（估算）

| 項目 | 大小估算 |
|------|---------|
| 一張文字卡片 | < 5 KB |
| 一張含 base64 圖片的卡片（已壓縮） | 50–200 KB |
| 一個白板（50 張卡片，無圖片） | ~100 KB |
| 一份備份（20 個白板，10 張圖片） | 10–50 MB |

圖片卡片是儲存體積的主要來源。`compressImage` 在存入前壓縮至最大 1200px、JPEG 0.8 品質，但 base64 編碼會讓原始大小膨脹約 33%。

---

## 三層資料防護

### 第 1 層：sanitizeCardProps（卡片欄位補齊）

在以下時機自動執行：

| 時機 | 位置 |
|------|------|
| App 啟動載入所有白板 | `sanitizeBoards()` → `sanitizeCardProps()` |
| 存入垃圾桶前 | `ContextMenu.tsx`、`WhiteboardTools.tsx` 中 `saveCardToTrash()` 呼叫前 |
| 從垃圾桶還原時 | `TrashPanel.handleRestoreCard()` → `editor.createShape(sanitizedData)` |

```typescript
// snapshot.ts — CARD_PROP_DEFAULTS
const CARD_PROP_DEFAULTS: Record<string, unknown> = {
    text: '', image: null, todos: [], url: '',
    linkEmbedUrl: null, state: 'idle', preview: false,
    color: 'none', w: 240, h: 120,
    tags: [], cardStatus: 'none', priority: 'none',
    linkedBoardId: null, journalDate: null,
}

export function sanitizeCardProps(props: Record<string, unknown>): Record<string, unknown> {
    let changed = false
    const result = { ...props }
    for (const [key, defaultValue] of Object.entries(CARD_PROP_DEFAULTS)) {
        if (result[key] === undefined || result[key] === null && defaultValue !== null) {
            result[key] = defaultValue
            changed = true
        }
    }
    return changed ? result : props  // 未變更時回傳原始參照，避免不必要的深複製
}
```

### 第 2 層：sanitizeSnapshot（snapshot 結構修復）

在 App 啟動 `sanitizeBoards()` 中執行：

```typescript
// snapshot.ts — sanitizeSnapshot 修復的問題
// 1. document:document record 缺少必要欄位（schema、meta 等）
// 2. page record 缺少 name、index 等欄位
// 3. frame shape 缺少 w/h/name 欄位（M11 修復）
// 4. arrow shape 缺少 start/end/bend 欄位（M11 修復）
```

`sanitizeSnapshot` 使用 `JSON.stringify` 比較前後差異（L4 修復）：

```typescript
// useBoardManager.ts — sanitizeBoards
const dirty = JSON.stringify(snapshot) !== JSON.stringify(board.snapshot)
if (dirty) await saveBoard(updated)   // 只有真正改變才寫 DB
```

### 第 3 層：軟刪除 14 天緩衝

```typescript
// useBoardManager.ts — App 啟動時執行
const TRASH_EXPIRE_MS = 14 * 86400000  // 14 天

// 清除過期卡片記錄
await db.table('deletedCards')
    .filter(r => Date.now() - r.deletedAt > TRASH_EXPIRE_MS)
    .delete()

// 清除過期白板（永久刪除）
const expiredBoards = await db.table('boards')
    .filter(b => !!b.deletedAt && Date.now() - b.deletedAt > TRASH_EXPIRE_MS)
    .toArray()
```

使用者有 14 天的緩衝期可還原誤刪的卡片或白板。

---

## 備份策略

### 自動備份

| 觸發事件 | 節流條件 |
|---------|---------|
| 切換白板 | 距上次備份 > 5 分鐘（`BACKUP_THROTTLE_MS`） |
| 應用進入背景（`visibilitychange`） | 同上 |

### 備份上限（5 份）

```typescript
// db.ts — 2026-06-21 由 30 降為 5（OOM 修復，commit cf105dc）
export const MAX_BACKUPS = 5

// trimBackups：只比對 timestamp 主鍵、不載入 blob，記憶體成本低
export async function trimBackups(): Promise<number> {
    const keys = await db.table('backups').orderBy('timestamp').primaryKeys()
    if (keys.length <= MAX_BACKUPS) return 0
    const toDelete = keys.slice(0, keys.length - MAX_BACKUPS)
    await db.table('backups').bulkDelete(toDelete)
    return toDelete.length
}
```

`saveAutoBackup` 寫入後呼叫 `trimBackups`；`useBoardManager` 啟動載入後、render 前也先 trim 一次。**為何由 30 降為 5**：每份備份是「所有白板的完整 snapshot」複製，30 份等於把整個 vault 複製 30 次，含圖片的 vault 會把 IndexedDB 撐到數 GB 並在寫入時造成記憶體尖峰導致 renderer OOM 白屏（見 `maintenance/bugs.md` P1-OOM）。`trimBackups` 刻意只讀 primaryKeys 不載 blob，避免修剪動作本身又觸發記憶體尖峰。

### 備份完整性

每份備份儲存所有白板的完整 `BoardRecord` 陣列（含 tldraw snapshot、縮圖 base64）。**備份不包含 `deletedCards` 和 `backups` 自身的 table**，因此還原後垃圾桶和備份歷史會被清空。

---

## 資料安全中心（唯讀統計，N10）

`DataSafetyPanel`（入口：側邊欄「更多」選單 🛡️）提供 vault 的唯讀容量觀測，**不做任何清理**（清理功能列後續）：

| 區塊 | 來源 |
|------|------|
| IndexedDB 儲存用量 + 進度條 | `navigator.storage.estimate()`（usage/quota，最準的實體用量） |
| 白板分類（一般/子板/封存/資料夾） | `computeVaultStats(boards)` |
| 卡片依型別計數 | 遍歷各板 `getCardShapes` 統計 `props.type` |
| 體積明細（圖片卡數/縮圖 base64/快照/備份估算） | `computeVaultStats`，字串長度近似 bytes |

統計邏輯集中在純函式 `src/utils/dataSafetyStats.ts`（`computeVaultStats` + `formatBytes`），有單元測試覆蓋；面板僅負責非同步取 `loadBackups()` 與 `storage.estimate()` 並呈現。體積為**估算**（以序列化字串長度近似），實體用量以 `storage.estimate()` 為準。

---

## Dexie 版本遷移（資料安全角度）

### 版本升級歷史

| 版本 | 新增/變更 | 安全性說明 |
|------|---------|-----------|
| v1–v3 | 初始 schema | — |
| v4 | `deletedCards` table | 新增 table，現有資料無影響 |
| v5 | `backups` table | 新增 table |
| v6 | `boards` 新增 `sortOrder` 欄位 | 既有記錄 `sortOrder` 為 undefined，首次讀取時補值 |
| v7 | `deletedCards.shapeId` index | **重要**：加入 `.upgrade()` 對舊記錄補 `shapeId: ''`（L5 修復） |
| v8 | `boards.folderId` index | 純新增 index（資料夾分類用）；既有記錄 `folderId` 為 undefined，讀取時容忍即可，無需 upgrade |

```typescript
// db.ts — v7 upgrade
db.version(7).stores({
    deletedCards: 'id, deletedAt, boardId, shapeId'
}).upgrade(tx =>
    tx.table('deletedCards').toCollection().modify(record => {
        if (!record.shapeId) record.shapeId = ''
    })
)
```

若未執行 `upgrade()`，舊記錄的 `shapeId` 欄位沒有 index entry，`where('shapeId').equals(id)` 會做 full scan（效能降低，但不影響正確性）。

### 未來版本升級注意事項

- 新增有 index 的欄位：必須提供 `.upgrade()` 對現有記錄補充預設值
- 修改欄位型別：需要在 upgrade 中遷移資料，不能假設舊記錄符合新格式
- 刪除欄位：Dexie 不會自動清理舊 record 中的多餘欄位（保留在 DB 中），需在讀取時容忍

---

## 已知風險

### R1：IndexedDB 體積膨脹（image 病根已治本，尚餘縮圖）

**描述（歷史）**：早期 image 卡把 base64 data URL 直接存入 snapshot，體積隨白板數量線性成長，並擴散到 `backups`（×5 複製）與 `deletedCards`，是 P1-OOM 的深層病根。

**已治本（TD-IMG，commit `7eaf7f5`）**：image 卡改存實體檔——`imageStore.saveImage` 寫入 `userData/files`，snapshot 只留 `storedName`、`image:null`，渲染走 `astro-img://` protocol 由 Chromium 直接讀檔、不進 JS heap。舊 base64 資料透過 `useImageMigration` 背景逐板遷移（跳過作用中板、冪等、可中斷），並 fallback 舊 base64 永久向後相容。詳見 `maintenance/bugs.md` TD-IMG。

**尚餘體積源**：整板縮圖 `boards.thumbnail` 仍是 base64（畫布 export，非 `props.image`），是 TD-IMG 未涵蓋的另一體積源。資料安全中心（N10）會把「整板縮圖」估算體積單獨列出，供使用者判斷；清理無用縮圖的功能列 N10 後續。

### R2：App 未正常關閉時的未儲存變更

**描述**：tldraw 的 auto-save 是 500ms debounce 非同步寫入（`handleSaveBoard`）。若 App 在 debounce 期間崩潰或強制關閉，最多可能遺失 500ms 的操作。

**緩解**：`handleSaveBoard` 有 `visibilitychange` 觸發的備份（但備份本身也有 5 分鐘節流），崩潰場景無法完全覆蓋。

### R3：sanitizeBoards 在白板數量大時啟動變慢

**描述**：啟動時 `sanitizeBoards` 遍歷所有白板，對每張卡片執行 `JSON.stringify` 比較。50 個白板、每板 100 張卡片的場景下，啟動時間可能延長數百毫秒。

**緩解**：`dirty` 判斷用 `JSON.stringify` 比較，僅在真正有變更時才寫 DB（L4 修復），減少不必要的 I/O。

### R4：備份不包含 deletedCards

**描述**：還原備份後，垃圾桶中的卡片全部消失。使用者可能誤以為還原時連垃圾桶資料也還原了。

**緩解**：備份/還原的 UI 說明（待確認是否有足夠的使用者提示）。

---

## 維護注意事項

- 新增 `TLCardProps` 欄位時，必須同步更新 `CARD_PROP_DEFAULTS`（`snapshot.ts`），否則 `sanitizeCardProps` 不會補齊新欄位，可能導致舊卡片在新版本載入時缺欄位報錯。
- Dexie 版本號只能遞增，不可重複使用已用過的版本號。若在開發中誤用了版本號，需要清除 IndexedDB（DevTools → Application → Storage → Clear）才能重新測試 upgrade。
- 備份還原（`handleRestore`）使用 `db.table('boards').clear()` + `bulkPut`，這是破壞性操作。UI 上應有確認步驟（`BackupPanel` 已有確認對話框）。

## 待確認

- `electron-store`（`config.json`）與 IndexedDB 的 `tldraw-document` 欄位：兩者是否都在使用，還是其中一個已廢棄？（從 `main.js` IPC 看，`electron-store` 的 `load-document` 仍在使用，但 Dexie 的 `boards` table 是主要存儲；兩者關係需釐清）
- 5 份備份上限在重度使用者（每天多次切板）的場景下，最多保留多久的歷史？（5 分鐘節流 × 5 份 = 至少 25 分鐘的不重複備份點）。放大備份數的前置是 TD-IMG（已完成）＋容量警告，見 roadmap N17。

## 外部參考

- [MDN IndexedDB 儲存限制](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Browser_storage_limits_and_eviction_criteria)
- [Dexie.js 版本與遷移](https://dexie.org/docs/Tutorial/Design#database-versioning)
