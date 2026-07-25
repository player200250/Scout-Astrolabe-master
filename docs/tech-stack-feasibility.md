# 技術棧可行性評估

> 文件日期：2026-07-19
> 定位前提：**自用工具**；唯一大方向＝**PWA 行動端 + Supabase 雲端同步**（見 [roadmap-mobile.md](roadmap-mobile.md)、[adr/0006](adr/0006-cloud-sync-and-mobile.md)）
> 目的：逐項盤點目前技術棧，並以「**能否撐到 PWA/行動端 + 同步**」為決定性視角評估可行性。判斷性結論標「待確認」。

---

## 一句話結論

**這個棧約 9 成是 web-native**（React / tldraw / TipTap / Dexie / 所有功能庫都跑在瀏覽器裡）——App 本質是「包在 Electron 殼裡的 web app」，因此 **PWA 方向本身可行**。摩擦集中在 **Electron IPC 那一層**（圖片/檔案/連結/托盤/熱鍵），要靠 `src/platform/` 抽象補完；真正未蓋、風險最高的是 **Supabase 同步層本身**（屬工程實作，非選型問題）。

版本快照（`package.json`，2026-07-19）：React 19.2、tldraw 3.15、TipTap 2.27、Dexie 4.2、Electron 37.3、Vite 7.1、Vitest 3.2、TypeScript 5.8。

---

## 核心引擎（賭最大、鎖定最深）

| 技術 | 角色 | 健康度／風險 | PWA＋同步可行性 |
|---|---|---|---|
| **tldraw 3.15** | 整個白板畫布 | 成熟但**鎖定極深**（全 App 建於其上）。兩個真議題：① **授權（已釐清，見下方專節）——自用非商業＝免費 hobby license，保留浮水印即合規**。② 資料模型＝**整張 snapshot JSON**，使雲同步粒度粗。見 [adr/0002](adr/0002-use-tldraw.md)、[tldraw-snapshot.md](tldraw-snapshot.md) | 本身跑瀏覽器＝PWA 可跑。但**行動端刻意不上畫布**（6 吋操作無限畫布體驗差，roadmap 已拍板）。手機端不需跑 tldraw，直接讀 snapshot JSON（`utils/snapshotCards`）|
| **React 19.2** | 全 UI | 最新穩定、跨平台、低風險 | 完美可攜（同一份碼跑 Electron 與 web）|
| **TipTap 2.27**（ProseMirror） | 卡片富文字 | 成熟；可無頭執行（`Toggle.test.ts` 已用）。**TipTap 3 已釋出**，本專案在 2.x＝未來一次遷移（**待評估**時機）。見 [adr/0004](adr/0004-store-rich-text-as-html.md)、[rich-text-editor.md](rich-text-editor.md) | 純 web、完美可攜；手機簡單編輯也走它 |

## 持久化與同步（未來的關鍵）

| 技術 | 角色 | 健康度／風險 | PWA＋同步可行性 |
|---|---|---|---|
| **Dexie 4.2 / IndexedDB** | 本機資料真相 | 穩、瀏覽器原生。見 [adr/0003](adr/0003-use-dexie-indexeddb.md)、[data-model.md](data-model.md) | **完美可攜**（PWA 也用 IndexedDB）。但它只是本機層——同步要另建。「整板一筆 snapshot」使 **LWW 粒度粗**（已知並接受：單人雙裝置＋同步前自動備份兜底）|
| **Supabase**（尚未進 deps） | 規劃中的雲端後端 | 自用選型合理（Postgres＋Auth＋免費額度、免自架）。**最大未建風險** | 整個方向的核心工程：推/拉、整板 LWW、image→Supabase Storage。**選型無虞，難在實作**|
| **electron-store 10** | 桌面設定（托盤偏好等） | 小、穩 | ⚠️ **Electron-only** → PWA 需 localStorage/IndexedDB fallback（platform 抽象處理）|

## Electron 殼（移植摩擦都在這）

| 技術 | 角色 | 健康度／風險 | PWA＋同步可行性 |
|---|---|---|---|
| **Electron 37.3** | 桌面殼 | 桌面無問題。見 [adr/0001](adr/0001-use-electron.md)、[electron-ipc.md](electron-ipc.md) | ⚠️ **所有 Electron 專屬面皆不可攜**：`astro-img://` protocol、`file://` 存圖、Tray、BrowserWindow、多個 IPC（見下表）。**目前僅 `imageStore` 抽象了**，其餘仍綁死 `window.electronAPI`。這是 S0(a) 的實質工作量 |
| **electron-builder 26** | 打包（Windows NSIS） | 桌面-only、穩。見 [build-and-release.md](build-and-release.md) | 不適用 PWA（PWA 自有安裝機制）|

