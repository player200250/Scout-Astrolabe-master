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
- ⚠️ **限制二**：`image` 卡體積。桌面端已由 **TD-IMG** 治本（改存 `userData/files`，snapshot 只留 `storedName`、`image:null`；`imageStore.ts` 是 PWA S0(a) 平台抽象的首個落地）。**桌機之間的圖片同步已完成**（`src/sync/imageSync.ts`，見下方「圖片接 Supabase Storage」）。**PWA 端仍看不到圖**：手機沒有 `userData` 檔案系統也沒有 `electronAPI`，`canSyncImages()` 回 false ⇒ 整條路徑是 no-op；手機要看到圖屬於 S2（手機讀全部）。

同步單位：整個 `BoardRecord`（含 snapshot）。雲端 `boards` 表鏡像本機 schema（見 [data-model.md](data-model.md)）。

---

## 3. 階段計畫

| 階段 | 內容 | 產出 | 估時 |
|------|------|------|------|
| **S0 平台抽象 + 同步骨幹** | (a) ✅ 已完成（`c438395`）把 Electron 專屬呼叫收進 `src/platform/`。(b) ✅ **已完成（2026-07-27）**：探路段（手動推拉）＋自動同步引擎（存檔後推送／輪詢拉取／全量同步／活躍板提示／軟刪除雙向） | 桌機資料能上雲、能拉回 | 3–4 天 |
| **S1 手機捕捉** | ✅ **已完成（2026-07-27）**：極簡 PWA，登入 → 速記丟進收件匣 → 同步回桌機。**2026-07-29 補上部署**：GitHub Actions → GitHub Pages（`https://player200250.github.io/Scout-Astrolabe-master/`），在此之前只能用區網 preview＝要桌機開著＋同一 Wi-Fi，且 http 下註冊不了 service worker。見 [mobile-pwa.md](mobile-pwa.md) | **出門速記**（命中最大痛點） | 1.5 天 |
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

**端到端已驗（2026-07-26，真實 Supabase 專案）**：推一塊有內容的板（6 張卡／6 種型別／18KB 縮圖）→ 列出雲端 → 取回，逐項比對本機 IndexedDB 與雲端列：`name`／`updated_at`／卡片數／卡片型別／縮圖**全部一致**；snapshot 的 `JSON.stringify` 逐字元**不相同**但**遞迴排序鍵後完全相同**（4294 bytes）——即 Postgres `jsonb` 只重排鍵、沒有掉資料。**這正好證實 `decideSync` 只比 `updatedAt`、不比 snapshot 內容的設計是必要的**：逐字元比對必然誤判成有差異。

**設定時踩到的坑（已修）**：Project URL 若貼成 Data API endpoint（`https://xxx.supabase.co/rest/v1`），supabase-js 會再接一段而組出 `/rest/v1/auth/v1/token` → 登入 404。`normalizeSupabaseUrl()` 現在一律砍成 origin，並自動補 scheme。

### S0(b) 後續五項 ✅ 已完成（2026-07-27）

探路段之上加了一層**自動排程**。所有網路動作仍然只走 `boardSync.ts`，新的 `syncEngine.ts`
只負責「什麼時候該推什麼、拉回來的東西怎麼套用才不會毀掉使用者正在做的事」。

| 項目 | 做法 |
|------|------|
| **1. 存檔後自動推送** | `utils/boardDb.ts` 的 `saveBoard` 是全庫唯一的白板持久化入口，通知就掛在那裡（寫入**之後**、`try/catch` 吞掉＝同步出事絕不影響本機存檔）。4 秒去抖，避免把 tldraw 密集存檔的每個中間狀態都送上雲 |
| **2. 輪詢拉取** | 60 秒一輪；視窗回到前景／恢復連線時另外補一次（視窗被遮蔽時 Chromium 會節流計時器） |
| **3. 全量同步** | `syncNow()`：推完所有 dirty 板再拉回雲端較新的。面板上的「⟳ 立即完整同步」 |
| **4. 活躍板提示** | 正在開著的板遠端較新時**只發提示、不覆蓋**，使用者按「立即載入」才套用。同一個遠端版本只提示一次 |
| **5. 軟刪除雙向** | 刪除／還原都推進 `updatedAt`（否則刪除會輸給另一端較新的普通編輯而復活）；永久刪除推一列**墓碑**而非刪掉雲端列 |

**新增檔案**：`src/sync/syncState.ts`（哪些板還沒推，綁 userId 存 localStorage）／`syncEngine.ts`（排程與套用規則）／`syncStatus.ts`（狀態型別與顯示文字）／`src/hooks/useCloudSync.ts`（引擎 ↔ React state 的翻譯層）。

