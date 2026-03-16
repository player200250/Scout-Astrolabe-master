# 🚀 Scout Astrolabe

一個受 Milanote 啟發的 Windows 桌面白板應用程式，使用 React + Electron + tldraw 建構。

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-0078D6?logo=windows)
![License](https://img.shields.io/badge/license-MIT-green)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

---

## 📖 目錄

- [主要功能](#-主要功能)
- [截圖展示](#-截圖展示)
- [快速開始](#-快速開始)
- [系統需求](#-系統需求)
- [安裝指南](#-安裝指南)
- [使用說明](#-使用說明)
- [鍵盤快捷鍵](#-鍵盤快捷鍵)
- [技術架構](#-技術架構)
- [開發指南](#-開發指南)
- [常見問題](#-常見問題)
- [開發路線圖](#-開發路線圖)
- [貢獻指南](#-貢獻指南)
- [授權資訊](#-授權資訊)
- [致謝](#-致謝)

---

## ✨ 主要功能

### 📝 豐富的卡片類型

#### 1. 文字卡片
- ✍️ 富文本編輯器（TipTap）
- **粗體**、*斜體*、<u>底線</u>
- 標題（H1-H5）
- 項目符號清單
- 編號清單
- 程式碼區塊
- 6 種文字顏色
- 自動調整高度
- 支援超過 200 字自動轉為文件模式（即將推出）

#### 2. 圖片卡片
- 🖼️ 支援格式：JPG、PNG、GIF、WebP、SVG
- 拖拽上傳
- 雙擊全螢幕預覽
- 內建下載功能
- 在新分頁開啟
- 自動調整大小
- 保持圖片比例

#### 3. 待辦卡片
- ✅ 勾選式清單
- 動態新增/刪除項目
- 完成項目自動標記
- 即時統計進度
- 自動高度調整
- 智慧焦點管理

#### 4. 連結卡片
- 🔗 支援一般網址
- 🎬 YouTube 影片嵌入
- 📺 Vimeo 影片嵌入
- 📹 Bilibili 影片嵌入
- 自動辨識影片連結
- 雙擊編輯連結
- 單擊開啟網頁

#### 5. 看板卡片
- 📋 多層級頁面導航
- 縮圖預覽（即將推出）
- 快速跳轉
- 階層式組織

#### 6. 欄位卡片
- 📊 組織與分類工具
- 容器功能
- 群組管理

### 🎨 精美的視覺設計

- **Milanote 風格點狀網格背景** - 經典的設計靈感
- **8 種卡片顏色主題**：
  - 🤍 白色（預設）
  - 💛 黃色
  - 💗 粉紅色
  - 💙 藍色
  - 💚 綠色
  - 💜 紫色
  - 🧡 橙色
  - 🩶 灰色
- **雙層陰影系統** - 提供立體深度感
- **編輯狀態藍色發光** - 清楚的視覺回饋
- **流暢的懸浮動畫** - 微妙的互動效果
- **頂部色條設計** - Milanote 經典元素

### 🛠️ 強大的核心功能

- ⚡ **自動儲存** - 500ms 防抖機制，不會丟失任何內容
- 📏 **自由調整大小** - 所有卡片都可以拖拽調整
- 🎯 **精確拖拽定位** - 像素級精準控制
- ⌨️ **鍵盤快捷鍵** - 提升工作效率
- 🖱️ **右鍵選單** - 快速操作
- 💾 **本機儲存** - 資料完全保存在您的電腦上
- 🔒 **隱私保護** - 不需要帳號，不上傳雲端
- 🌐 **完全離線** - 無需網路連線即可使用

---

## 📸 截圖展示

*（建議在此處加入 2-3 張應用程式截圖）*

**範例：**
```markdown
### 主畫面
![主畫面](screenshots/main.png)
*無限畫布與多種卡片類型*

### 富文本編輯
![編輯器](screenshots/editor.png)
*強大的文字編輯功能*

### 顏色主題
![顏色](screenshots/colors.png)
*8 種美麗的卡片顏色*
```

---

## 🚀 快速開始

### 方法 1：下載安裝檔（一般使用者）

1. 前往 [Releases](https://github.com/你的使用者名稱/Scout-Astrolabe/releases) 頁面
2. 下載最新版本的 `Scout-Astrolabe-Setup-0.1.0.exe`
3. 執行安裝程式
4. 完成安裝後從開始選單啟動

### 方法 2：從原始碼執行（開發者）

```bash
# 1. 複製專案
git clone https://github.com/你的使用者名稱/Scout-Astrolabe.git
cd Scout-Astrolabe

# 2. 安裝依賴
npm install

# 3. 啟動應用程式
npm run dev
```

---

## 🖥️ 系統需求

### 最低需求

| 項目 | 需求 |
|------|------|
| 作業系統 | Windows 10 (64-bit) 或更新版本 |
| 處理器 | Intel/AMD 雙核心處理器 |
| 記憶體 | 512 MB RAM |
| 硬碟空間 | 200 MB 可用空間 |
| 螢幕解析度 | 1280 × 720 或更高 |

### 建議配置

| 項目 | 建議 |
|------|------|
| 作業系統 | Windows 11 |
| 處理器 | Intel/AMD 四核心處理器或更好 |
| 記憶體 | 2 GB RAM 或更多 |
| 硬碟空間 | 500 MB 可用空間 |
| 螢幕解析度 | 1920 × 1080 或更高 |

### 軟體依賴

- 無需額外安裝任何軟體
- 不需要 .NET Framework
- 不需要 Visual C++ 執行檔
- 所有依賴都已包含在安裝檔中

---

## 📦 安裝指南

### 標準安裝

1. **下載安裝檔**
   - 前往 [Releases](https://github.com/你的使用者名稱/Scout-Astrolabe/releases)
   - 下載 `Scout-Astrolabe-Setup-0.1.0.exe`（約 XX MB）

2. **執行安裝程式**
   - 雙擊下載的 `.exe` 檔案
   - Windows 可能會顯示「Windows 已保護您的電腦」警告
   - 點擊「詳細資訊」→「仍要執行」

3. **安裝選項**
   - 選擇安裝位置（預設：`C:\Program Files\Scout-Astrolabe`）
   - 選擇是否建立桌面捷徑
   - 選擇是否加入開始選單

4. **完成安裝**
   - 安裝完成後可選擇立即啟動
   - 或從開始選單 / 桌面捷徑啟動

### 綠色版（免安裝）

*（如果提供免安裝版本）*

1. 下載 `Scout-Astrolabe-Portable-0.1.0.zip`
2. 解壓縮到任意資料夾
3. 執行 `Scout-Astrolabe.exe`

### 解除安裝

1. 開啟 Windows 設定（Win + I）
2. 前往「應用程式」→「應用程式與功能」
3. 找到「Scout Astrolabe」
4. 點擊「解除安裝」
5. 依照指示完成解除安裝

**注意**：解除安裝不會刪除您的資料，資料位於 `%APPDATA%\Scout-Astrolabe\`

---

## 📖 使用說明

### 第一次使用

1. **啟動應用程式**
   - 從開始選單或桌面捷徑開啟

2. **建立第一張卡片**
   - 雙擊畫布空白處
   - 或使用快捷鍵（見下方）
   - 或使用頂部工具列

3. **編輯卡片**
   - 雙擊卡片進入編輯模式
   - 點擊外部或按 ESC 結束編輯

4. **移動卡片**
   - 拖拽卡片即可移動
   - 使用觸控板或滑鼠滾輪縮放畫布

### 建立不同類型的卡片

#### 📝 文字卡片
1. 雙擊畫布或按 `1`
2. 輸入文字
3. 使用工具列設定格式

#### 🖼️ 圖片卡片
1. 點擊工具列的圖片按鈕
2. 選擇圖片檔案
3. 或直接拖拽圖片到畫布

#### ✅ 待辦卡片
1. 按快捷鍵 `2` 或點擊工具列
2. 輸入待辦項目
3. 按 Enter 新增下一項
4. 勾選方塊標記完成

#### 🔗 連結卡片
1. 按快捷鍵 `3` 或點擊工具列
2. 貼上網址
3. 支援的影片平台會自動嵌入

### 進階操作

#### 調整卡片大小
- 選取卡片後拖拽四個角的控制點

#### 變更卡片顏色
1. 右鍵點擊卡片
2. 選擇「變更顏色」
3. 點選想要的顏色

#### 複製與貼上
- 複製：`Ctrl + C`
- 貼上：`Ctrl + V`
- 或使用右鍵選單

#### 刪除卡片
- 選取卡片後按 `Delete`
- 或右鍵選擇「刪除」

#### 全選
- `Ctrl + A` 選取所有卡片

#### 復原與重做
- 復原：`Ctrl + Z`
- 重做：`Ctrl + Shift + Z`

---

## ⌨️ 鍵盤快捷鍵

### 基本操作

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + C` | 複製選取的卡片 |
| `Ctrl + V` | 貼上 |
| `Ctrl + X` | 剪下 |
| `Ctrl + A` | 全選 |
| `Ctrl + D` | 複製卡片 |
| `Delete` | 刪除選取的卡片 |
| `Backspace` | 刪除選取的卡片 |
| `Ctrl + Z` | 復原 |
| `Ctrl + Shift + Z` | 重做 |
| `Ctrl + Y` | 重做（替代） |

### 建立卡片

| 快捷鍵 | 功能 |
|--------|------|
| `1` | 建立文字卡片 |
| `2` | 建立待辦卡片 |
| `3` | 建立連結卡片 |

### 工具切換

| 快捷鍵 | 功能 |
|--------|------|
| `V` | 選取工具 |
| `H` | 手掌工具（平移畫布） |

### 視圖控制

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + 滑鼠滾輪` | 縮放畫布 |
| `Ctrl + 0` | 重設縮放（100%） |
| `Ctrl + +` | 放大 |
| `Ctrl + -` | 縮小 |
| `空白鍵 + 拖曳` | 平移畫布 |

### 排列卡片

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + ]` | 移到最上層 |
| `Ctrl + [` | 移到最下層 |

### 搜尋功能（即將推出）

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + F` | 開啟搜尋 |

### 其他

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + /` | 顯示快捷鍵說明（即將推出） |
| `ESC` | 取消當前操作 |
| `F11` | 全螢幕模式 |

---

## 🏗️ 技術架構

### 核心技術棧

```
桌面層
├── Electron 37.3.1          # 桌面應用框架
│   ├── 主程序 (main.js)     # 視窗管理、系統整合
│   └── 預載腳本 (preload.js) # 安全的 IPC 通訊橋接

前端層
├── React 19.2.0             # UI 框架
├── TypeScript 5.8.3         # 型別安全
├── Vite 7.1.2               # 建置工具與 HMR
└── tldraw 3.15.5            # 無限畫布引擎

編輯器層
├── TipTap                   # 富文本編輯器
│   ├── StarterKit          # 基礎功能
│   ├── Underline           # 底線
│   ├── TextStyle           # 文字樣式
│   ├── Color               # 顏色
│   └── CodeBlock           # 程式碼區塊

資料層
└── Dexie.js                 # IndexedDB 包裝器
    ├── 自動儲存（500ms）
    ├── 交易管理
    └── 資料遷移
```

### 專案架構

```
Scout-Astrolabe/
│
├── 📁 src/                              # 前端源碼
│   ├── 📁 components/
│   │   └── 📁 card-shape/
│   │       ├── CardShapeUtil.tsx        # 卡片核心邏輯（主控制器）
│   │       ├── 📁 type/
│   │       │   └── CardShape.ts         # 型別定義、顏色常數
│   │       └── 📁 sub-components/
│   │           ├── TextContent.tsx      # 文字卡片（TipTap 編輯器）
│   │           ├── ImageContent.tsx     # 圖片卡片（拖拽、預覽）
│   │           ├── TodoContent.tsx      # 待辦卡片（動態清單）
│   │           ├── LinkContent.tsx      # 連結卡片（影片嵌入）
│   │           ├── BoardContent.tsx     # 看板卡片（導航）
│   │           └── ColumnContent.tsx    # 欄位卡片（組織）
│   ├── App.tsx                          # 主應用程式（畫布初始化）
│   ├── App.css                          # Milanote 風格全域樣式
│   ├── main.tsx                         # React 入口點
│   └── vite-env.d.ts                    # Vite 型別定義
│
├── 📁 public/                           # 靜態資源
│   └── vite.svg                         # 應用程式圖示
│
├── 🔧 main.js                           # Electron 主程序
│   ├── 視窗建立
│   ├── 選單設定
│   ├── IPC 處理
│   └── 應用程式生命週期
│
├── 🔒 preload.js                        # Electron 預載腳本
│   └── contextBridge API（安全橋接）
│
├── 📦 package.json                      # 專案配置與依賴
├── 📦 package-lock.json                 # 依賴鎖定
├── ⚙️ vite.config.ts                    # Vite 建置配置
├── 📘 tsconfig.json                     # TypeScript 主配置
├── 📘 tsconfig.app.json                 # App TypeScript 配置
├── 📘 tsconfig.node.json                # Node TypeScript 配置
├── 🔍 eslint.config.js                  # ESLint 程式碼檢查
├── 📝 README.md                         # 本檔案
└── 📄 LICENSE                           # MIT 授權

建置輸出/
└── 📁 dist/                             # 建置後的檔案
    ├── Scout-Astrolabe-Setup-0.1.0.exe  # Windows 安裝檔
    └── 其他建置產物
```

### 資料流程

```
使用者操作
    ↓
React 事件處理
    ↓
tldraw Editor API
    ↓
Shape 更新
    ↓
自動儲存（500ms 防抖）
    ↓
Dexie (IndexedDB)
    ↓
本機磁碟 (%APPDATA%)
```

### 安全架構

```
渲染程序（不可信）
    ↓
contextBridge（安全橋接）
    ↓
preload.js（受限 API）
    ↓
IPC 通道（受控）
    ↓
主程序（可信）
    ↓
Node.js / 系統 API
```

---

## 🛠️ 開發指南

### 環境準備

#### 前置需求

- **Node.js** 18.0.0 或更新版本
  - 下載：https://nodejs.org/
  - 驗證：`node --version`
- **npm** 9.0.0 或更新版本
  - 驗證：`npm --version`
- **Git**（選用，用於版本控制）
  - 下載：https://git-scm.com/

#### 取得原始碼

```bash
# 方法 1：使用 Git
git clone https://github.com/你的使用者名稱/Scout-Astrolabe.git
cd Scout-Astrolabe

# 方法 2：下載 ZIP
# 從 GitHub 下載後解壓縮
```

#### 安裝依賴

```bash
# 安裝所有依賴套件
npm install

# 這會安裝：
# - Electron 相關套件
# - React 相關套件
# - tldraw
# - TipTap 及其擴充功能
# - TypeScript 和開發工具
```

### 本地開發

```bash
# 啟動開發模式（含 HMR）
npm run dev

# 應用程式會自動開啟
# 修改程式碼會即時更新
```

#### 開發模式功能

- ⚡ **熱模組替換（HMR）** - 修改程式碼立即生效
- 🔍 **開發者工具** - 自動開啟（Ctrl + Shift + I）
- 🐛 **Source Maps** - 方便除錯
- 📊 **詳細錯誤訊息** - 快速定位問題

### 程式碼品質

```bash
# 執行 ESLint 檢查
npm run lint

# 自動修復可修復的問題
npm run lint -- --fix

# TypeScript 型別檢查
npx tsc --noEmit
```

### 建置與打包

```bash
# 建置 Windows 安裝檔
npm run build:win

# 建置輸出位置：dist/
# 檔案：Scout-Astrolabe-Setup-0.1.0.exe
```

#### 建置選項

編輯 `package.json` 中的 `build` 設定：

```json
{
  "build": {
    "appId": "com.yourcompany.scout-astrolabe",
    "productName": "Scout Astrolabe",
    "win": {
      "target": ["nsis"],
      "icon": "build/icon.ico"
    }
  }
}
```

### 偵錯技巧

#### 1. 使用 Chrome DevTools

```bash
# 開發模式會自動開啟 DevTools
# 或在應用程式中按 Ctrl + Shift + I
```

#### 2. 主程序偵錯

在 `main.js` 中加入：

```javascript
console.log('Debug info:', someVariable)
```

查看終端機輸出。

#### 3. React DevTools

已內建於開發模式，可檢視組件樹和狀態。

#### 4. 查看 IndexedDB

1. 開啟 DevTools
2. 前往 Application 標籤
3. 展開 IndexedDB → scout-astrolabe

### 常用開發指令

```bash
# 安裝新套件
npm install package-name

# 安裝開發依賴
npm install --save-dev package-name

# 更新套件
npm update

# 檢查過時套件
npm outdated

# 清除快取
npm cache clean --force

# 重新安裝
rm -rf node_modules package-lock.json
npm install
```

---

## ❓ 常見問題

### 安裝與啟動

**Q: 安裝時顯示「Windows 已保護您的電腦」怎麼辦？**

A: 這是正常的 Windows SmartScreen 警告。點擊「詳細資訊」→「仍要執行」即可。這是因為應用程式尚未獲得微軟的程式碼簽章。

**Q: 安裝完後無法啟動？**

A: 
1. 確認系統符合最低需求（Windows 10 64-bit）
2. 以系統管理員身分執行
3. 檢查防毒軟體是否封鎖
4. 重新安裝應用程式

**Q: 雙擊 .exe 沒有反應？**

A: 
1. 檢查工作管理員是否已在背景執行
2. 結束程序後重新開啟
3. 檢查是否有錯誤訊息

### 資料與儲存

**Q: 我的資料儲存在哪裡？**

A: 資料儲存在 `%APPDATA%\Scout-Astrolabe\`。

要查看：
1. 按 Win + R
2. 輸入 `%APPDATA%\Scout-Astrolabe`
3. 按 Enter

**Q: 如何備份我的資料？**

A: 
```bash
# 方法 1：複製整個資料夾
1. Win + R
2. 輸入 %APPDATA%
3. 複製 Scout-Astrolabe 資料夾到安全位置

# 方法 2：使用檔案總管
C:\Users\你的使用者名稱\AppData\Roaming\Scout-Astrolabe\
```

**Q: 可以把資料移到其他電腦嗎？**

A: 可以！
1. 複製 `%APPDATA%\Scout-Astrolabe\` 資料夾
2. 在新電腦安裝應用程式
3. 將資料夾貼到新電腦的相同位置
4. 啟動應用程式

**Q: 資料會自動儲存嗎？**

A: 會！每次編輯後會自動儲存（500ms 延遲），完全不需要手動儲存。

**Q: 如何清除所有資料？**

A: 
1. 關閉應用程式
2. 刪除 `%APPDATA%\Scout-Astrolabe\` 資料夾
3. 重新啟動應用程式

### 功能使用

**Q: 如何上傳圖片？**

A: 
- 方法 1：點擊工具列的圖片按鈕，選擇檔案
- 方法 2：直接拖拽圖片到畫布
- 方法 3：複製圖片（Ctrl+C）後貼上（Ctrl+V）

**Q: 支援哪些圖片格式？**

A: JPG、JPEG、PNG、GIF、WebP、SVG

**Q: 圖片檔案大小有限制嗎？**

A: 建議單張圖片不超過 10 MB，以確保效能。

**Q: 可以嵌入 YouTube 影片嗎？**

A: 可以！建立連結卡片，貼上 YouTube 網址即可自動嵌入。支援：
- YouTube 一般影片
- YouTube Shorts
- Vimeo
- Bilibili

**Q: 影片無法播放？**

A: 
1. 確認網址正確
2. 檢查網路連線
3. 某些影片可能被創作者限制嵌入

**Q: 如何改變卡片顏色？**

A: 
- 方法 1：右鍵點擊卡片 → 變更顏色
- 方法 2：選取卡片後使用工具列的顏色選擇器（即將推出）

**Q: 文字卡片可以有多長？**

A: 沒有限制！超過 200 字會自動轉為文件模式（即將推出）。

**Q: 如何調整畫布大小？**

A: 畫布是無限的！使用滑鼠滾輪縮放，拖曳移動。

### 效能問題

**Q: 卡片很多時會變慢嗎？**

A: tldraw 引擎經過優化，可以處理數千張卡片。如果感到卡頓：
1. 關閉不需要的應用程式
2. 將卡片分散到不同看板
3. 重新啟動應用程式

**Q: 記憶體使用很高？**

A: Electron 應用程式會使用較多記憶體（約 200-500 MB），這是正常的。如需釋放記憶體，重新啟動應用程式即可。

### 錯誤排除

**Q: 應用程式當掉/無回應？**

A: 
1. 等待幾秒鐘（可能在處理大量資料）
2. 按 Ctrl + Shift + I 查看錯誤訊息
3. 重新啟動應用程式
4. 回報 Issue 並附上錯誤訊息

**Q: 快捷鍵不work？**

A: 
1. 確認沒有其他應用程式佔用快捷鍵
2. 確認焦點在應用程式視窗上
3. 重新啟動應用程式

**Q: 介面顯示不正常？**

A: 
1. 調整視窗大小
2. 按 F5 重新整理
3. 重新啟動應用程式
4. 檢查顯示縮放設定（建議 100%）

### 更新與解除安裝

**Q: 如何更新到新版本？**

A: 
1. 下載新版本安裝檔
2. 執行安裝（會自動覆蓋舊版）
3. 資料會自動保留

**Q: 解除安裝會刪除我的資料嗎？**

A: 不會！資料會保留在 `%APPDATA%`。如需完全移除：
1. 先解除安裝應用程式
2. 再手動刪除 `%APPDATA%\Scout-Astrolabe\` 資料夾

### 其他問題

**Q: 需要網路連線嗎？**

A: 不需要！完全離線可用。只有嵌入影片時需要網路。

**Q: 可以在多台電腦使用嗎？**

A: 可以！但資料不會自動同步。需要手動複製資料夾。

**Q: 有行動版嗎？**

A: 目前僅支援 Windows。未來可能推出網頁版。

**Q: 可以協作嗎？**

A: 目前不支援即時協作。這是長期規劃中的功能。

**Q: 開源嗎？**

A: 是的！MIT 授權，可以自由使用和修改。

---

## 🎯 開發路線圖

### ✅ v0.1.0（目前版本）- 2024 年 X 月

**核心功能**
- [x] Windows 桌面應用程式
- [x] 6 種卡片類型（文字、圖片、待辦、連結、看板、欄位）
- [x] 富文本編輯器（粗體、斜體、標題、清單、程式碼）
- [x] 影片嵌入支援（YouTube、Vimeo、Bilibili）
- [x] 8 種顏色主題
- [x] 本機自動儲存（IndexedDB）
- [x] 右鍵選單功能
- [x] 基本快捷鍵支援

**技術基礎**
- [x] Electron 整合
- [x] React + TypeScript
- [x] Vite 建置工具
- [x] tldraw 畫布引擎
- [x] TipTap 編輯器

---

### 🚧 v0.2.0（進行中）- 預計 2024 年 X 月

**卡片增強**
- [ ] 文字卡片文件模式（超過 200 字自動轉換）
- [ ] 圖片卡片裁切功能
- [ ] 待辦卡片進度條
- [ ] 連結卡片自動抓取縮圖和標題

**使用體驗優化**
- [ ] 卡片調整大小改進（保持比例、最小尺寸限制）
- [ ] 拖拽體驗優化（吸附對齊、智慧間距）
- [ ] 多選卡片群組操作
- [ ] 卡片對齊工具（左對齊、右對齊、均勻分布）

**效能提升**
- [ ] 虛擬化渲染（處理大量卡片）
- [ ] 圖片懶加載
- [ ] 記憶體優化

---

### 📋 v0.3.0（計劃中）- 預計 2025 年 Q1

**搜尋與組織**
- [ ] 全域搜尋功能（Ctrl + F）
  - 搜尋所有卡片內容
  - 即時高亮顯示
  - 跳轉到搜尋結果
- [ ] 標籤系統
  - 新增/編輯/刪除標籤
  - 標籤篩選
  - 顏色標籤
- [ ] 篩選與排序
  - 依類型篩選
  - 依顏色篩選
  - 依建立時間排序
  - 依修改時間排序

**多看板管理**
- [ ] 看板列表側邊欄
- [ ] 看板縮圖預覽
- [ ] 看板間快速切換
- [ ] 看板重新命名
- [ ] 看板複製/刪除

**匯出功能**
- [ ] 匯出為 PDF
- [ ] 匯出為圖片（PNG/JPG）
- [ ] 匯出為 Markdown
- [ ] 匯出選取的卡片

---

### 🌟 v0.4.0（未來規劃）- 預計 2025 年 Q2

**視覺與主題**
- [ ] 暗色模式
- [ ] 自訂主題顏色
- [ ] 更多卡片顏色（漸層、自訂色）
- [ ] 網格樣式選項
- [ ] 背景圖片支援

**更多卡片類型**
- [ ] 表格卡片
- [ ] 程式碼卡片（語法高亮）
- [ ] 檔案卡片（PDF 預覽）
- [ ] 音訊卡片
- [ ] 影片檔案卡片（本地影片）
- [ ] 繪圖卡片（手繪、塗鴉）
- [ ] 數學公式卡片（LaTeX）

**進階功能**
- [ ] 版本歷史（Undo/Redo 增強）
- [ ] 範本系統（卡片範本、看板範本）
- [ ] 鍵盤快捷鍵自訂
- [ ] 匯入功能（Markdown、JSON）
- [ ] 資料庫備份與還原

---

### 🚀 v1.0.0（長期目標）- 預計 2025 年 Q3-Q4

**雲端與同步**
- [ ] 雲端儲存選項（可選功能）
- [ ] 多裝置同步
- [ ] 資料加密

**協作功能**
- [ ] 即時協作（多人編輯）
- [ ] 評論系統
- [ ] @提及使用者
- [ ] 共享連結
- [ ] 權限管理

**跨平台**
- [ ] macOS 版本
- [ ] Linux 版本
- [ ] 網頁版

**整合與擴充**
- [ ] 瀏覽器擴充功能（快速剪輯）
- [ ] API 開放
- [ ] 插件系統
- [ ] 第三方服務整合（Google Drive、Dropbox）

**企業功能**
- [ ] 團隊工作區
- [ ] 管理員控制台
- [ ] 使用分析
- [ ] 自動更新機制

---

### 💡 社群建議功能

這些功能來自社群回饋，會根據需求優先級排入後續版本：

- [ ] AI 輔助功能（自動分類、摘要、建議）
- [ ] 語音輸入
- [ ] OCR 圖片文字辨識
- [ ] 心智圖模式
- [ ] 簡報模式
- [ ] 時間軸視圖
- [ ] 看板模式（Kanban）
- [ ] 行事曆整合
- [ ] 番茄鐘計時器
- [ ] 快捷指令（Shortcuts）

---

### 📊 版本發布節奏

- **小版本**（v0.X.Y）：每 4-6 週
- **中版本**（v0.X.0）：每 2-3 個月
- **大版本**（v1.0.0）：功能完整且穩定時

### 🗳️ 功能投票

想要某個功能優先實現？
- 前往 [GitHub Discussions](https://github.com/你的使用者名稱/Scout-Astrolabe/discussions)
- 在功能建議區投票或提出新想法

---

## 🤝 貢獻指南

感謝您考慮為 Scout Astrolabe 做出貢獻！

### 🌟 貢獻方式

#### 1. 回報 Bug

前往 [Issues](https://github.com/你的使用者名稱/Scout-Astrolabe/issues) 頁面，點擊「New Issue」。

**請提供**：
- 🖥️ Windows 版本（Win + R → `winver`）
- 📦 應用程式版本
- 📝 詳細的重現步驟
- 📸 截圖（如果適用）
- 💬 錯誤訊息（按 F12 查看 Console）

**範例**：
```markdown
**環境**
- Windows: Windows 11 22H2
- 應用程式版本: v0.1.0

**重現步驟**
1. 建立文字卡片
2. 輸入超過 500 字
3. 雙擊卡片

**預期行為**
應該能正常編輯

**實際行為**
應用程式當掉

**截圖**
[附上截圖]

**錯誤訊息**
```
TypeError: Cannot read property 'text' of undefined
```
```

#### 2. 建議新功能

前往 [Discussions](https://github.com/你的使用者名稱/Scout-Astrolabe/discussions)。

**請說明**：
- 💡 功能描述
- 🎯 使用情境
- ✨ 為什麼需要這個功能
- 📷 參考範例（如果有）

#### 3. 提交程式碼

**流程**：

```bash
# 1. Fork 專案
# 在 GitHub 頁面點擊 Fork 按鈕

# 2. Clone 到本機
git clone https://github.com/你的使用者名稱/Scout-Astrolabe.git
cd Scout-Astrolabe

# 3. 建立新分支
git checkout -b feature/your-feature-name

# 4. 進行修改
# ...編輯程式碼...

# 5. 測試修改
npm run dev
npm run lint

# 6. 提交變更
git add .
git commit -m "✨ Add your feature description"

# 7. 推送到你的 Fork
git push origin feature/your-feature-name

# 8. 建立 Pull Request
# 在 GitHub 上點擊 "New Pull Request"
```

### 📝 程式碼規範

#### Commit 訊息格式

使用 Emoji 前綴：

| Emoji | 類型 | 說明 |
|-------|------|------|
| ✨ `:sparkles:` | 新功能 | 新增功能 |
| 🐛 `:bug:` | Bug 修復 | 修復錯誤 |
| 📝 `:memo:` | 文檔 | 更新文檔 |
| 🎨 `:art:` | 程式碼品質 | 改善結構、格式 |
| ⚡ `:zap:` | 效能 | 提升效能 |
| ♻️ `:recycle:` | 重構 | 重構程式碼 |
| 🔧 `:wrench:` | 配置 | 修改配置檔案 |
| 🚀 `:rocket:` | 部署 | 部署相關 |
| 🔒 `:lock:` | 安全 | 安全性修復 |
| 💄 `:lipstick:` | UI | UI/樣式更新 |
| 🌐 `:globe_with_meridians:` | 國際化 | 語言翻譯 |
| ✅ `:white_check_mark:` | 測試 | 新增測試 |

**範例**：
```
✨ Add dark mode support
🐛 Fix card resize issue on Windows 11
📝 Update installation guide
```

#### TypeScript 規範

```typescript
// ✅ 好的做法
interface CardProps {
    id: string
    title: string
    color?: CardColor
}

function createCard(props: CardProps): void {
    // ...
}

// ❌ 避免
function createCard(props: any) {
    // ...
}
```

#### React 規範

```tsx
// ✅ 使用函數元件和 Hooks
function CardComponent({ title }: { title: string }) {
    const [isEditing, setIsEditing] = useState(false)
    return <div>{title}</div>
}

// ✅ 適當的 PropTypes
interface CardComponentProps {
    title: string
    onEdit?: () => void
}
```

#### CSS 規範

```css
/* ✅ 使用有意義的類別名稱 */
.card-container {
    display: flex;
    flex-direction: column;
}

/* ✅ 使用 CSS 變數 */
:root {
    --primary-color: #2f80ed;
    --card-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* ❌ 避免過度巢狀 */
.container .item .content .text {
    /* 太深了 */
}
```

### 🧪 測試指南

```bash
# 執行前端測試（未來）
npm test

# 執行 E2E 測試（未來）
npm run test:e2e

# 程式碼覆蓋率（未來）
npm run test:coverage
```

### 📋 Pull Request 檢查清單

提交 PR 前請確認：

- [ ] 程式碼遵循專案規範
- [ ] 通過 ESLint 檢查（`npm run lint`）
- [ ] TypeScript 無錯誤（`npx tsc --noEmit`）
- [ ] 功能已在本機測試
- [ ] 更新相關文檔（如果需要）
- [ ] Commit 訊息清楚明確
- [ ] PR 描述詳細說明變更內容

### 🎁 認可貢獻者

所有貢獻者會被列在：
- README 的致謝區
- GitHub Contributors 頁面
- 每次發布的 Release Notes

---

## 📄 授權資訊

### MIT License

```
MIT License

Copyright (c) 2024 [你的名字]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 這意味著什麼？

✅ **你可以**：
- 🆓 免費使用
- 📝 修改程式碼
- 📦 重新分發
- 💼 商業使用
- 🔒 私人使用

❌ **你不能**：
- 🚫 移除版權聲明
- ⚠️ 聲稱是你原創的

📜 **我們不提供**：
- 任何形式的保證
- 責任承擔

### 第三方套件授權

本專案使用的開源套件：

| 套件 | 授權 | 用途 |
|------|------|------|
| Electron | MIT | 桌面應用框架 |
| React | MIT | UI 框架 |
| tldraw | Apache 2.0 | 無限畫布 |
| TipTap | MIT | 富文本編輯器 |
| Dexie | Apache 2.0 | IndexedDB 包裝器 |
| Vite | MIT | 建置工具 |
| TypeScript | Apache 2.0 | 程式語言 |

完整的依賴列表請見 `package.json`。

---

## 🙏 致謝

### 靈感來源

**Milanote** - https://milanote.com/
- 本專案的主要設計靈感
- 優美的卡片式介面
- 直覺的使用體驗

### 核心技術

**tldraw** - https://tldraw.dev/
- 作者：[@steveruizok](https://github.com/steveruizok)
- 強大且靈活的無限畫布引擎
- 出色的效能和開發體驗

**TipTap** - https://tiptap.dev/
- 基於 ProseMirror 的富文本編輯器
- 模組化設計，易於擴展
- 優秀的 React 整合

**Electron** - https://www.electronjs.org/
- 跨平台桌面應用框架
- 讓 Web 技術能建構桌面應用
- 強大的社群支援

**Vite** - https://vitejs.dev/
- 作者：[@yyx990803](https://github.com/yyx990803)（Vue.js 作者）
- 極快的建置工具
- 出色的開發體驗

**React** - https://react.dev/
- Meta 開發的 UI 框架
- 豐富的生態系統

### 開發工具

- **TypeScript** - 型別安全的 JavaScript
- **ESLint** - 程式碼品質工具
- **Dexie** - 簡化 IndexedDB 操作

### 社群貢獻

感謝所有貢獻者：
- 🐛 Bug 回報
- 💡 功能建議
- 📝 文檔改進
- 💻 程式碼貢獻

### 特別感謝

- 所有提供回饋的早期使用者
- 開源社群的支持
- 你，使用這個應用程式的人！

---

## 📧 聯絡方式

### 取得協助

**GitHub Issues** - 回報 Bug 或技術問題
- https://github.com/你的使用者名稱/Scout-Astrolabe/issues
- 請先搜尋是否已有類似問題

**GitHub Discussions** - 一般討論、功能建議
- https://github.com/你的使用者名稱/Scout-Astrolabe/discussions
- 分享使用心得
- 功能投票

**Email** - 私人問題或商業詢問
- your.email@example.com
- 通常 24-48 小時內回覆

### 社群

（如果有的話）
- 💬 Discord 伺服器：[連結]
- 🐦 Twitter：[@你的帳號]
- 📺 YouTube 教學頻道：[連結]

### 開發者

**GitHub**: [@你的使用者名稱](https://github.com/你的使用者名稱)
**Website**: https://your-website.com（如果有）

---

## 🌟 支持專案

### 給個 Star！⭐

如果你覺得這個專案有幫助，請給個 Star！

[![GitHub stars](https://img.shields.io/github/stars/你的使用者名稱/Scout-Astrolabe.svg?style=social)](https://github.com/你的使用者名稱/Scout-Astrolabe/stargazers)

### 分享給朋友

- 📱 分享到社群媒體
- 💬 推薦給需要的人
- ✍️ 撰寫使用心得

### 回饋問題和建議

- 🐛 回報遇到的 Bug
- 💡 提出功能建議
- 📝 改進文檔

### 貢獻程式碼

- 💻 修復 Bug
- ✨ 開發新功能
- 🌐 翻譯成其他語言

---

## 📊 專案狀態

| 指標 | 狀態 |
|------|------|
| 版本 | ![Version](https://img.shields.io/badge/version-0.1.0-blue) |
| 建置 | ![Build](https://img.shields.io/badge/build-passing-brightgreen) |
| 平台 | ![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-0078D6) |
| 授權 | ![License](https://img.shields.io/badge/license-MIT-green) |
| 維護狀態 | ![Maintenance](https://img.shields.io/badge/maintained-yes-brightgreen) |

**最後更新**：2024 年 X 月 X 日

---

<p align="center">
  <img src="public/vite.svg" alt="Scout Astrolabe" width="100">
</p>

<h3 align="center">Scout Astrolabe</h3>

<p align="center">
  <strong>無限創意，本機儲存，隱私優先</strong>
</p>

<p align="center">
  Made with ❤️ for Windows<br>
  使用 React • TypeScript • Electron 建構
</p>

<p align="center">
  <a href="https://github.com/你的使用者名稱/Scout-Astrolabe">GitHub</a> •
  <a href="https://github.com/你的使用者名稱/Scout-Astrolabe/issues">Issues</a> •
  <a href="https://github.com/你的使用者名稱/Scout-Astrolabe/discussions">Discussions</a>
</p>

---

**© 2024 [你的名字]. All rights reserved.**
