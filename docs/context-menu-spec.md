# 右鍵選單規範

## 目的

完整規範白板畫布上的右鍵（context menu）行為：觸發條件、依情境（空白處／單張卡片／多選／各卡片類型）動態組出的選單項、以及顏色選擇器與各子選單。功能本身已齊全，本文件解決「可發現性差、缺規範」的問題（對應 roadmap B9 / D2），供使用者查閱與開發者維護時對照。

## 適用範圍

`src/utils/contextMenuUtils.tsx`（`useContextMenu` hook，組出選單資料）、`src/ContextMenu.tsx`（`ContextMenuUI` 呈現層 + `SaveTemplateModal` / `BatchAddTagModal`）。選單掛在 `WhiteboardTools` 內，透過 `window` 的 `contextmenu` capture 事件攔截。

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/utils/contextMenuUtils.tsx` | `useContextMenu`：對齊/分佈、批次屬性、表格欄數、內建模板等 helper，並依情境組出 `MenuItem[]` |
| `src/ContextMenu.tsx` | `ContextMenuUI` 呈現、`MenuItem` 型別、顏色選擇器、存模板/批次標籤 modal |
| `src/components/WhiteboardTools.tsx` | 提供各 `createXxxCard` callback 與 `onMoveCard` 等接線 |
| `src/components/card-shape/type/CardShape.ts` | `STICKY_COLORS` / `STICKY_COLOR_LIST`、卡片型別與顏色常數 |

---

## 觸發與定位

- 監聽 `window` 的 `contextmenu`（`capture: true`）；`preventDefault` 掉瀏覽器原生選單。
- **側邊欄例外**：事件目標若落在 `[data-sidebar]` 內，不接管（讓側邊欄自己的選單/行為生效）。
- 以滑鼠座標 `screenToPage` 換算畫布座標，`getShapeAtPoint` 判斷是否點在卡片上：
  - 命中 `type === 'card'` → **卡片選單**（含多選判斷）。
  - 未命中 → **空白處選單**。
- 選單顯示在滑鼠 `clientX/clientY`；點擊外部或選項後關閉。

---

## 一、空白處選單（未點中卡片）

在白板空白處按右鍵，於游標位置建立卡片。所有建立動作都以游標的畫布座標為落點。

| 圖示 | 項目 | 行為 |
|------|------|------|
| 📝 | 新增文字卡片 | `createTextCard` |
| ✅ | 新增待辦清單 | `createTodoCard` |
| 🔗 | 新增連結卡片 | `createLinkCard` |
| 🖼️ | 新增圖片卡片 | `openImageInput`（開檔案選擇） |
| A | 新增標題卡片 | `createHeadingCard` |
| 📌 | 新增便利貼 | 預設黃色；**子選單**列出所有便利貼顏色（`STICKY_COLOR_LIST`） |
| ▦ | 新增表格 | 預設 3 欄；**子選單** 2 / 3 / 4 欄 |
| 🎨 | 新增顏色樣本 | `createColorCard` |
| 📎 | 上傳檔案 | 僅在 Electron（`window.electronAPI.selectAndCopyFile` 存在）時出現 |
| 📋 | 從模板新增 | **子選單**（見下）；與上方分隔 |

### 「從模板新增」子選單

1. **空白文字卡片**（✨）。
2. **內建模板**（`BUILTIN_TEMPLATES`）：📝 會議記錄、📚 讀書筆記、🐛 問題拆解、🎯 目標設定、💡 想法捕捉。各自帶預設寬高與 HTML 內容。
3. **自訂模板**（⭐）：讀 Dexie `templates` 表，依建立時間新到舊。每個模板另有「🗑️ 刪除『模板名』」項（danger）。自訂模板由卡片選單的「存為模板」產生。

---

## 二、單張卡片選單（點中一張卡片）

固定開頭兩項，其後依卡片類型追加，最後是「移到白板」與「刪除」，並一律附帶底部顏色選擇器。

| 圖示 | 項目 | 適用 | 行為 |
|------|------|------|------|
| 🔍 | 縮放至此卡片 | 全部 | 選取並 `zoomToSelection` |
| 📋 | 複製卡片 | 全部 | `duplicateShapes`，偏移 (20,20) |
| ✏️ | 編輯連結 | 連結卡 | 進入 `state: 'editing'`、清掉既有嵌入 |
| ☑/☐ | 開啟/關閉標題列 | 表格卡 | 切換 `tableHeaderRow`（未設視為開啟） |
| ▦ | 欄數 | 表格卡 | **子選單** 2/3/4 欄；縮減會刪最右欄資料時先 `confirm` |
| ⭐ | 存為模板 | 文字卡 | 開 `SaveTemplateModal`，預設名取自 H2 或首段 |
| 📦 | 移到白板… | 全部（有 `onMoveCard` 時） | 開移動 modal |
| 🗑️ | 刪除卡片 | 全部 | 先寫入回收桶（`saveCardToTrash`）再 `deleteShapes`；danger |

顏色選擇器：選單底部一律顯示；便利貼會標記 `isSticky` 以套用便利貼色盤。選色即 `updateShape` 的 `props.color`。

---

## 三、多選選單（選取 ≥ 2 張後右鍵其中一張）

當右鍵命中的卡片屬於目前多選集合（`selectedIds` 含它且長度 > 1）時，操作對象為選集內所有 `card`（`idsToOperate`），選單改為批次版：

- **複製 N 張卡片**（📋）。
- **對齊**（⬛，子選單）：靠左/水平置中/靠右、靠上/垂直置中/靠下；**≥ 3 張**再加「水平均分／垂直均分」。
- **批次設定狀態（N）**（📊，子選單）：待辦 / 進行中 / 完成 / 清除狀態。
- **批次設定優先級（N）**（⚑，子選單）：高 / 中 / 低 / 清除。
- **批次附加標籤（N）**（🏷）：開 `BatchAddTagModal`；去重、不覆蓋既有標籤，已含該標籤者跳過。
- **移動 N 張到白板…**（📦）、**刪除 N 張卡片**（🗑️，逐張入回收桶）。

> 對齊需 ≥ 2 張、分佈需 ≥ 3 張才生效（`alignShapes` / `distributeShapes` 內部再判斷）。

---

## 四、鍵盤捷徑對照（與右鍵互補）

右鍵選單負責「就地、依情境」的操作；下列全域捷徑負責高頻動作（來源見 OnboardingModal 與 B2）：

| 捷徑 | 行為 |
|------|------|
| `Ctrl+F` | 全白板卡片內容搜尋 |
| `Ctrl+Space` | 快速把想法丟進收件匣 |
| `Ctrl+Shift+O` | 開啟所有白板總覽 |
| `S` / `Shift+N` / `Shift+T` | 建立便利貼 / 文字 / 待辦（畫布聚焦時） |

---

## 五、可發現性（現況與提示）

- **OnboardingModal** 第 3 步明確提示「在白板空白處按右鍵建立文字、待辦、連結、圖片卡片」，第 4 步列出上述搜尋/收件匣/總覽捷徑——首次啟動即引導。
- 本規範文件為完整清單，可作為 App 內「說明」的資料來源。
- 未來若加「說明/快捷鍵一覽」面板（見 roadmap keybindings 方向），應以本文件與 OnboardingModal 為單一事實來源，避免重複維護。

---

## 維護須知

選單是**依情境動態組出**的，不是靜態清單。新增卡片類型或批次操作時：

1. 建立動作 → 在空白處選單或「從模板新增」子選單加項，並確保 `WhiteboardTools` 傳入對應 `createXxxCard`。
2. 類型專屬操作（如表格欄數）→ 在單卡選單的類型判斷區（`isLink` / `isTable` / `isText` …）追加。
3. 批次操作 → 在 `opCount > 1` 區塊追加，並確認 helper 對非 `card` shape 做過濾。
4. 同步更新本文件對應表格。
