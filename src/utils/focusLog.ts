// src/utils/focusLog.ts
//
// 每天跑完幾個番茄、共幾分鐘（v1.8.4 測試報告 P2-5）。
//
// 為什麼要另記一份：番茄鐘本身只留「今天第幾個」（跨日歸零），待辦上的 focusCount 又只算
// 有綁待辦的那幾個，而且沒有日期。週回顧想說「這週專注了多少」，兩邊都湊不出來。
//
// 存 localStorage、以日期彙總（一天一筆，不記每一段）：一年也才幾 KB，不必動 Dexie schema。
// 代價：不進備份、不跨裝置同步——這是統計用的附帶資料，丟了不影響任何白板內容。

export const FOCUS_LOG_KEY = 'astrolabe-focus-log'
/** 只留最近這麼多天，避免無限長大 */
const KEEP_DAYS = 400

export interface FocusDay { count: number; minutes: number }
export type FocusLog = Record<string, FocusDay>

export function parseFocusLog(raw: string | null): FocusLog {
    if (!raw) return {}
    try {
        const obj = JSON.parse(raw) as unknown
        if (!obj || typeof obj !== 'object') return {}
        const out: FocusLog = {}
        for (const [ds, v] of Object.entries(obj as Record<string, unknown>)) {
            const d = v as Partial<FocusDay>
            if (/^\d{4}-\d{2}-\d{2}$/.test(ds) && typeof d?.count === 'number' && typeof d?.minutes === 'number') {
                out[ds] = { count: d.count, minutes: d.minutes }
            }
        }
        return out
    } catch { return {} }
}

/** 純函式：記一段跑完的專注，順便丟掉太舊的日子 */
export function addFocus(log: FocusLog, dateStr: string, minutes: number): FocusLog {
    const prev = log[dateStr] ?? { count: 0, minutes: 0 }
    const next: FocusLog = { ...log, [dateStr]: { count: prev.count + 1, minutes: prev.minutes + Math.round(minutes) } }
    const cutoff = new Date(`${dateStr}T00:00:00`)
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    for (const ds of Object.keys(next)) if (ds < cutoffStr) delete next[ds]
    return next
}

/** 純函式：[start, end] 這段日期（含頭尾，YYYY-MM-DD）合計 */
export function sumFocus(log: FocusLog, startStr: string, endStr: string): FocusDay {
    let count = 0, minutes = 0
    for (const [ds, d] of Object.entries(log)) {
        if (ds >= startStr && ds <= endStr) { count += d.count; minutes += d.minutes }
    }
    return { count, minutes }
}

export function loadFocusLog(): FocusLog {
    try { return parseFocusLog(localStorage.getItem(FOCUS_LOG_KEY)) } catch { return {} }
}

export function recordFocus(dateStr: string, minutes: number): void {
    try {
        localStorage.setItem(FOCUS_LOG_KEY, JSON.stringify(addFocus(loadFocusLog(), dateStr, minutes)))
    } catch { /* 配額滿／隱私模式：統計記不到就算了，計時器照常 */ }
}
