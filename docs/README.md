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
| [state-and-events.md](state-and-events.md) | useBoardManager 狀態管理、全域 CustomEvent 總覽 |
| [electron-ipc.md](electron-ipc.md) | Electron IPC 架構、contextBridge API、安全設定 |
| [import-export-backup.md](import-export-backup.md) | JSON/PNG/PDF/Markdown 匯出、自動備份、手動還原 |
| [build-and-release.md](build-and-release.md) | 開發環境、Vite 建置、Windows NSIS 封裝 |
| [trash-lifecycle.md](trash-lifecycle.md) | 卡片/白板軟刪除、14 天自動清除、Ctrl+Z 同步 |
| [testing-strategy.md](testing-strategy.md) | 測試現況、高風險脆弱點、自動化測試建議 |
| [maintenance/bugs.md](maintenance/bugs.md) | Bug 追蹤索引（詳細內容見根目錄 BUGS.md） |

---

## 快速入口

### 我想了解資料怎麼存
→ [data-model.md](data-model.md) → [tldraw-snapshot.md](tldraw-snapshot.md)

### 我想加一種新卡片類型
→ [card-shape-spec.md](card-shape-spec.md) → `src/components/card-shape/type/CardShape.ts`

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

### 我在修 Bug
→ [maintenance/bugs.md](maintenance/bugs.md) → 根目錄 [BUGS.md](../BUGS.md)

---

## 外部參考

- [tldraw 文件](https://tldraw.dev/docs)
- [Dexie.js 文件](https://dexie.org/docs/)
- [TipTap 文件](https://tiptap.dev/docs)
- [@dnd-kit 文件](https://docs.dndkit.com/)
