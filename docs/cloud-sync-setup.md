# 雲端同步設定指南（Supabase）

> 對象：第一次設定的人。全程約 5 分鐘、免費方案就夠。
> 這份是**操作步驟**；設計決策見 [ADR 0006](adr/0006-cloud-sync-and-mobile.md)、階段計畫見 [roadmap-mobile.md](roadmap-mobile.md)。

## 這一步要達成什麼

S0(b) 的**探路階段**：把一塊白板推上雲、再拉回來。
**不會**自動同步、**不會**動到平常的存檔流程——先確認整條鏈路在真實服務上跑得通，再往上疊。

---

## 步驟

### 1. 建立 Supabase 專案

1. 到 <https://supabase.com> 註冊/登入（可用 GitHub 帳號）
2. **New project** → 填專案名稱（例：`scout-astrolabe`）
3. **Database Password** 隨便設一組強密碼並記下來（這是資料庫的密碼，**不是**待會登入 App 用的）
4. Region 選離自己近的（例：Northeast Asia (Tokyo)）
5. 按 **Create new project**，等 1～2 分鐘佈建完成

### 2. 建立資料表（貼 SQL）

1. 左側選單 → **SQL Editor** → **New query**
2. 把本 repo 的 [`supabase/schema.sql`](../supabase/schema.sql) **整份**貼進去
3. 按 **Run**（右下角）
4. 看到 `Success. No rows returned` 就對了

> 這份 SQL 可以重複執行，改壞了再貼一次即可。
> 它同時建立 **RLS 政策**——沒有這段的話，任何拿到 anon key 的人都能讀寫你的白板。

### 3. 建立登入用帳號

1. 左側選單 → **Authentication** → **Users** → **Add user** → **Create new user**
2. 填 Email 與密碼（這組是**待會在 App 裡登入用的**）
3. 勾選 **Auto Confirm User**（否則會卡在「Email 未驗證」）
4. 按 **Create user**

### 4. 複製兩個值

左側選單 → **Project Settings** → **API**：

| 要複製的 | 長相 |
|---------|------|
| **Project URL** | `https://xxxxxxxxxxxx.supabase.co`（**只要 origin，後面別帶 `/rest/v1` 之類的路徑**；真的帶了 App 也會自動砍掉） |
| **anon public** key | `eyJhbGciOiJIUzI1NiIs...`（很長一串） |

> anon key 是**設計上可公開**的值（它會被打包進 App），安全性完全靠步驟 2 的 RLS。
> 別複製到 `service_role` key——那把鑰匙可以繞過 RLS，不能放進前端。

### 5. 在 App 裡填入並登入

1. 開啟 App → 右側邊欄底部 **⋯（更多）** → **☁️ 雲端同步**
2. 貼上 **Project URL** 與 **anon key** → 按「儲存設定」
3. 填步驟 3 建立的 **Email / 密碼** → 按「登入」
4. 標題列右上出現「已連線」＝成功

---

## 驗證整條鏈路

登入之後**自動同步預設就是開的**（面板「3. 自動同步」）：存檔 4 秒後推上雲、每 60 秒拉一次遠端變更。
狀態列會顯示「已同步 · 幾分鐘前」／「N 塊待上傳」／錯誤訊息。想確認一切正常，按一次
**⟳ 立即完整同步** 最快。

要逐段拆開驗證的話，用「4. 手動推 / 拉（進階）」區塊：

1. 切到任一塊白板 → 回到面板按 **⬆ 推送目前白板**
   → 應出現「已推送『◯◯』到雲端」
2. 按 **🔄 列出雲端白板**
   → 應看到剛推的那塊，標示「一致」
3. 按該列的 **⬇ 取回**
   → 顯示取回的卡片數／更新時間，確認與本機一致
4. （可選）按 **⚠ 以此覆蓋本機並重載** 走完最後一段
   → 這是唯一的破壞性動作，會跳確認並比對兩邊時間

也可以到 Supabase 後台 **Table Editor → boards** 直接看到那一列。

---

## 疑難排解

| 症狀 | 原因與處理 |
|------|-----------|
| 登入時「Email 或密碼錯誤」 | 帳號是在 **Authentication → Users** 建的那組，不是資料庫密碼 |
| 「這個帳號還沒完成 Email 驗證」 | 建 user 時沒勾 Auto Confirm。後台把該 user 的 email_confirmed 設起來即可 |
| 「連不上 Supabase」 | Project URL 打錯（要含 `https://`、結尾是 `.supabase.co`），或網路不通 |
| 登入時 console 出現 `/rest/v1/auth/v1/token 404` | Project URL 貼到帶路徑的 Data API endpoint（`https://xxx.supabase.co/rest/v1`）。App 現在會自動砍掉路徑只留 origin，舊設定重按一次「儲存設定」即可 |
| 推送時 `new row violates row-level security policy` | 沒登入，或 schema.sql 沒跑完整。重跑步驟 2 |
| 推送時 `relation "public.boards" does not exist` | 步驟 2 的 SQL 沒執行成功 |
| 狀態列顯示「已登出，請重新登入」 | session 過期且刷新失敗（多半是長時間離線）。在「2. 登入」重新登入即可，待上傳的白板不會遺失 |
| 狀態列顯示「「◯◯」推不上去：…」 | **只有那一塊**有問題，其他白板與拉取都照常運作。多半是該板過大（縮圖＋snapshot）或內容異常；先看看能不能精簡那塊板 |

---

## 目前的範圍與限制

- **同步單位是整塊白板**（含 snapshot），衝突策略為整板 last-write-wins（比 `updatedAt`）。
  兩端同時改同一塊板會丟其中一邊；**你正開著的那塊板不會被自動覆蓋**，遠端較新時會跳提示讓你決定
- **縮圖是 data URL 直接存**，大白板的列會偏大；圖片卡的實體檔還沒接 Supabase Storage
  （手機端因此看不到圖片卡的內容）
- **本機 IndexedDB 仍是 ground truth**，雲端只是同步層；不啟用同步時 App 行為完全不變
- ⚠️ **一個 Supabase 專案只該綁一份 vault**：`home_board`／`inbox_board` 是跨 vault 共用的固定 id，
  兩份 vault 連同一個專案時這兩塊會互相覆蓋。注意**打包後的 App 與 `ELECTRON_PROD_TEST=1`
  是同一份 vault**（同 file:// origin），而 `npm run dev` 是另一份
- 手機端設定見 [mobile-pwa.md](mobile-pwa.md)（填同一組 URL / anon key、同一個帳號）