**三個容易做錯、已用測試釘住的地方**（`syncEngine.test.ts`）：

1. **推送失敗不能記成已推**——記錯的話那塊板從此再也不會上傳，而且毫無徵兆。
2. **本機刪掉的板不能被拉回來**——「雲端有、本機沒有 ⇒ 拉回」的直覺會讓刪掉的板自己長回來。
   判斷依據是 `pushed[id]` 有紀錄＝我們曾經有過它；安全閥是雲端版本若比我們最後推的還新，
   代表另一台裝置又改過它，照常拉回不當成刪除。
3. **套用雲端資料一律直接寫 `db`，不走 `saveBoard`**——後者會回頭通知引擎，把剛拉回來的東西再推一次。

### 韌性與流量的三項補強（2026-07-27，設計檢討後）

上線後逐項檢視缺點，補掉三個「我們自己造成的」問題（另外兩個大的——整板 LWW 與時鐘決定勝負——是架構層限制，見下方風險表）：

| 問題 | 症狀 | 修法 |
|------|------|------|
| **一塊壞板卡住全部** | `pushPhase` 遇到第一個失敗就中止整輪，連拉取都不跑。一塊推不上去的板（太大／資料壞掉／撞 RLS）會讓**其他所有板永遠同步不了**，畫面上只有一個籠統的錯誤 | 改成逐塊嘗試、失敗記下後繼續；推送失敗仍照常拉取（拉是唯讀的）。錯誤訊息改成指名道姓：`「專案文件」推不上去：資料太大` |
| **登出看起來像沒設定** | 拿不到 userId 就回 `phase: 'disabled'`，與「從沒填過設定」同一句「未啟用」。token 長期離線刷新失敗時，同步靜靜停掉而面板毫無線索 | 新增 `signed-out` 階段＝「已登出，請重新登入」，並列入 `isSyncAttention`（顯眼提示） |
| **縮圖佔了 85% 流量** | 實測一塊板 8 KB 內容配 **57 KB 縮圖**（17 塊板合計 506 KB，縮圖是大宗）。整列 upsert 表示改一個字就重傳整張圖 | `syncState` 記縮圖指紋（djb2），沒變就從 payload **省略 `thumbnail` 欄位**——upsert 語意下等於保留雲端現值。⚠️ 雲端還沒有那列時不能省（會 INSERT 成 null），`isThumbnailUnchanged` 要求指紋有紀錄，正好涵蓋此條件 |

**尚未做**：（同步層的已知缺口都已處理，見下方各節）

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
| 桌機回填遠端編輯 | 手機改了某板，桌機需在切換/聚焦/輪詢時重載該板 snapshot；若該板正開著編輯，遠端較新時要**提示而非靜默覆蓋** | ✅ 已實作：`syncEngine` 跳過活躍板、改發 `sync-remote-newer` 事件 → 帶「立即載入」按鈕的提示 |
| **一個帳號綁到兩份 vault** | `home_board`／`inbox_board` 是跨 vault 共用的固定 id，兩份 vault 連同一個 Supabase 專案時這兩塊會互相覆蓋 | 一個 Supabase 專案只綁一份 vault。⚠️ 打包後的 App 與 `ELECTRON_PROD_TEST=1` 是**同一份** vault（同 file:// origin），`npm run dev` 是**另一份** |
| 整板 LWW 粒度粗 | 兩端同時改同一張板會丟其中一邊 | ✅ 已解：卡片級三方合併（見下節）。同步前自動備份仍在（保留 5 份） |
| 同步體積（image base64） | 大圖卡膨脹 payload | ✅ 已解：TD-IMG 之後 snapshot 只留 `storedName`，圖片本體走 Supabase Storage（見下節） |
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

---

## 圖片接 Supabase Storage（2026-08-02 完成）

**問題**：TD-IMG 之後 `image` 卡的 snapshot 只留 `props.storedName`，實體檔在
`userData/files/<storedName>`。同步只搬 snapshot ⇒ **另一台裝置拿到的是一個指向它沒有的
檔案的名字**，畫面上是破圖，而且完全沒有錯誤訊息可查。

**做法**（`src/sync/imageSync.ts`）：實體檔上傳到 Storage 的 `card-images` bucket，
物件路徑 `<user_id>/<storedName>`。**路徑第一層就是 RLS 的判斷依據**——政策用
`storage.foldername(name)[1]` 比對 `auth.uid()`（見 `supabase/schema.sql` 最後一段）。

| 時機 | 動作 |
|------|------|
| 推送前 | `collectImageNames(snapshot)` → 沒上傳過的上傳。記錄存 `syncState.uploadedImages` |
| 拉取後 | 同上收集 → 本機沒有的下載回來，**沿用原本的 storedName** |

