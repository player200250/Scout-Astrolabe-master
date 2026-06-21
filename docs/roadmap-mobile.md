# Scout Astrolabe 行動端與雲端同步路線圖

> 文件日期：2026-06-21
> 定位前提：**自用工具**（非商業產品，無護城河包袱）
> 架構決策：見 [adr/0006-cloud-sync-and-mobile.md](adr/0006-cloud-sync-and-mobile.md)（修正 0005 本機優先方向）

---

## 1. 緣起與需求

使用者的實際痛點：**「軟體只在桌機，人帶著手機在外面時用不到。」**

關鍵限定詞是「**在外面**」——這直接排除了 [roadmap-v2.md](roadmap-v2.md) 的 **S2 LAN Sync**（只在同一 Wi-Fi 有效）。要在外網存取桌機資料，資料**必須**經過網際網路。

確認的需求範圍：

| 項目 | 決定 | 理由 |
|------|------|------|
| 手機端能力 | **看全部 + 簡單編輯**（文字/待辦/標籤/狀態/優先級），**不做畫布** | 6 吋手機操作 tldraw 無限畫布體驗極差；在外只需「讀 + 速記 + 改字 + 打勾」 |
| 同步方式 | **輕量雲端（方案 B）** | 自用、隱私包袱小；桌機可關機、隨開隨用，命中「方便」痛點。非 Tailscale（桌機需常開） |
| 衝突策略 | 初版**整板 last-write-wins**（比 `updatedAt`） | 單人雙裝置，真同時改同板機率低；同步前自動備份兜底 |
| 後端 | **Supabase**（Postgres + Auth + 免費額度） | 自用額度綽綽有餘，免自架維運 |

---

## 2. 核心技術現實

卡片資料**不是**正規化資料表，而是內嵌在每張白板的 **tldraw snapshot JSON**（卡片 = snapshot store 內的 `card` shape，型別見 [card-shape-spec.md](card-shape-spec.md)）。

- ✅ **好處**：手機端**不需要跑 tldraw**，用既有工具（`getCardShapes` / `toMutableSnapshot` / `getSnapshotStore` / `utils/snapshotCards`）即可純 JSON 讀寫卡片。
- ⚠️ **限制一**：`file` 卡存的是桌機本機路徑（`storedName`），手機**無法開啟檔案**——初版僅顯示檔名。
- ⚠️ **限制二**：`image` 卡以 base64 內嵌於 snapshot，同步體積會膨脹——初版可選擇不同步大圖或延後優化。

同步單位：整個 `BoardRecord`（含 snapshot）。雲端 `boards` 表鏡像本機 schema（見 [data-model.md](data-model.md)）。

---

## 3. 階段計畫

| 階段 | 內容 | 產出 | 估時 |
|------|------|------|------|
| **S0 平台抽象 + 同步骨幹** | (a) 把 Electron 專屬呼叫（`window.electronAPI`、檔案 IPC）收進 `src/platform/` 抽象層，web 端走 fallback（= roadmap-v2 P1）。(b) 桌機接 Supabase：推本機變更、拉遠端變更、輪詢更新 `boards` state；單帳號 + RLS | 桌機資料能上雲、能拉回 | 3–4 天 |
| **S1 手機捕捉** | 極簡 PWA：登入 → 速記丟進收件匣 → 同步回桌機 | **出門速記**（命中最大痛點） | 1.5 天 |
| **S2 手機檢視** | PWA 讀全部白板、列出卡片（複用桌機卡片擷取邏輯）；唯讀 | 在外**查全部** | 2 天 |
| **S3 手機簡單編輯** | 改文字、勾待辦、改標籤/狀態/優先級 → patch 回 snapshot → 同步 | **看全部 + 簡單編輯** 達成 | 2–3 天 |

**合計約 9–12 天**，是全專案最大的一塊。

**共用程式碼**：手機 PWA 放進**同一個 repo**，用 Vite web target 編譯，直接 import 桌機的 snapshot 工具。這同時把 roadmap-v2 的 **X2（Web PWA）+ P1（平台抽象）** 一併帶到。

---

## 4. 開發順序建議

**先做 S0 + S1**（同步骨幹 + 出門速記）作為 MVP：

1. 能立刻爽到（出門速記是最高頻需求）
2. 走完整條「本機 ↔ 雲 ↔ 手機」鏈路，驗證架構可行性
3. 風險最高的同步骨幹先穩，S2/S3 再往上疊

S2/S3 在 S0 穩定後再做。

---

## 5. 風險與緩解

| 風險 | 說明 | 緩解 |
|------|------|------|
| 桌機回填遠端編輯 | 手機改了某板，桌機需在切換/聚焦/輪詢時重載該板 snapshot；若該板正開著編輯，遠端較新時要**提示而非靜默覆蓋** | 切換板時拉取；活躍板偵測到遠端較新 → 提示重載 |
| 整板 LWW 粒度粗 | 兩端同時改同一張板會丟其中一邊 | **同步前自動備份**（複用既有 30 份備份機制）；之後可升級為卡片級合併 |
| 同步體積（image base64） | 大圖卡膨脹 payload | 初版不同步大圖／設上限；之後改存物件儲存（Supabase Storage） |
| `file` 卡跨裝置 | 手機無桌機檔案路徑 | 初版只顯示檔名，不提供開啟 |
| 隱私（資料上雲） | 違反原 local-first 承諾 | 自用情境已接受；見 ADR 0006。仍保持「本機 IndexedDB 為 ground truth、雲為同步層」 |

---

## 6. 與 roadmap-v2 的關係

本計畫**取代/具體化** roadmap-v2 中以下項目，請以本文件為準：

- **S2 LAN Sync** → 廢棄（外網場景無效），由本計畫雲端同步取代
- **X2 Web PWA** → 併入本計畫 S0/S1（PWA 即手機端載體）
- **P1 平台抽象層** → 即本計畫 S0(a)
- **M4 React Native 行動端** → **降級/取消**：自用不需原生全功能客戶端，PWA「看全部 + 簡單編輯」已滿足
- **S1 雲端備份（Google Drive 等）** → 與本計畫雲端同步部分重疊，可後續整併

---

## 相關文件

- [adr/0006-cloud-sync-and-mobile.md](adr/0006-cloud-sync-and-mobile.md) — 架構決策（修正 0005）
- [adr/0005-local-first-product-direction.md](adr/0005-local-first-product-direction.md) — 原本機優先方向
- [data-model.md](data-model.md) — BoardRecord / IndexedDB schema
- [tldraw-snapshot.md](tldraw-snapshot.md) — snapshot 讀寫
- [card-shape-spec.md](card-shape-spec.md) — 卡片型別
- [roadmap-v2.md](roadmap-v2.md) — 主路線圖
