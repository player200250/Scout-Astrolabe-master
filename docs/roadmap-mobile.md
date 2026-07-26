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
- ⚠️ **限制二**：`image` 卡體積。桌面端已由 **TD-IMG** 治本（改存 `userData/files`，snapshot 只留 `storedName`、`image:null`；`imageStore.ts` 是 PWA S0(a) 平台抽象的首個落地）。但 PWA 端無 `userData` 檔案系統，需把圖片接到 **Supabase Storage**（storedName ↔ 雲端物件 key）；舊 vault 中尚未遷移的殘留 base64 仍會膨脹同步體積，初版可選擇不同步大圖或延後優化。

同步單位：整個 `BoardRecord`（含 snapshot）。雲端 `boards` 表鏡像本機 schema（見 [data-model.md](data-model.md)）。

---

## 3. 階段計畫

| 階段 | 內容 | 產出 | 估時 |
|------|------|------|------|
| **S0 平台抽象 + 同步骨幹** | (a) ✅ 已完成（`c438395`）把 Electron 專屬呼叫收進 `src/platform/`。(b) 🟡 **探路段已完成（2026-07-26）**：`src/sync/` + 雲端同步面板，手動推一塊板／拉回、單帳號 + RLS。**尚未做**：自動同步、輪詢、全量同步、衝突提示 | 桌機資料能上雲、能拉回 | 3–4 天 |
| **S1 手機捕捉** | 極簡 PWA：登入 → 速記丟進收件匣 → 同步回桌機 | **出門速記**（命中最大痛點） | 1.5 天 |
| **S2 手機檢視** | PWA 讀全部白板、列出卡片（複用桌機卡片擷取邏輯）；唯讀 | 在外**查全部** | 2 天 |
| **S3 手機簡單編輯** | 改文字、勾待辦、改標籤/狀態/優先級 → patch 回 snapshot → 同步 | **看全部 + 簡單編輯** 達成 | 2–3 天 |

**合計約 9–12 天**，是全專案最大的一塊。

### S0(b) 進度（2026-07-26）

**已完成（探路段）**——目標是先證明整條 本機 → Supabase → 本機 的鏈路在真實服務上通得了，故刻意只做手動動作、不碰既有存檔流程：

| 產出 | 說明 |
|------|------|
| `supabase/schema.sql` | 雲端 `boards` 表（鏡像 `BoardRecord`）＋ RLS 政策＋索引。可重複執行 |
| `src/sync/syncConfig.ts` | 連線設定存 localStorage（不用 `.env`＝改設定免重 build，金鑰不進 git，日後 PWA 同一套填法） |
| `src/sync/supabaseClient.ts` | lazy client（設定變更可重建）＋ email/密碼登入＋常見錯誤轉中文 |
| `src/sync/boardSync.ts` | `pushBoard` / `pullBoard` / `listRemoteBoards` / `deleteRemoteBoard`＋純函式 `toRemoteRow`／`fromRemoteRow`／`decideSync`（整板 LWW） |
| `src/components/CloudSyncPanel.tsx` | 側邊欄 ⋯ →「☁️ 雲端同步」：填設定 → 登入 → 推 / 列 / 取回 → 明確確認後才覆蓋本機 |
| [cloud-sync-setup.md](cloud-sync-setup.md) | 使用者端的五步設定指南 |

**尚未做（S0(b) 後續）**：自動同步（存檔後推）、輪詢拉取、全量同步（目前一次一塊板）、活躍板遠端較新時的提示、`deletedAt` 軟刪除的雙向套用、圖片接 Supabase Storage。

**設計取捨備忘**：
- `updated_at` 用**本機的 epoch 毫秒**存成 `bigint`，不是 `timestamptz`——兩端比大小才不會有時區/精度問題。
- `decideSync` 只比 `updatedAt`，**不比 snapshot 內容**：tldraw snapshot 的鍵順序不保證穩定，逐欄比對會一直誤判成有差異。
- 覆蓋本機做成「先取回預覽 → 再按覆蓋」兩步，且覆蓋後 `window.location.reload()`——探路階段不處理「畫布正開著這塊板」的即時換頁。

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
| 整板 LWW 粒度粗 | 兩端同時改同一張板會丟其中一邊 | **同步前自動備份**（複用既有自動備份機制，現保留 5 份）；之後可升級為卡片級合併 |
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
