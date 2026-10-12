// loginStartup.js — 開機自動啟動（Windows 登入項目）
//
// 開關的真實狀態存在 Windows（登錄檔 Run 機碼），不存 electron-store：使用者可能從
// 工作管理員「啟動應用程式」那頁關掉，兩邊各存一份就會不一致。每次都問系統。
//
// 開機啟動時多帶一個參數，App 看到它就把主視窗藏在系統匣、只留 Scout Desktop（如果上次開著）。
// 主視窗還是要建立：它是唯一的資料來源，Desktop 的數字都靠它發布。
//
// 只有安裝版能開：開發時的 process.execPath 是 node_modules 裡的 electron.exe，
// 註冊進去等於每次開機跑一個沒有 App 的 Electron。
//
// 純函式、不 import electron，才能直接在 vitest 裡測。

export const LOGIN_ARG = '--scout-login';

/** @param {readonly string[]} argv */
export function launchedAtLogin(argv) {
  return argv.includes(LOGIN_ARG);
}

/**
 * 開機啟動時要不要把主視窗藏起來。
 * 沒有托盤（圖示載入失敗）或使用者關了「最小化到托盤」時一定要顯示，不然視窗叫不回來。
 * @param {{ atLogin: boolean, hasTray: boolean, minimizeToTray: boolean }} s
 */
export function startHidden({ atLogin, hasTray, minimizeToTray }) {
  return atLogin && hasTray && minimizeToTray;
}

/** setLoginItemSettings／getLoginItemSettings 共用：Windows 要 path 跟 args 都一樣才認得是同一筆 */
export function loginItemOptions(execPath) {
  return { path: execPath, args: [LOGIN_ARG] };
}
