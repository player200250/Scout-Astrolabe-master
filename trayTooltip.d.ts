// trayTooltip.js 的型別宣告（main.js 是純 JS；給 src/ 裡的 TS 測試用）
export declare const TRAY_TITLE: string
export declare function trayTooltip(summary: { tasks: { overdueCount: number; todayCount: number }; inbox: { count: number } } | null): string
