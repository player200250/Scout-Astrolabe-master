# ADR 0008：文字卡以「純文字增強」補完整，不吸收 todo／table／image 成為內嵌 block

## 狀態

已採用（2026-07-17）—— 由「文字卡片完成度」需求導出，收斂 `/` 選單三階段計畫的階段 3。

補充 [0007 卡片綁定單一白板](0007-cards-bound-to-single-board.md)、[0004 富文字存為 HTML](0004-store-rich-text-as-html.md)。

---

## 背景

使用者定調：**「重心以文字卡片的完成度為主要目標。」**

參照系是 Notion／Heptabase。這兩者把 todo、表格、圖片都做成**文字文件內的 block**——在一份文字裡就能打勾、插表格、貼圖。本專案不同：todo、table、image 各是**獨立的卡片型別**（`CardType` 11 種之三），畫布上一張卡就是一種。

因此「文字卡像 Notion 一樣完整」有兩種讀法，導向相反的工程：

- **讀法 A（純文字增強）**：把文字卡本身缺的純文字能力補上（超連結、螢光筆、Callout…），不碰卡片型別。
- **讀法 B（block 化 / Heptabase 模型）**：讓文字卡能內嵌 checkbox／表格／圖片 block，長期讓「卡片型別變少、block 變多」。

`/` 選單原本規劃的三階段中，階段 3 正是「block vs 卡片型別的分岔」——本 ADR 就是拍板這個分岔。

---

## 決策

**走讀法 A。三種卡片型別（todo／table／image）都不拆成文字卡內的 block；文字卡的「完成度」定義為純文字能力的完整，不是吸收其他型別。**

具體：
- 文字卡**不加** checkbox / TaskList block（使用者拍板）。
- 文字卡**不加**表格 block；table 卡維持獨立型別（使用者拍板）。
- 文字卡**不內嵌**圖片。
- `/` 選單**階段 3 取消**；範圍收斂為階段 2 的純文字增強。

---

## 理由

盤點三種型別被牽動的檔案數，發現**它們的處境完全不對稱**，不能當成一個問題一起拍：

| 型別 | 牽連檔案 | 硬約束 |
|------|---------|--------|
| **todo** | **23** | `TaskCenter.tsx` 硬綁 `if (shape.props.type !== 'todo') continue`，讀結構化 `todos[]`（含 `dueDate`）。Dashboard／CalendarView／WeeklyReview／FilterPanel／SearchPanel 全靠這個結構供資料 |
| **image** | **14** | 整套 TD-IMG：`astro-img://` protocol、`save-image` IPC、背景遷移、備份暫停、垃圾桶清實體檔 |
| **table** | **6** | 最孤立，但 C3 剛做完標題列／欄數／列拖曳三項強化 |

1. **todo 不能拆**。checkbox 一旦變成文字卡 HTML 裡的 `<li data-checked>`，跨白板任務視角（TaskCenter 330 行邏輯）就得靠**解析 HTML** 才算得出統計與 `dueDate`。這正是 [N6 效能驗證](../maintenance/n6-performance-2026-07-15.md) 已經看過代價的路——把結構化資料塞進 HTML 再解析出來，是退步不是進步。

2. **image 更不能拆，且時機最差**。base64 內嵌圖片是[白屏 OOM](../maintenance/bugs.md) 與筆刷卡頓（[D8](../maintenance/manual-test-2026-07-04.md)）的共同元兇，TD-IMG（commit `7eaf7f5`）才剛把它拔掉、使用者 2026-07-17 才確認筆刷正常。文字卡內嵌圖片＝圖片回到 HTML：塞 base64 等於 OOM 復發，塞 `astro-img://` 要為它重做一整套 node view。**才剛從這個坑爬出來，不該跳回去。**

3. **table 可拆但不划算**。只有 6 個檔案、表格長在文字裡也確實比獨立卡片自然——但 C3 剛完成的三項強化會白做，而換來的價值有限。使用者選擇維持現狀。

4. **符合既有哲學**。少型別、重組合是專案原則（見 [pref_avoid_overoptimization]、學 Heptabase／Milanote）。但「少型別」的正解在**畫布本身**——畫布就是排版引擎，能自由擺放組合卡片，這正是 Notion 需要 block/column 的理由（它沒有畫布）。**本專案有畫布，就不需要把組合能力下放到文字卡的 block 層。**

---

## 導出的工作（`/` 選單階段 2：純文字增強）

分兩批，皆為 TipTap extension，不動 `CardType` 與資料模型：

**基礎批（低風險，優先）**
- **超連結（Link）**——補一個真實的洞：文字卡目前**產不出 `<a>`**（TipTap 未裝 Link extension），貼網址點不動。有趣的是 `exportMarkdown.ts` 早就有 `<a>` → `[文字](url)` 的轉換與測試——**出口鋪好了，入口從來沒開。**
- **Placeholder**——空白文字卡在編輯模式無任何提示；補上「輸入文字，或按 `/` 選擇格式」＝接上階段 1 `/` 選單的可發現性尾巴。
- **螢光筆（Highlight）**——Notion parity，裝上即用。

**進階批（需自製 node / 引入依賴，未定）**
- Callout、Toggle 摺疊（TipTap 2 的 Details 是 Pro，需自製）、數學 LaTeX（需引入 katex）。

---

## 明確不做

- 同步 block（＝ [0007](0007-cards-bound-to-single-board.md) 的跨板共享下降到 block 層級，做不到）。
- Columns（畫布本身就是排版引擎）。
- 資料庫視圖（無 row 概念）。

---

## 未來若要重新評估

- 使用者實際想在一份文字裡打勾／插表格的頻率高到「另開一張卡」變成明顯摩擦。
- 專案定位從自用工具改變，或畫布不再是主要組織方式。

（table 是三者中唯一低成本可回頭的；todo／image 的硬約束在可見未來都不會消失。）

---

## 相關文件

- [adr/0007-cards-bound-to-single-board.md](0007-cards-bound-to-single-board.md) — 少型別哲學與「白板即視角」的上游決策
- [adr/0004-store-rich-text-as-html.md](0004-store-rich-text-as-html.md) — 文字卡存 HTML 的決策（本 ADR 的「不把結構化資料塞進 HTML」與之呼應）
- [rich-text-editor.md](../rich-text-editor.md) — TipTap 設定、`/` 選單、支援格式現況
- [roadmap-v2.md](../roadmap-v2.md) — `/` 選單階段規劃
- [product-redesign-2026-07.md](../product-redesign-2026-07.md) — 「像 Notion」的完整討論脈絡
