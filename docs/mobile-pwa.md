# 手機速記 PWA（S1）

> 文件日期：2026-07-27
> 相關：[roadmap-mobile.md](roadmap-mobile.md)（階段計畫）／[cloud-sync-setup.md](cloud-sync-setup.md)（Supabase 設定）

手機端的第一階段：**登入 → 打字 → 送出 → 進桌機收件匣**。

沒有畫布、沒有白板清單、不能改既有卡片——那些是 S2／S3。範圍縮到這麼小是刻意的：
最高頻的痛點只有一個「人在外面想記一下」，而那件事最怕流程長、開得慢。

---

## 1. 它是什麼

同一個 repo 的第二個 Vite 進入點：

| | 桌機 | 手機 |
|---|---|---|
| HTML | `index.html` | `mobile/index.html` |
| 進入點 | `src/main.tsx` | `src/mobile/main.tsx` |
| 設定檔 | `vite.config.ts` | `vite.config.mobile.ts` |
| 產物 | `dist/`（Electron 載入） | `dist-mobile/`（純靜態網站） |
| 體積 | ~3.5 MB | ~419 kB（gzip 121 kB） |

手機端**不跑 tldraw**——卡片就是 snapshot JSON 裡的一筆記錄，用既有的純 JSON 工具讀寫就好
（`utils/snapshot.ts`、`utils/snapshotCards.ts` 對 tldraw 都只有 type-only 依賴）。
這是 roadmap-mobile 第 2 節那個判斷的實際兌現。

### 共用的程式碼

| 模組 | 兩端都用它做什麼 |
|---|---|
| `src/sync/syncConfig.ts` | 連線設定（含 `normalizeSupabaseUrl` 那個 `/rest/v1` 的坑） |
| `src/sync/supabaseClient.ts` | 登入、session、錯誤訊息轉中文 |
| `src/sync/boardSync.ts` | `pullBoard` / `pushBoard` |
| `src/utils/quickCaptureCard.ts` | **建立一張文字卡**——桌機快速捕捉與手機速記的唯一實作 |
| `src/constants.ts` | `INBOX_BOARD_ID`（兩端同一個 id，所以手機寫的卡直接落在桌機收件匣） |

`quickCaptureCard.ts` 是特地抽出來的：兩邊各寫一份的話，卡片 props 只要有一欄對不上，
症狀會是「手機記的東西在桌機顯示怪怪的」，而且極難查。

---

## 2. 建置與部署

```bash
npm run build:mobile     # → dist-mobile/（tsc -b + vite build）
npm run dev:mobile       # 開發用，port 5174，已開對外
```

`dist-mobile/` 是純靜態檔，**全部用相對路徑**（`base: './'`），所以丟到任何靜態主機都能跑，
放在子路徑（`https://example.com/astrolabe/`）也不必改設定。

### 正式部署（建議 HTTPS）

Service worker 與「加到主畫面」**需要安全來源**（HTTPS，或 localhost）。
在 `http://192.168.x.x` 上功能都正常，但裝不成獨立 App、也沒有離線開啟能力。

任選一個靜態主機，把 `dist-mobile/` 整個資料夾丟上去即可：

- **Netlify**：把資料夾拖進 netlify.com/drop，即得一個 HTTPS 網址
- **Vercel**：`npx vercel dist-mobile --prod`
- **GitHub Pages**：把 `dist-mobile/` 推到 `gh-pages` 分支
- **Cloudflare Pages**：連 repo，build 指令 `npm run build:mobile`、輸出目錄 `dist-mobile`

⚠️ 部署後任何人都能開那個網址，但**看不到任何資料**——所有內容都要登入才拿得到，
而資料存取由 Supabase 的 RLS 把關（見 `supabase/schema.sql`）。anon key 本來就是設計上可公開的值。

### 區網快速試（不必先找主機）

```bash
npm run build:mobile
npx vite preview --config vite.config.mobile.ts --host 0.0.0.0 --port 4173
```

手機連同一個 Wi-Fi，開 `http://<桌機區網IP>:4173/`。
連不上多半是 Windows 防火牆擋了 node 的入站連線。

---

## 3. 手機上怎麼用

1. 開網址 → 「☁️ 連線設定」
2. 填**與桌機同一組** Project URL 與 anon key（Supabase 後台 Project Settings → API）
3. 用同一個帳號登入
4. 之後每次開啟直接是速記畫面（session 存 localStorage，不必重登）

打字 → 按「送到收件匣」 → 桌機的收件匣就會多一張文字卡。

---

## 4. 送不出去的時候會怎樣（這是重點）

**打完字按送出，那段文字就不會再弄丟。** 流程一律是：

1. 先寫進本機 outbox（localStorage，同步完成、不會失敗）
2. 再試著沖到雲端；**失敗就留著**，下次開啟或恢復連線時自動重送

畫面上會顯示「還沒送出去的（N）」清單與「N 待送」標記。人在外面沒訊號時照樣記，
有訊號時自動補送——這是整個 App 唯一真正重要的性質，`src/mobile/mobileCapture.test.ts`
的 10 個案例大半都在測它。

**送出時一定是「先拉雲端最新的 → 在它上面追加 → 整塊推回去」**，不是拿手機上的舊版本改了就推。
少了這步，桌機這段期間加進收件匣的卡會被手機整批蓋掉（整板 last-write-wins 的代價）。

---

## 5. 已知限制

| 限制 | 說明 |
|---|---|
| 只能新增，不能看/改 | 看全部白板是 S2、簡單編輯是 S3 |
| 只進收件匣 | 不能選白板；分類在桌機用 Inbox Triage 做 |
| 純文字 | 沒有圖片、待辦、標籤（圖片要等 Supabase Storage） |
| http 下無法安裝 | Service worker 需要 HTTPS；區網 http 只能當網頁用 |

### ⚠️ 一個帳號只該綁一份 vault

`home_board` 與 `inbox_board` 是**跨 vault 共用的固定 id**（`src/constants.ts`）。
兩份不同的 vault 連上同一個 Supabase 專案時，這兩塊板會被視為同一塊而互相覆蓋
（其他白板的 id 帶時間戳，不會撞，但會全部混在同一個側邊欄）。

實務上要注意的是：**打包後的 App 與 `ELECTRON_PROD_TEST=1` 用同一個 file:// 儲存 origin＝同一份 vault**，
而 `npm run dev`（Vite dev server，localhost origin）是**另一份**。
不要讓開發用的那份也連同一個 Supabase 專案。
