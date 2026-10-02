// src/utils/weeklyReviewUtils.ts
// 週次計算 utilities（從 WeeklyReview.tsx 拆出）

import type { BoardRecord } from '../db'
import { getCardShapes } from './snapshot'
import { cardActiveIn, todoCompletedIn, trackingCoverage } from './cardActivity'
import type { TrackingCoverage } from './cardActivity'
import type { TodoItem } from '../components/card-shape/type/CardShape'

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

/**
 * 以 anchor 所在的那一週為**最後一格**，往回數 count 週，回傳每週的週一（由舊到新）。
 *
 * 給週回顧左欄的走勢圖用：最右邊永遠是目前正在看的那一週，往左是更早的。
 * 走勢圖同時兼任導覽（點某一格就跳到那週），所以視窗跟著 anchor 移動，
 * 而不是固定在「今天」——否則翻到過去的週就看不到它前後的脈絡了。
 */
export function recentWeekStarts(anchor: Date, count: number): Date[] {
    const { start } = getWeekRange(anchor)
    const out: Date[] = []
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(start)
        d.setDate(start.getDate() - i * 7)
        out.push(d)
    }
    return out
}

/**
 * 這一週屬於哪個月——看它的**週四**。
 *
 * ISO 週是週一到週日，不跟月份對齊：第 40 週是 9/28–10/4，三天在九月、四天在十月。
 * 規則沿用 getISOWeekKey 判斷「屬於哪一年」的同一條（那裡也是取週四），
 * 年與月才不會互相打架。第 40 週的週四是 10/1 ⇒ 歸十月，於是九月剛好四週。
 */
export function weekOwnerMonth(weekStart: Date): { year: number; month: number } {
    const thu = new Date(weekStart)
    thu.setDate(weekStart.getDate() + 3)
    return { year: thu.getFullYear(), month: thu.getMonth() }
}

/** 某年某月涵蓋哪幾週（回傳每週的週一，由舊到新） */
export function weeksOfMonth(year: number, month: number): Date[] {
    // 從「該月 1 號所在週」的前一週開始掃，掃 7 週足以覆蓋任何月份的邊界
    const first = getWeekRange(new Date(year, month, 1)).start
    const out: Date[] = []
    for (let i = -1; i <= 5; i++) {
        const w = new Date(first)
        w.setDate(first.getDate() + i * 7)
        const o = weekOwnerMonth(w)
        if (o.year === year && o.month === month) out.push(w)
    }
    return out
}

/** 月鍵值，如 "month-2026-09"（給未來若要存月回顧卡用；目前月回顧是自動整理、不存卡） */
export function getMonthKey(year: number, month: number): string {
    return `month-${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * 某段期間的統計。名字裡的 Week 是歷史包袱——它吃的是任意起訖，
 * 月／年整理直接把整段範圍餵進來就好，不必逐週加總（逐週加總會把
 * 「同一塊板在兩週都更新過」重複計入）。
 */
export interface RangeStats {
    /** 期間內建立或改過內容的卡片，依白板分組（RC16：看卡片自己的 meta，不再看白板更新時間） */
    cardsByBoard: { boardName: string; count: number }[]
    totalCards: number
    /** 期間內打勾的待辦；10/02 之前勾的沒有 checkedAt，退回看到期日 */
    completedTodos: number
    /** 期間內動過的卡片裡的 [[連結]] 數 */
    wikiLinks: number
    /** 期間內寫了日記的天數（日記卡本來就帶日期，過去的週也算得出來） */
    journalDays: number
    /**
     * 卡片／連結這兩項有沒有紀錄：none＝整段在 2026-10-02 開始記錄之前，只能顯示「無紀錄」；
     * partial＝跨過那天，前半段沒算到。完成待辦與日記天數不受影響。
     */
    coverage: TrackingCoverage
}

export function computeRangeStats(boards: BoardRecord[], rangeStart: Date, rangeEnd: Date): RangeStats {
    const cardsByBoard: { boardName: string; count: number }[] = []
    let completedTodos = 0
    let wikiLinks = 0
    const journalDates = new Set<string>()
    const startDs = toLocalDateStr(rangeStart), endDs = toLocalDateStr(rangeEnd)
    for (const board of boards) {
        let count = 0
        for (const shape of getCardShapes(board.snapshot)) {
            const p = shape.props
            completedTodos += ((p.todos ?? []) as TodoItem[]).filter(t => todoCompletedIn(t, rangeStart, rangeEnd)).length
            const jd = p.journalDate
            if (board.isJournal && p.type === 'journal' && typeof jd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(jd) && jd >= startDs && jd <= endDs) {
                journalDates.add(jd)
            }
            if (!cardActiveIn(shape.meta, rangeStart, rangeEnd)) continue
            count++
            const matches = p.text?.match(/\[\[[^\]]+\]\]/g)
            if (matches) wikiLinks += matches.length
        }
        if (count > 0) cardsByBoard.push({ boardName: board.name, count })
    }
    cardsByBoard.sort((a, b) => b.count - a.count)
    return {
        cardsByBoard, totalCards: cardsByBoard.reduce((s, b) => s + b.count, 0),
        completedTodos, wikiLinks, journalDays: journalDates.size,
        coverage: trackingCoverage(rangeStart, rangeEnd),
    }
}

function toLocalDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