**兩個順序是相反的，而且都是刻意的**：

- **推送：圖片先、白板列後，圖片失敗就不推這塊板。** 反過來會讓另一台在空窗期拉到破圖；
  更糟的是 board 一旦記進 `pushed[]` 就不再 dirty，補圖的機會也跟著沒了。
- **拉取：白板列先、圖片後，圖片失敗仍照常套用。** 文字與位置本身就有價值，不該被一張圖
  中斷。`downloadMissingImages` **不記錄下載過什麼**，每輪都以「本機檔案在不在」為準
  ⇒ 自我修復（手動刪掉 `userData/files` 的檔，下一輪會補回來）。

**為什麼上傳可以只記一次就永遠有效**：`storedName` 是 uuid + 副檔名且**內容不可變**
（換一張圖 = 換一個 storedName），不會出現「同名但內容變了」。

**新增的三個 Electron IPC**：`has-stored-file` / `read-stored-file` / `write-stored-file`。
⚠️ 既有的 `save-image` **不能重用**——它一律自己產生新的 uuid 名字，而下載回來的圖
必須沿用原名，否則 snapshot 裡的參照就對不上。三個都用 `path.basename` 淨化（同 `astro-img` handler）。

**刻意的邊界**：
1. **只管 `image` 卡**。`file` 卡雖然也用 `storedName`、也在同一個資料夾，但大小無上限
   （可以是一支 500MB 的影片）。要不要同步是另一個決定。
2. **不刪雲端的孤兒物件**。卡片刪掉後 Storage 那份會留著，與墓碑列的 GC 一起處理。
3. **PWA 不在這條路徑上**（見上方限制二）。

⚠️ **升級後必須到 Supabase 的 SQL Editor 重跑一次 `supabase/schema.sql`**，否則
所有含圖片的板都會推不上去。`describeStorageError` 已把 `Bucket not found` 轉成這句話——
刻意不從程式自動建 bucket，那需要 service role key，而整個設計只帶 anon key。

---

## 還原備份不再刪掉雲端的板（2026-08-02 修）

**風險**：`handleRestore` 走 `db.clear()` 灌入備份，**繞過了 `deleteBoard`**。
於是「備份裡沒有、但雲端有」的板，在還原之後只是**本機不存在**而已。
而同步引擎判斷「本機刪掉了」的依據是三件事同時成立：

    雲端有 ＋ 本機沒有 ＋ syncState 記得我們推過它

記錄還在 ⇒ 這些板被判成本機已刪 ⇒ **推墓碑 ⇒ 雲端與另一台裝置上的那些板一起消失**。
還原一份三天前的備份，就會把這三天內在另一台建的板全部刪掉，而且沒有任何提示。

**修法**：`handleRestore` 在灌完資料後呼叫 **`clearSyncState()`**。
清掉之後那些板變成「雲端有、本機沒有、**我們沒推過**」＝走正常拉取路徑回到本機。
走的是與「換帳號登入」完全相同的既有路徑（整份重推一次），沒有新增機制。

⚠️ **要知道的副作用**：備份裡沒有的板**會從雲端回來**，而不是消失。這是刻意的取捨——
相對於「靜默地跨裝置永久刪除」，多回來幾塊板是可以自己再刪的。真的想清掉它們，
還原後走正常刪除流程（那才會推正確的墓碑）。備份還原的確認對話框已寫明這件事
（只在真的設定過雲端同步時顯示）。

**兩條測試**：`useBoardManager.test.ts` 驗 `handleRestore` 會呼叫 `clearSyncState`；
`syncEngine.test.ts` 驗「沒推過紀錄的遠端板照常拉回來、不推墓碑」——後者是這個修法
所依賴的引擎行為，原本沒有測試蓋到。

---

## 卡片級合併（2026-08-02 完成）

**先講一個實測出來、與文件不符的事實**：舊行為**不是**整板 LWW。
`pushBoard` 是無條件 upsert，而推送階段排在拉取之前 ⇒ **先同步的那一台直接蓋掉
另一台**，不管誰改得比較晚。沒有錯誤、沒有提示，對方的卡片就是不見了。

### 為什麼要三方，不能只比兩邊

只看 local 與 remote 的話，**永遠分不出「A 刪掉了這張卡」和「B 新增了這張卡」**
——兩種情況下的資料長得一模一樣（一邊有、一邊沒有）。要分辨就必須知道上一次
同步時是什麼樣子，也就是共同祖先（base）。

### base 只存雜湊

base 的用途只有一個：回答「這一邊有沒有動過這張卡」。那只需要指紋，不需要原內容
——真要取內容時 local/remote 本來就在手上。所以存成 `shapeId → hash`
（`syncState.shapeHashes`），一塊板約幾百 bytes，可以安心放 localStorage；
存整份 snapshot 是好幾 MB，不可能。

