# 🚀 Scout Astrolabe

一個受 Milanote 啟發的 Windows 桌面白板應用程式，使用 React + Electron + tldraw 建構。

![Version](https://img.shields.io/badge/version-0.2.0-blue)
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
- 標題（H1-H2）
- 項目符號清單
- 編號清單
- 程式碼區塊
- 6 種文字顏色
- 自動調整高度
- 全螢幕編輯模式

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
- 🎬 YouTube 影片嵌入（含 Shorts）
- 📺 Vimeo 影片嵌入
- 📹 Bilibili 影片嵌入（BV/AV 格式）
- 自動辨識影片連結
- 雙擊播放模式
- 單擊開啟網頁

#### 5. Board 卡片（子白板）
- 📋 雙擊進入子白板
- 顯示子白板縮圖預覽
- 麵包屑導航（主板 › 子板 › 孫板）
- 支援無限層級巢狀
- 自動在父板建立 Board 卡片
- 右鍵管理子板（設為子板、升為主板、刪除）
- 進入白板時自動建立下一層子板卡片

#### 6. 欄位卡片（Frame 容器）
- 📊 使用 tldraw 內建 Frame
- 卡片可自由拖入拖出
- 有標題，雙擊可編輯
- 顯示容納卡片數量
- 可自由調整大小

### 🎨 精美的視覺設計

- **Milanote 風格點狀網格背景** - 經典的設計靈感
- **9 種卡片顏色主題**：
  - 🤍 白色（預設）
  - ❤️ 紅色
  - 🧡 橙色
  - 💛 黃色
  - 💚 綠色
  - 💙 藍色
  - 💜 紫色
  - 🩷 粉紅色
  - 🖤 深色
- **頂部色條設計** - Milanote 經典元素
- **雙層陰影系統** - 提供立體深度感
- **編輯狀態視覺回饋** - 清楚的狀態指示
- **流暢的懸浮動畫** - 微妙的互動效果

### 🛠️ 強大的核心功能

- ⚡ **自動儲存** - 500ms 防抖機制，不會丟失任何內容
- 📏 **自由調整大小** - 所有卡片都可以拖拽調整
- 🎯 **精確拖曳定位** - 像素級精準控制
- 🖱️ **從工具列拖曳建立卡片** - 拖到指定位置放手即建立
- 📋 **Ctrl+V 貼上** - 支援貼上圖片和網址自動建立卡片
- 🔍 **全域搜尋** - 跨白板搜尋所有卡片內容（Ctrl+F）
- 📤 **匯出功能** - 匯出整個白板或選取卡片為 PNG/PDF
- ⌨️ **鍵盤快捷鍵** - 提升工作效率
- 🖱️ **右鍵選單** - 快速操作
- 💾 **本機儲存** - 資料完全保存在您的電腦上
- 🔒 **隱私保護** - 不需要帳號，不上傳雲端
- 🌐 **完全離線** - 無需網路連線即可使用
- 📐 **對齊工具** - 多卡片對齊排列功能

---

## 📸 截圖展示

*（建議在此處加入 2-3 張應用程式截圖）*

---

## 🚀 快速開始

### 方法 1：下載安裝檔（一般使用者）

1. 前往 [Releases](https://github.com/你的使用者名稱/Scout-Astrolabe/releases) 頁面
2. 下載最新版本的 `Scout-Astrolabe-Setup-0.2.0.exe`
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

---

## 📦 安裝指南

### 標準安裝

1. **下載安裝檔**
   - 前往 [Releases](https://github.com/你的使用者名稱/Scout-Astrolabe/releases)
   - 下載 `Scout-Astrolabe-Setup-0.2.0.exe`

2. **執行安裝程式**
   - 雙擊下載的 `.exe` 檔案
   - Windows 可能會顯示「Windows 已保護您的電腦」警告
   - 點擊「詳細資訊」→「仍要執行」

3. **完成安裝**
   - 安裝完成後可選擇立即啟動
   - 或從開始選單 / 桌面捷徑啟動

### 解除安裝

1. 開啟 Windows 設定（Win + I）
2. 前往「應用程式」→「應用程式與功能」
3. 找到「Scout Astrolabe」→「解除安裝」

**注意**：解除安裝不會刪除您的資料，資料位於 `%APPDATA%\Scout-Astrolabe\`

---

## 📖 使用說明

### 建立卡片

| 方式 | 說明 |
|------|------|
| 點擊側邊欄按鈕 | 在畫面中央建立卡片 |
| 從側邊欄拖曳 | 拖到指定位置放手建立 |
| 快捷鍵 | 使用鍵盤快速建立 |
| Ctrl+V | 貼上圖片或網址自動建立 |

### 子白板管理

1. **建立子白板** - 點擊側邊欄的 📋 按鈕，自動建立新白板並關聯
2. **進入子白板** - 雙擊 Board 卡片
3. **返回上層** - 點擊頂部麵包屑或「← 返回」按鈕
4. **設為子板** - 在 Tab 欄右鍵白板 → 設為子板
5. **升為主板** - 在子板清單中點擊「↑主板」
6. **查看子板** - 右鍵主板 Tab，底部顯示子板清單

### 匯出

點擊右上角「匯出圖片 ▾」，選擇：
- 🖼️ 整個白板 → PNG
- 🖼️ 選取卡片 → PNG
- 📄 整個白板 → PDF
- 📄 選取卡片 → PDF

---

## ⌨️ 鍵盤快捷鍵

### 基本操作

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + C` | 複製選取的卡片 |
| `Ctrl + V` | 貼上（支援圖片/網址） |
| `Ctrl + X` | 剪下 |
| `Ctrl + A` | 全選 |
| `Ctrl + D` | 複製卡片 |
| `Delete` | 刪除選取的卡片 |
| `Ctrl + Z` | 復原 |
| `Ctrl + Shift + Z` | 重做 |

### 建立卡片

| 快捷鍵 | 功能 |
|--------|------|
| `1` | 建立文字卡片 |
| `2` | 建立待辦卡片 |
| `3` | 建立連結卡片 |

### 搜尋與導航

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + F` | 開啟全域搜尋 |
| `?` | 顯示快捷鍵說明 |
| `ESC` | 取消當前操作 / 關閉 Modal |

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
| `空白鍵 + 拖曳` | 平移畫布 |

---

## 🏗️ 技術架構

### 核心技術棧

```
桌面層
├── Electron                 # 桌面應用框架

前端層
├── React 19                 # UI 框架
├── TypeScript               # 型別安全
├── Vite                     # 建置工具
└── tldraw                   # 無限畫布引擎

編輯器層
└── TipTap                   # 富文本編輯器
    ├── StarterKit
    ├── Underline
    ├── TextStyle
    ├── Color
    └── CodeBlock

資料層
└── Dexie.js                 # IndexedDB 包裝器
```

### 專案架構

```
Scout-Astrolabe/
├── src/
│   ├── components/
│   │   └── card-shape/
│   │       ├── CardShapeUtil.tsx     # 卡片核心邏輯
│   │       ├── type/
│   │       │   └── CardShape.ts      # 型別定義、顏色常數
│   │       └── sub-components/
│   │           ├── TextContent.tsx   # 文字卡片
│   │           ├── ImageContent.tsx  # 圖片卡片
│   │           ├── TodoContent.tsx   # 待辦卡片
│   │           ├── LinkContent.tsx   # 連結卡片
│   │           └── BoardContent.tsx  # Board 卡片
│   ├── App.tsx                       # 主應用程式
│   ├── TIdrawToolPanel.tsx           # 側邊工具列
│   ├── SearchPanel.tsx               # 全域搜尋
│   ├── HotkeyPanel.tsx               # 快捷鍵說明
│   └── ContextMenu.tsx               # 右鍵選單
├── main.js                           # Electron 主程序
└── preload.js                        # 安全橋接
```

---

## 🛠️ 開發指南

### 環境準備

- **Node.js** 18.0.0 或更新版本
- **npm** 9.0.0 或更新版本

```bash
# 安裝依賴
npm install

# 啟動開發模式
npm run dev

# 程式碼檢查
npm run lint

# 建置 Windows 安裝檔
npm run build:win
```

---

## ❓ 常見問題

**Q: 我的資料儲存在哪裡？**
A: `%APPDATA%\Scout-Astrolabe\`

**Q: 資料會自動儲存嗎？**
A: 會！每次編輯後 500ms 自動儲存。

**Q: 如何備份資料？**
A: 複製 `%APPDATA%\Scout-Astrolabe\` 資料夾到安全位置。

**Q: 影片無法播放？**
A: 確認網路連線正常，某些影片可能被創作者限制嵌入。

**Q: 安裝時顯示 Windows 警告？**
A: 點擊「詳細資訊」→「仍要執行」，這是正常的 SmartScreen 警告。

**Q: 需要網路連線嗎？**
A: 不需要，完全離線可用。只有嵌入影片時需要網路。

---

## 🎯 開發路線圖

### ✅ v0.2.0（目前版本）

- [x] 9 種卡片顏色主題（含頂部色條）
- [x] 從工具列拖曳建立卡片
- [x] Ctrl+V 貼上圖片與網址
- [x] 匯出 PNG/PDF（整個白板或選取卡片）
- [x] Board 卡片（子白板，縮圖預覽）
- [x] 欄位分組（tldraw Frame，可拖入拖出）
- [x] 麵包屑導航與多層子板管理
- [x] 全域搜尋（Ctrl+F）
- [x] YouTube Shorts 與 Bilibili 嵌入播放
- [x] 圖片全螢幕預覽（React Portal）
- [x] 對齊工具（靠左、置中、靠右、靠上、置中、靠下）
- [x] 6 種文字顏色（TipTap）
- [x] 文字卡片全螢幕編輯模式

### 📋 v0.3.0（計劃中）

- [ ] 暗色模式
- [ ] 表格卡片
- [ ] 卡片標籤系統
- [ ] 多選群組操作
- [ ] 範本系統
- [ ] 匯入 JSON 改進
- [ ] 連結卡片自動抓取縮圖

### 🚀 v1.0.0（長期目標）

- [ ] 雲端儲存（可選）
- [ ] 多裝置同步
- [ ] 即時協作
- [ ] macOS / Linux 版本
- [ ] AI 輔助功能

---

## 🤝 貢獻指南

歡迎提交 Issue 或 Pull Request！

```bash
# Fork 後
git checkout -b feature/your-feature
git commit -m "✨ 新增你的功能"
git push origin feature/your-feature
# 建立 Pull Request
```

### Commit 格式

| Emoji | 類型 |
|-------|------|
| ✨ | 新功能 |
| 🐛 | Bug 修復 |
| 📝 | 文檔更新 |
| 🎨 | 程式碼品質 |
| ⚡ | 效能優化 |
| ♻️ | 重構 |

---

## 📄 授權資訊

MIT License © 2024

完整授權內容請見 [LICENSE](LICENSE)。

### 第三方套件

| 套件 | 授權 |
|------|------|
| Electron | MIT |
| React | MIT |
| tldraw | Apache 2.0 |
| TipTap | MIT |
| Dexie | Apache 2.0 |
| Vite | MIT |

---

## 🙏 致謝

- **Milanote** - 主要設計靈感
- **tldraw** - 強大的無限畫布引擎
- **TipTap** - 優秀的富文本編輯器
- **Electron** - 跨平台桌面應用框架

---

<p align="center">
  <strong>Scout Astrolabe</strong><br>
  無限創意，本機儲存，隱私優先<br><br>
  Made with ❤️ using React • TypeScript • Electron
</p>

<p align="center">
  <a href="https://github.com/你的使用者名稱/Scout-Astrolabe/issues">Issues</a> •
  <a href="https://github.com/你的使用者名稱/Scout-Astrolabe/discussions">Discussions</a>
</p>

---

**© 2024 [你的名字]. All rights reserved.**