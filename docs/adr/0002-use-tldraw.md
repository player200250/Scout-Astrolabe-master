# ADR 0002：選用 tldraw 作為無限白板引擎

## 狀態

已採用（截至 2026-05-08）

---

## 背景

Scout Astrolabe 需要一個可以在二維無限畫布上自由排列卡片的引擎，核心需求為：

1. **無限畫布**：使用者可以自由縮放、平移，無固定邊界
2. **自訂 Shape**：需要建立完全自訂的「卡片」Shape（含富文字、待辦清單、連結嵌入等）
3. **選取與拖曳**：多選、拖曳、調整大小等操作需要開箱即用
4. **React 整合**：團隊技術棧為 React + TypeScript，需要良好整合
5. **本地渲染**：不依賴後端，在 Electron 的 Chromium 上直接渲染

評估時的選項：
- **tldraw v3**：React 原生、開源、可自訂 Shape
- **Excalidraw**：開源白板，但 Shape 自訂能力有限
- **Fabric.js**：Canvas 框架，但 React 整合需自行處理
- **React Flow**：節點圖框架，主要用於 DAG，不是自由畫布
- **自行實作**：完全自行開發畫布引擎

---

## 決策

選用 **tldraw v3** 作為無限白板引擎。

---

## 後果

### 正面

- tldraw v3 提供完整的 `ShapeUtil` API，允許建立完全自訂的 Shape（`CardShapeUtil extends ShapeUtil<TLCardShape>`），含自訂渲染、雙擊行為、resize handle 等
- 選取框、多選、拖曳、鍵盤操作（Ctrl+Z undo）均開箱即用，無需自行實作
- tldraw 在 Chromium 環境穩定，與 Electron 37 無相容性問題
- `editor.store.listen()` 提供 reactive 的 change stream，可橋接到 React state（Ctrl+Z 同步垃圾桶）
- `editor.toImage()`、`editor.getSvg()` 提供匯出能力

### 負面

- **不透明的 snapshot 格式**：`TLEditorSnapshot` 沒有官方 schema 文件，直接操作需要 cast 為 `MutableSnapshot`（`src/utils/snapshot.ts`），存在版本升級後格式變動的風險
- **v3 API 不穩定**：tldraw 從 v2 → v3 有重大 API 變更；未來升級可能需要大量適配工作
- **bundle 體積大**：tldraw 本身約 300–500 KB gzip 後，加上 tldraw.css
- **學習曲線**：tldraw 的 `ShapeUtil`、`editor.store`、`TLEditorSnapshot` 等內部概念需要時間理解

### 引入的設計約束

- 所有 Shape 資料存在 `TLEditorSnapshot.document.store`（opaque Record）中，讀寫需透過 `snapshot.ts` 的工具函式
- tldraw 的 React tree（`<Tldraw>` 元件內部）與 App 層的 React tree 是隔離的，跨層通訊需透過 `CustomEvent`
- `editor.store.listen` 的回呼在 tldraw 內部執行，必須避免在回呼中直接呼叫 React setState（會有 concurrent mode 問題）
- `sanitizeSnapshot` 和 `sanitizeCardProps` 是必要的防禦層，因為 tldraw 在 Schema 驗證失敗時會拋出 `ValidationError`
- `key={activeBoard.id}` 加在 `<Whiteboard>` 上，切板時 force re-mount，確保 tldraw editor instance 完全重新初始化

---

## 替代方案分析

| 方案 | 主要優勢 | 排除原因 |
|------|---------|---------|
| **Excalidraw** | 開源、UI 精美 | Shape 自訂能力弱（插件 API 有限）；JSON 格式不適合存儲複雜卡片資料 |
| **Fabric.js** | 成熟的 Canvas 框架 | React 整合需自行處理；無 undo/redo 開箱即用；需要自行實作選取/拖曳 |
| **React Flow** | DAG 節點圖成熟 | 設計用於有向圖，不是自由畫布；節點佈局預設為 flow，不適合卡片牆 |
| **自行實作** | 完全控制 | 工程量巨大（選取、拖曳、縮放、undo/redo 每項都需數週工作） |

---

## 相關文件

- [docs/tldraw-snapshot.md](../tldraw-snapshot.md) — snapshot 格式與工具函式
- [docs/card-shape-spec.md](../card-shape-spec.md) — CardShapeUtil 實作規格
- [tldraw ShapeUtil 文件](https://tldraw.dev/reference/editor/ShapeUtil)
