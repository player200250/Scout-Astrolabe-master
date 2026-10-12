// trayTooltip.js — 系統匣圖示的提示文字：滑鼠移上去就看到今天的數字，不用打開 Desktop
//
// 數字來自主視窗發布的 Desktop 摘要（desktop:publish-summary）。主視窗不管 Desktop 開沒開都會發布，
// 所以 Desktop 關著也有數字；主視窗還沒就緒（summary＝null）就只顯示 App 名稱。
//
// 純函式、不 import electron，才能直接在 vitest 裡測。

export const TRAY_TITLE = 'Scout Astrolabe';
/** Windows 的托盤提示超過 127 字會被截掉 */
const MAX_LENGTH = 127;

/** @param {{ tasks: { overdueCount: number, todayCount: number }, inbox: { count: number } } | null} summary */
export function trayTooltip(summary) {
  if (!summary) return TRAY_TITLE;
  const { overdueCount, todayCount } = summary.tasks;
  const parts = [`今天待辦 ${overdueCount + todayCount}`];
  if (overdueCount > 0) parts.push(`逾期 ${overdueCount}`);
  parts.push(`收件匣 ${summary.inbox.count}`);
  return `${TRAY_TITLE}\n${parts.join('・')}`.slice(0, MAX_LENGTH);
}
