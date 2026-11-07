# ADR 0010：Claude Code 經 MCP 讀寫白板，寫入一律回到主視窗執行

## 狀態

草案（2026-11-07），待使用者拍板。分支 `feat/mcp-bridge`。
沿用 [0009 Scout Desktop](0009-scout-desktop-scope.md) 的「主視窗唯一寫入者」原則。

---

## 背景

目前 Claude Code 改白板靠 CDP 遠端操控視窗（`--remote-debugging-port`、找 React fiber 拿 editor）。問題：

- 只能在 `ELECTRON_PROD_TEST` 開的實例做，安裝版沒有 debug port。
- 腳本每次現寫，座標、時序、選擇器都踩過坑（見 run-desktop skill）。
- 直寫 IndexedDB 會被開著的板自動存檔蓋掉（記憶 gotcha_seed_cards_autosave）。

---

## 決策

**三段式：Claude Code ⇄ stdio MCP 橋接腳本 ⇄ main process 本機 HTTP ⇄ 主視窗 renderer 執行。**

```
claude ──stdio──▶ scripts/scout-mcp.js ──HTTP 127.0.0.1──▶ main.js ──IPC──▶ 主視窗（唯一寫入者）
```

1. **main 只轉送，不碰資料**。收到請求 → 驗 token → 白名單檢查 → `webContents.send('mcp:request')` → 等 renderer 回 `mcp:response`（逾時 10 秒）。
2. **renderer 用既有的 handler 執行**（例如新增卡片走 `handleAddCardToInbox`），與手動操作同一條路，所以自動存檔、雲端同步、復原都照常。
3. **只綁 `127.0.0.1`、隨機 port、隨機 token**；兩者寫在 userData 的 `mcp-endpoint.json`，橋接腳本每次讀它。App 沒開 ⇒ 工具回「Scout 沒有開」，不會偷偷啟動。
4. **預設關閉**，托盤選單勾「允許 Claude Code 連線」才啟用（存 electron-store `mcpEnabled`）。
6. **請求排隊、一次一個**（`useMcpBridge`）：寫入 handler 從 React state 算新 snapshot，連續兩次寫同一塊板時，第二次要等第一次的 `setBoards` 生效，否則會拿舊 snapshot 蓋掉第一次。
5. **不提供刪除**。v1 白名單：

| 工具 | 讀/寫 | 內容 |
|---|---|---|
| `list_boards` | 讀 | 白板名稱、id、資料夾、最後修改 |
| `read_board` | 讀 | 一塊板上的卡片：id、型別、標題、純文字（不含圖片） |
| `search_cards` | 讀 | 全域搜尋，回卡片＋所在白板 |
| `list_todos` | 讀 | 待辦：今日／逾期／全部，含到期日與勾選狀態 |
| `add_to_inbox` | 寫 | 在收件匣新增一張文字卡 |
| `set_todo_checked` | 寫 | 勾／取消勾一項待辦 |
| `set_todo_due` | 寫 | 改一項待辦的到期日 |

每次寫入在 userData 的 `mcp-log.jsonl` 留一行（時間、工具、目標 id），方便事後查。

---

## 驗收標準

1. 安裝版開著、開關打開：`claude mcp list` 顯示 scout 已連線。
2. 四個讀取工具的結果與畫面一致（抽一塊板、任務中心逾期數＝首頁「逾期」數）。
3. `add_to_inbox` 後：首頁收件匣立刻看得到；**重開 App 後仍在**。
4. `set_todo_checked`／`set_todo_due` 後切走再切回該板仍保留；**該板正開著時**能 Ctrl+Z 復原（沒開著的板沒有 editor、沒有復原紀錄，要改回就再呼叫一次）。
5. App 關著、開關關著、token 錯：都回清楚的錯誤，不寫任何東西。
6. 打包前先升版號、補 CHANGELOG；`npm test` 全綠、`npm run build` 通過。

## 不做（之後再說）

- App 內嵌終端機、App 內 AI 助手（11/07 使用者決定延後）。
- 刪除、搬移卡片、改富文字內容。
