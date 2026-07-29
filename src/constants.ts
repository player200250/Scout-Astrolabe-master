export const HOME_BOARD_ID = 'home_board'
export const INBOX_BOARD_ID = 'inbox_board'
export const SIDEBAR_WIDTH = 220
export const SIDEBAR_COLLAPSED_WIDTH = 40
export const BACKUP_THROTTLE_MS = 5 * 60 * 1000

// 等待編輯器完成渲染後再執行跳轉（jump-to-card / jump-to-shape）
export const JUMP_DELAY_MS = 400

// 儲存成功狀態的顯示時間
export const SAVE_STATUS_RESET_MS = 400

// 白板縮圖產生（exportToBlob 整板 PNG，成本隨卡片數成長）：
// 超過此卡片數的白板跳過縮圖，避免高頻存檔時凍結/白屏
export const THUMBNAIL_SHAPE_LIMIT = 150
// 小板縮圖最短重產間隔（不跟著每次 500ms 存檔跑）
export const THUMBNAIL_MIN_INTERVAL_MS = 15000

// Z-index 層級規範
// 100   : 白板內部浮動 UI（工具列按鈕選單）
// 9999  : 白板匯出選單
// 19999 : 側邊 Panel（TaskCenter, WeeklyReview, FilterPanel）
// 29999 : BackupPanel
// 200   : overlay backdrop（SidebarFooter 小選單背景）
// Z_MODAL_BACKDROP : modal 半透明遮罩
// Z_MODAL          : modal 本體
// Z_TOAST          : 最高層通知（TD9 起由 ToastHost 使用，永遠疊在所有 modal 之上）
export const Z_TOOL_SUBMENU   = 9999    // 白板工具列的子選單
export const Z_PANEL          = 19999   // 側邊 Panel（TaskCenter / FilterPanel / WeeklyReview）
// A2：全螢幕內容面板原本在各元件裡硬編碼 20000（垃圾桶是 50000），收成兩個常數。
// 兩層之差刻意保留——垃圾桶原本就疊得比其他全螢幕面板高，統一時不默默改變疊放行為。
export const Z_FULLSCREEN_PANEL       = 20000
export const Z_FULLSCREEN_PANEL_ABOVE = 50000
export const Z_BACKUP_PANEL   = 29999   // 備份 Panel
export const Z_MODAL_BACKDROP = 99998   // Modal 半透明暗色遮罩
// A2：置中 modal 的版位。原本搜尋 15%／命令面板 15%／快速切換 18%／快捷鍵 50%，
// 寬度 520／520／480／560，遮罩 .25／.35／.35／.3——每開一個都落在不同位置。
// 收成同一組值，新的 modal 直接套用即可。
export const MODAL_TOP        = '15%'
export const MODAL_WIDTH      = 520
export const MODAL_BACKDROP   = 'rgba(0,0,0,0.35)'
export const Z_CLICK_AWAY     = Z_MODAL_BACKDROP - 1  // 浮動選單的透明點擊遮罩
export const Z_MODAL          = 99999   // Modal 本體
// ContextMenu 的重命名 inline dialog，需疊在 context menu（99999）之上
export const Z_ABOVE_MODAL    = 999999
// Toast：非阻塞通知，必須看得到＝疊在包含 Z_ABOVE_MODAL 在內的一切之上
export const Z_TOAST          = 1000000
