# ADR 0003：選用 Dexie.js + IndexedDB 作為本地資料庫

## 狀態

已採用（截至 2026-05-08）

---

## 背景

Scout Astrolabe 是本地優先應用，需要在瀏覽器/Electron 環境中持久化以下資料：

1. **白板記錄（BoardRecord）**：含 tldraw snapshot（大型 JSON 物件）、縮圖（base64）、元資料
2. **已刪卡片（DeletedCardRecord）**：垃圾桶卡片，含 shapeData（含 base64 圖片）
3. **備份（BackupRecord）**：所有白板的完整快照，每份可達數十 MB
4. **容量需求**：單個使用者的資料可能達數百 MB（含大量圖片卡片）

評估時的選項：
- **IndexedDB（原生）**：Web 標準 API，但 callback-based，使用繁瑣
- **Dexie.js**：IndexedDB 的 Promise 封裝，Schema 管理、版本遷移、查詢 DSL
- **SQLite（via sql.js 或 better-sqlite3）**：傳統關聯式資料庫，需要額外打包
- **electron-store（JSON 檔案）**：簡單 key-value，不適合大型二進位資料
- **LevelDB / PouchDB**：其他 NoSQL 選項

---

## 決策

選用 **Dexie.js v4 + 瀏覽器 IndexedDB** 作為主要資料儲存。

`electron-store` 作為輔助，儲存 `tldraw-document`（可能為 early prototype 殘留，主要資料在 Dexie）。

---

## 後果

### 正面

- IndexedDB 是瀏覽器原生 API，在 Electron 的 Chromium 中完全支援，無需額外安裝原生模組
- Dexie.js 的 Schema 管理（`db.version(x).stores({...}).upgrade(tx => ...)`）提供清晰的版本遷移路徑
- Dexie 的查詢 DSL（`where('deletedAt').above(0).count()`）比原生 IndexedDB 更易讀
- `table.bulkPut` 和 `table.toCollection().modify()` 讓批次操作方便實作
- IndexedDB 的儲存上限較寬鬆（通常 50%+ 可用磁碟），適合存放大型 base64 圖片
- 無需額外伺服器或雲端，完全本地

### 負面

- IndexedDB 只支援有限的查詢（key range，無法做複雜的 JOIN 或全文搜尋）→ 搜尋目前在記憶體中全量掃描
- Schema 升級不可降版（Dexie 版本號只能遞增），開發中誤升版號需清 DB 才能測試
- 備份的 `BackupRecord.boards` 體積大（含所有 snapshot），序列化/反序列化慢
- 沒有 ACID 事務支援跨 table 的原子操作（如同時刪白板和其中的 deletedCards）

### 引入的設計約束

- `db.ts` 的 schema 版本號是一條單向路，升版前需確認 upgrade 函式的正確性
- 新增有 index 的欄位時，必須提供 `upgrade()` 對現有記錄補充預設值（前例：v7 對 `shapeId` 補空字串）
- `BackupRecord` 的體積隨白板數量成長，份數上限是防止 DB 無限膨脹的必要設計
  （本 ADR 撰寫時為 30 份；**2026-06-21 已降為 5** —— 30 份實測仍會撐到 2.7GB 並造成 renderer OOM 白屏，見 `docs/maintenance/bugs.md` P1-OOM）
- 跨 table 的一致性（如刪白板後清除對應 deletedCards）需要在應用層手動處理

---

## 替代方案分析

| 方案 | 主要優勢 | 排除原因 |
|------|---------|---------|
| **原生 IndexedDB** | 無依賴 | Callback-based API 繁瑣；Schema 管理需自行實作 |
| **SQLite（better-sqlite3）** | 完整 SQL 查詢能力、全文搜尋 | 需要原生模組（`.node` 檔案），打包 Electron 複雜；與 Chromium 版本耦合 |
| **sql.js** | SQLite 的 WASM 版本，無原生模組 | 所有資料在記憶體中（無持久化），需手動序列化到 IndexedDB；大型 DB 效能差 |
| **electron-store** | 極簡，JSON 檔案 | 只適合小型設定（< 1 MB）；無 index 查詢；concurrent write 不安全 |
| **PouchDB** | CouchDB 同步生態 | 為同步設計，過度工程化；不需要雲端同步 |

---

## 相關文件

- [docs/data-model.md](../data-model.md) — Dexie schema 詳情（v1–v8）
- [docs/data-safety.md](../data-safety.md) — IndexedDB 儲存限制與安全設計
- [docs/trash-lifecycle.md](../trash-lifecycle.md) — deletedCards table 用法
- [Dexie.js 文件](https://dexie.org/docs/)