### 合併真值表（`utils/snapshotMerge.ts`，24 條測試）

| base | local | remote | 結果 |
|---|---|---|---|
| 有 | 沒動 | 改了 | 取 remote |
| 有 | 改了 | 沒動 | 取 local |
| 有 | 改了 | 改了 | 挑一邊（板的 `updatedAt` 較新者），**唯一會丟資料的地方** |
| 有 | 刪了 | 沒動 | 維持刪除 |
| 有 | 沒動 | 刪了 | 跟著刪 |
| 有 | 改了 | 刪了 | **保留 local**（刪除可以再做一次，打好的字回不來） |
| 有 | 刪了 | 改了 | **保留 remote**（同上） |
| 沒有 | 有 | — | local 新增，保留 |
| 沒有 | — | 有 | remote 新增，收下 |

非 shape 記錄（document / page / instance / camera）一律用 local：那是檢視狀態，
拿遠端的來蓋只會把本機的縮放捲動換掉。

### 引擎的兩個關鍵改動

1. **雲端清單改在推送之前取**。舊版推完才列清單，於是推送階段根本不知道
   「這塊板在雲端也被改過」。要合併就必須先知道遠端狀態。
2. **合併結果先寫回本機、再推上去**。順序反過來的話，推成功而本機寫入失敗
   會讓兩邊永久不一致，而且本機看不到對方的卡片。
   合併後的 `updatedAt` **推進到現在**（不沿用任一邊）——那是兩邊都沒有過的新版本，
   時間戳必須比雙方都大，否則另一台會覺得「我的比較新」再蓋一次。

合併真的動到東西時會發一則 toast（「『板名』與雲端合併：收到 N 張新卡片…」）。

**端到端實測**：種一塊兩張卡的板 → 同步建立 base → 直接改雲端那列的 shape:b
（模擬另一台）→ 本機改 shape:a → 同步 ⇒ **本機與雲端都同時有兩邊的修改**。
舊行為下「B 被另一台改了」會被直接蓋掉。

---

## 雲端殘留清理（2026-08-02 完成）

兩種殘留、同一個成因——刪掉東西之後，雲端那份沒有人負責收：

1. **墓碑列**：永久刪除白板時不能刪掉雲端那列（另一端會把它整塊推回來＝復活），
   所以改推一列 `deleted_at` 有值的墓碑。代價是那列從此永遠留著。
2. **Storage 孤兒物件**：卡片刪掉後 `card-images` 裡那張圖沒有人再引用。

### 為什麼做成「先預覽、按了才刪」而不是自動 GC

兩者刪錯的代價**不對稱且不可逆**：

- 墓碑刪太早 ⇒ 一台很久沒同步的裝置會把那塊板**復活**（資料自己冒出來）
- 孤兒圖刪錯 ⇒ 使用者的圖**永久消失**

都不該在背景靜默發生。`src/sync/cloudCleanup.ts` 只提供「掃描」與「執行」兩個動作，
資料安全中心顯示數量、使用者確認後才真的刪。

### 兩個保留期，各有各的理由

| 常數 | 值 | 為什麼 |
|---|---|---|
| `TOMBSTONE_RETENTION_MS` | 60 天 | 「一台裝置最久可以多久沒同步而不會讓已刪除的板復活」。垃圾桶是 14 天，這裡刻意更長——垃圾桶過期只是本機清掉，這裡過期卻可能讓資料在別台冒出來 |
| `ORPHAN_GRACE_MS` | 1 天 | **必要而非保險**：`imageSync` 是先上傳圖、再推白板列，中間那段時間物件存在卻還沒有人引用它。沒有寬限期的話剛上傳的圖會被同一輪清理刪掉 |

其他保護：拿不到 `created_at` 的物件**一律保留**（寧可留垃圾也不要因為缺一個時間戳
就刪圖）；刪墓碑的 SQL **同時帶 `deleted_at is not null` 條件**（掃描到執行之間
那塊板萬一被還原了，沒這條件就會把活著的板從雲端刪掉）；Storage 的 list 有筆數
上限，**要自己翻頁**，否則超過一頁的物件會永遠清不到。

⚠️ 判斷「還有沒有人引用」用的是**本機的白板**，前提是本機與雲端已同步。面板上有寫。

**端到端實測**：本機那兩列真墓碑是 7/29 刪的（4 天前）⇒ 掃描正確回報 0 可清。
另外種一列 90 天前的假墓碑 ⇒ 掃描回報 1 ⇒ 清理後假的消失、**兩列真墓碑原封不動**。
