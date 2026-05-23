// src/utils/weeklyReviewUtils.ts
// 週次計算 utilities（從 WeeklyReview.tsx 拆出）

/** 回傳 ISO 週次鍵值，如 "week-2026-22" */
export function getISOWeekKey(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `week-${d.getUTCFullYear()}-${String(weekNum).padStart(2, '0')}`
}

/** 回傳指定日期所在週的 Monday 00:00 / Sunday 23:59:59 與週次號 */
export function getWeekRange(date: Date): { start: Date; end: Date; weekNum: number } {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const day = d.getDay() || 7
    const monday = new Date(d)
    monday.setDate(d.getDate() - (day - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    const thu = new Date(monday)
    thu.setDate(monday.getDate() + 3)
    const yearStart = new Date(thu.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return { start: monday, end: sunday, weekNum }
}
