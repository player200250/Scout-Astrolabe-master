# 開發體驗評估

> 日期：2026-07-26
> 性質：一次密集開發（17 份技術文件逐行稽核、N19 白板模板實作、多輪 dogfood 驅動）後，從「**在這個 codebase 上開發是什麼感覺**」角度做的評估。**主觀但有據**——每點都對得上這輪實際踩到的例子。非規格文件；actionable 項見 [refactor-roadmap.md](refactor-roadmap.md)，使用者面見 [ux-audit-2026-07-23.md](ux-audit-2026-07-23.md)。

---

## 做得好的（實際受惠的優點）

- **hooks 拆解乾淨**：`useBoardManager` 拆成 8 個領域子 hook（TD2），新功能有明確落點——加 N19 的 `handleCreateBoardFromTemplate` 時跟著 `handleNew` 抄即可。
- **純函式＋單測的紀律**：`snapshot`／`cardLinks`／`knowledgeGraph`／`slashCommands`／`tagManager` 等抽成純函式配單測，479 測試多為此類 → 改資料層有安全網。
- **snapshot 的 sanitize 三層**：明知 tldraw 型別是黑箱，用防禦性補值兜住（frame/arrow/page/document 缺欄位）＝務實。
- **平台接縫 `src/platform/`**：把 Electron 依賴收進葉節點接縫（S0(a)），降耦合、為 PWA 鋪路。
- **文件量紮實 + 眼驗文化**：17 份技術文件 + 「測試綠 ≠ 對，要開真實 App 眼驗」的習慣，多數自用專案沒有。

---

## 做起來卡的（依「會不會咬到下一個開發者」排序）

1. ~~**全 inline style、寫死色值、無 design token**~~ — **✅ 已解決（2026-07-26，TD8）**。原況：每個元件大段 `style={{…}}`，顏色全是 `isDark ? '#1e293b' : 'white'` 一路重複，加一個元件就得每個顏色手動配一次。現況：`src/theme/tokens.css` 40 個語意 token ＋ `T` 取用介面，`isDark ?` 449→23 處，`isDark` prop 全面退場。**仍是 inline style（沒改成 CSS class），但色值已集中**。詳見 [refactor-roadmap.md TD8](refactor-roadmap.md)。
2. **三套事件系統疊加、只能實測不能推理** — tldraw／React／ProseMirror 各在不同階段攔事件、無仲裁者、有 6 處 capture 逃生艙（見 [state-and-events.md](state-and-events.md)、記憶 `arch_three_event_systems`）。碰任何互動（toggle 三角形／pointer／雙擊進編輯）都得開 CDP 實測才敢下結論＝**互動層最重的認知稅**。
3. **UI god components** — `WhiteboardTools.tsx` 800+ 行（editor 操作＋建卡＋事件橋接＋自動存檔＋匯出＋工具列全塞一起）；`BoardTabBar`／`ContextMenu` 也偏大。**hooks 拆得漂亮，components 還沒享受到同等重構。**
4. **snapshot 操作是型別黑洞** — 到處 `as unknown as MutableSnapshot`，型別系統保護不到改 snapshot 的地方，錯誤只在 runtime 才炸（sanitize 層就是為此存在的網）。動 snapshot 像在無型別地帶走路。
5. **互動/綁 tldraw 的碼零自動測試** — 純邏輯測得好，但 `WhiteboardTools`／`*Content`／`CardShapeUtil` 這些**最容易出 bug 的互動碼**全靠手動 CDP 驗（E2E 一直沒建，見 [testing-strategy.md](testing-strategy.md)）。風險最高處沒有自動網——這也是「眼驗文化」這麼重的結構性原因。
6. **文件靠手動同步會漂** — 文件勤但與程式碼分開維護，無 doc-test / 生成式 API ref。這輪修的漂移最陰的是**型別欄位級**（`stickyColor` 根本不存在、`mainColor` 其實是 `swatches`）。

---

## 先修（投報高 → 低）

1. ~~**抽一層 theme token**~~ **✅ 已完成（2026-07-26）**：集中明暗色值，順手收掉散落的 `isDark ? :`，並修好 83 處一直靜默失效的 `var(--…)`（定義在死檔 App.css）。
2. ~~**共用 `toast` + `inline-input` primitive**~~ **✅ 已完成（2026-07-26，TD9）**：`showToast()` 取代 11 處阻塞式 `alert()`；`promptName()` 補上 Electron 缺的 `window.prompt`（實機確認它會丟 `prompt() is not supported.`，這正是 N19 存模板只能用預設名的原因）；`<InlineEdit/>` 收斂 board/folder/template/tag 共 5 處各自重造的改名輸入框。
3. **拆 `WhiteboardTools`**：價值高但**風險也高（互動碼沒測試網）**，宜等 E2E（Playwright）建起來再動。

## 不是「修」得掉的（要接受並管理）

- **三套事件系統**＝tldraw 選型帶來的固有複雜度，不是 bug。能做的是把 6 處 capture 逃生艙**集中記錄**（已在 state-and-events / 記憶），別讓下一個人重新踩。

---

## 一句話

**當工具用很穩、當開發對象有兩個系統性小坑**——(1) 缺 theme token、(2) 缺共用 toast/inline-input primitive。兩者補起來成本不高、每個新功能都受惠，是投報最高的下一步基礎建設。

> **2026-07-26 更新**：兩項**都已完成**（TD8 design token、TD9 toast+inline-input primitive，見 [refactor-roadmap.md](refactor-roadmap.md)）。剩下的結構性項目是 TD10（拆 god components），但那要等 E2E 測試網建起來才動。
