# Scout Astrolabe 技術文件索引

本目錄收錄所有開發者導向的技術文件。文件根據實際程式碼撰寫，不確定之處標註「待確認」。

---

## 文件列表

| 文件 | 說明 |
|------|------|
| [architecture.md](architecture.md) | 系統整體架構、元件分層、資料流 |
| [data-model.md](data-model.md) | IndexedDB schema、BoardRecord、DeletedCardRecord 欄位說明 |
| [tldraw-snapshot.md](tldraw-snapshot.md) | TLEditorSnapshot 格式、讀寫方式、sanitize 機制 |
| [card-shape-spec.md](card-shape-spec.md) | CardShape 型別規格、各類型 props、顏色常數 |
| [context-menu-spec.md](context-menu-spec.md) | 右鍵選單規範：空白處/單卡/多選/各類型選單項、顏色選擇器、捷徑對照 |
| [state-and-events.md](state-and-events.md) | useBoardManager 狀態管理、全域 CustomEvent 總覽 |
| [electron-ipc.md](electron-ipc.md) | Electron IPC 架構、contextBridge API、安全設定 |
| [import-export-backup.md](import-export-backup.md) | JSON/PNG/PDF/Markdown 匯出、自動備份、手動還原 |
| [build-and-release.md](build-and-release.md) | 開發環境、Vite 建置、Windows NSIS 封裝 |
| [trash-lifecycle.md](trash-lifecycle.md) | 卡片/白板軟刪除、14 天自動清除、Ctrl+Z 同步 |
| [testing-strategy.md](testing-strategy.md) | 測試現況、高風險脆弱點、自動化測試建議 |
| [search-and-links.md](search-and-links.md) | 全文搜尋、[[]] 雙向連結、BacklinksPanel、知識圖譜 |
| [rich-text-editor.md](rich-text-editor.md) | TipTap 設定、格式支援、[[]] 自動補全、HTML 儲存格式 |
| [journal-review.md](journal-review.md) | Journal 白板、每日卡片、週回顧、月曆、ReviewCenter |
| [data-safety.md](data-safety.md) | IndexedDB 限制、備份策略、sanitize 防護、已知風險 |
| [refactor-roadmap.md](refactor-roadmap.md) | 技術債清單、重構優先順序、架構演進建議 |
| [roadmap-v2.md](roadmap-v2.md) | v1.2.0–v2.0.0 開發路線圖（功能清單、工作量、依賴關係） |
| [roadmap-mobile.md](roadmap-mobile.md) | 行動端（PWA）與雲端同步路線圖（階段、技術、風險）— 自用定位 |
| [product-analysis.md](product-analysis.md) | 產品定位、檔案/功能高層分析（與 architecture.md 部分重疊，待整併） |
| [product-redesign-2026-07.md](product-redesign-2026-07.md) | **功能全景盤點**＋D1/D7 重設計討論記錄（死線視角全死、兩個中心的分類法錯誤、Heptabase/Milanote/Notion 對照、月曆為何無用） |
| [adr/0001-use-electron.md](adr/0001-use-electron.md) | ADR：選用 Electron 作為桌面應用框架 |
| [adr/0002-use-tldraw.md](adr/0002-use-tldraw.md) | ADR：選用 tldraw 作為無限白板引擎 |
| [adr/0003-use-dexie-indexeddb.md](adr/0003-use-dexie-indexeddb.md) | ADR：選用 Dexie.js + IndexedDB 作為本地資料庫 |
| [adr/0004-store-rich-text-as-html.md](adr/0004-store-rich-text-as-html.md) | ADR：以 HTML 字串儲存富文字內容 |
| [adr/0005-local-first-product-direction.md](adr/0005-local-first-product-direction.md) | ADR：本地優先（Local-First）的產品方向（已由 0006 修正）|
| [adr/0006-cloud-sync-and-mobile.md](adr/0006-cloud-sync-and-mobile.md) | ADR：選擇性雲端同步與行動端 PWA（修正 0005）|
| [adr/0007-cards-bound-to-single-board.md](adr/0007-cards-bound-to-single-board.md) | ADR：接受「卡片綁定單一白板」，以 `[[連結]]` 作為跨板可達的近似解 |
| [maintenance/bugs.md](maintenance/bugs.md) | Bug 追蹤索引（詳細內容見根目錄 BUGS.md） |

---

## 快速入口

### 我想了解資料怎麼存
→ [data-model.md](data-model.md) → [tldraw-snapshot.md](tldraw-snapshot.md)

### 我想加一種新卡片類型
→ [card-shape-spec.md](card-shape-spec.md) → `src/components/card-shape/type/CardShape.ts`

### 我想知道右鍵選單有哪些功能 / 加一個選單項
→ [context-menu-spec.md](context-menu-spec.md) → `src/utils/contextMenuUtils.tsx`

### 我想追一個跨元件的事件
→ [state-and-events.md](state-and-events.md) → CustomEvent 總覽表

### 我想了解白板刪除的完整流程
→ [trash-lifecycle.md](trash-lifecycle.md) → [state-and-events.md](state-and-events.md) 的「軟刪除流程」一節

### 我想了解 Electron 主程序與 React 的通訊
→ [electron-ipc.md](electron-ipc.md)

### 我想打包 Windows 安裝程式
→ [build-and-release.md](build-and-release.md)

### 我想引入自動化測試
→ [testing-strategy.md](testing-strategy.md)

### 我想了解搜尋與雙向連結
→ [search-and-links.md](search-and-links.md)

### 我想修改或擴充富文字編輯器
→ [rich-text-editor.md](rich-text-editor.md)

### 我想了解 Journal / 月曆 / 週回顧的架構
→ [journal-review.md](journal-review.md)

### 我想了解某個技術選型的原因
→ [adr/](adr/) 目錄下的 ADR 文件

### 我想規劃重構或改善效能
→ [refactor-roadmap.md](refactor-roadmap.md)

### 我在修 Bug
→ [maintenance/bugs.md](maintenance/bugs.md) → 根目錄 [BUGS.md](../BUGS.md)

---

## 外部參考

- [tldraw 文件](https://tldraw.dev/docs)
- [Dexie.js 文件](https://dexie.org/docs/)
- [TipTap 文件](https://tiptap.dev/docs)
- [@dnd-kit 文件](https://docs.dndkit.com/)