**需抽象化的 IPC 面（`preload.js` / `main.js`，PWA 前要收進 `src/platform/` 並補 web fallback）**：
`save-image`、`delete-file`、`open-file`、`select-and-copy-file`、`get-link-preview`、`open-external(-link)`、`trigger-quick-capture`（托盤/熱鍵）。**S0(a) 主體已完成（2026-07-23，B1–B5）**：`src/platform/` 五接縫 `imageStore`／`linkOpener`（B1）／`linkPreview`（B2）／`fileStore`（B3）／`quickCapture`（B5）已收攏 renderer 對 Electron IPC 的直接依賴。**`load-document`／`open-document`（死碼）與 `save-document`／「儲存」鈕整條已於 2026-07-25 退場**（原 B4 `documentIO` 接縫連同移除）。剩餘殘留：`saveImage` 有兩處呼叫端（BackupPanel／useImageMigration）未走 imageStore。詳見 [electron-ipc.md](electron-ipc.md#平台抽象層srcplatform-pwa-遷移進度)。

## 建置與測試（無虞）

| 技術 | 角色 | 可行性 |
|---|---|---|
| **Vite 7.1 + plugin-react-swc** | 建置 | 極佳、快；**同一份碼出 web/PWA target 幾乎零成本**。同 repo 併行桌面+PWA 正合適 |
| **Vitest 3.2 + jsdom** | 測試 | 穩；純函式+jsdom 目前 426 案例。**tldraw/事件行為測不到 → 靠 CDP 實機**（見 [testing-strategy.md](testing-strategy.md)、[skill run-desktop]）|
| **TypeScript 5.8 / ESLint 9** | 型別/lint | 標準、無風險。型別驗證用 `npm run build`（`tsc -b`），別只 `--noEmit` |

## 功能庫（絕大多數可攜）

| 技術 | 角色 | 可行性 |
|---|---|---|
| **@dnd-kit** | 側欄/資料夾拖拉 | 純 web、可攜 |
| **@tanstack/react-virtual** | 卡片庫虛擬滾動 | 純 web、可攜；手機長列表更需要 |
| **react-force-graph-2d** | 知識圖譜 | Canvas、純 web、可攜；偏重 → **手機端大概不上圖譜**（roadmap：手機只讀+簡單編輯）|
| **katex**（+19 woff2 字型） | LaTeX 區塊 | 純 web、可攜；PWA 端字型改從 server 載 |
| **lowlight** | 程式碼高亮 | 純 JS、可攜 |
| **jspdf** | PDF 匯出 | 純 web、可攜；桌面功能，手機可略 |
| **react-textarea-autosize** | 輸入框 | 瑣碎、可攜 |

---

## tldraw 授權（2026-07-19 查清）

以本專案的處境（**自用、非商業、Electron 桌面安裝版、tldraw 3.x**）：

- **預設（無 license key）＝只准「開發環境」。** 打包成安裝版執行即屬「Production Environment」，嚴格說需要 license key；無 key 時畫布顯示「made with tldraw」浮水印（現況：App 未放 key，畫布已顯示浮水印）。
- **自用/非商業 → 適用免費「Hobby license」**：填表申請、tldraw 審核發放；個人不販售的工具符合。**條件＝保留「made with tldraw」浮水印**。
- License key **client-side 離線驗證、可離線運作**（Electron 與未來 PWA 皆適用）。
- **合規動作（零成本）**：申請 hobby key → 塞進 `<Tldraw licenseKey=… />`。浮水印留著即合規。
- **唯一付費情境**：日後**公開/商用且要去浮水印** → 商用 license（value-based、聯絡 sales，有 100 天試用）。
- **PWA 影響**：同一 SDK 同一 key；但行動端不跑畫布（讀 snapshot JSON）＝手機端不觸發浮水印，只桌面留浮水印。
- 來源：tldraw.dev `/pricing`、`/community/license`、GitHub `LICENSE.md`。

**結論：此未知數已清除——非阻礙、零成本，補一把免費 key 即合規，浮水印為可接受代價。**

## 剩餘要盯的風險（不是選型，是工程）

1. **Supabase 同步層（最大）** — 全新、風險最高。建議照 roadmap 先做 **S0+S1** 走通「本機↔雲↔手機」最小鏈路驗架構，再往上疊。
2. **Electron IPC 抽象化：主體已完成（B1–B5，2026-07-23）** — renderer 對 IPC 的直接依賴已收進 `src/platform/` 六接縫並補 web fallback。死碼 load/open-document 已於 2026-07-25 清除；剩餘僅 `saveImage` 兩處呼叫端未走 imageStore（見 electron-ipc.md）。

## 待確認 / 待評估項

- TipTap 2 → 3 遷移的必要性與時機（目前 2.27 穩定、無急迫）。
- Supabase 同步的**衝突粒度**是否要從「整板 LWW」升級為「卡片級合併」（roadmap 列為後續優化）。
- 舊 vault 殘留 base64 圖片對同步 payload 的膨脹（初版可不同步大圖／設上限）。

## 相關文件
- [roadmap-mobile.md](roadmap-mobile.md) — 行動端/同步階段計畫（S0–S3）與風險表
- [adr/0006-cloud-sync-and-mobile.md](adr/0006-cloud-sync-and-mobile.md) — 雲端同步與行動端決策
- [architecture.md](architecture.md) — 系統分層與資料流
- [data-model.md](data-model.md) / [tldraw-snapshot.md](tldraw-snapshot.md) — 同步單位（BoardRecord + snapshot）的資料結構
