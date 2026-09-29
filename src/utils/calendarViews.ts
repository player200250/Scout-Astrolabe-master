// src/utils/calendarViews.ts — 月曆的多檢視資料層（純函式）
//
// 2026-09-20：月曆加上「小時／日／週／月／年」五種檢視（參考 Google Calendar）。
//
// ⚠️ 資料面的前提，看這裡再往下讀：
//   待辦只有 `dueDate`（'YYYY-MM-DD'，**沒有時刻**），日記卡也是整天的。
//   全專案唯一帶時刻的是 `BoardRecord.updatedAt`。
//   所以時間軸（小時／週檢視）上只放得了「白板活動」，日記與待辦一律進 Google 式的
//   **全天列**。這不是偷懶，是資料模型現在就長這樣；哪天待辦有了 dueTime，
//   只要讓 buildDayTimeline 把它塞進 timed 就好，UI 不用改。
//
// 另一個沿用 buildMonthEvents 的語意限制：BoardRecord 只有一個 updatedAt，
// 所以「白板活動」是**最後一次更新落在哪個時刻**，不是那天動過幾次。

import type { BoardRecord } from '../db'
import { toDateStr as dateStr } from './date'
import { getCardShapes } from './snapshot'
import type { DayTodo } from './calendarEvents'

// 2026-09-29：原本是五種檢視，其中 'hour' 是單日 24 小時軸，而 'day' 是議程清單。
// 兩個都是「看一天」，名字卻分成「小時」與「日」，且議程清單以 Journal 開頭，
// 等於把日記入口擺在日曆正中央。改為 'day' 直接沿用 24 小時軸（與週檢視同一套），
// 日記只留右側議程欄與復盤中心的「今日日記」分頁。
export type CalendarViewMode = 'day' | 'week' | 'month' | 'year'

export const VIEW_MODES: { key: CalendarViewMode; label: string }[] = [
    { key: 'day',   label: '日' },
    { key: 'week',  label: '週' },
    { key: 'month', label: '月' },
    { key: 'year',  label: '年' },
]

/** 時間軸上的一筆：白板在這個時刻被更新 */
export interface TimedActivity {
    boardId: string
    boardName: string
    at: number
    hour: number
    minute: number
}

/** 一天的完整內容：全天列（日記／待辦）＋ 時間軸（白板活動） */
export interface DayTimeline {
    ds: string
    date: Date
    hasJournal: boolean
    todos: DayTodo[]
    timed: TimedActivity[]
}

export function startOfDay(d: Date): Date {
    const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}

/** 週一為一週之始（與 getWeekRange／週回顧同一套邊界，兩邊才對得上） */
export function startOfWeek(d: Date): Date {
    const r = startOfDay(d)
    const day = r.getDay() || 7
    r.setDate(r.getDate() - (day - 1))
    return r
}

export function addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(r.getDate() + n); return r
}

/** 一天的內容。boards 已含全部白板，這裡自己過濾主頁／收件匣（與 buildMonthEvents 一致）。 */
export function buildDayTimeline(boards: BoardRecord[], date: Date): DayTimeline {
    const ds = dateStr(date)
    const out: DayTimeline = { ds, date: startOfDay(date), hasJournal: false, todos: [], timed: [] }
    for (const board of boards) {
        if (board.isHome || board.isInbox) continue
        const at = new Date(board.updatedAt)
        if (dateStr(at) === ds) {
            out.timed.push({
                boardId: board.id, boardName: board.name, at: board.updatedAt,
                hour: at.getHours(), minute: at.getMinutes(),
            })
        }
        for (const shape of getCardShapes(board.snapshot)) {
            if (board.isJournal && shape.props.type === 'journal' && shape.props.journalDate === ds) {
                out.hasJournal = true
            }
            if (shape.props.type === 'todo') {
                for (const t of shape.props.todos ?? []) {
                    if (t.dueDate === ds) out.todos.push({ text: t.text ?? '', checked: !!t.checked })
                }
            }
        }
    }
    out.timed.sort((a, b) => a.at - b.at)
    return out
}

/** 一週七天（週一起算）。給週檢視用。 */
export function buildWeekTimelines(boards: BoardRecord[], anyDayInWeek: Date): DayTimeline[] {
    const monday = startOfWeek(anyDayInWeek)
    return Array.from({ length: 7 }, (_, i) => buildDayTimeline(boards, addDays(monday, i)))
}

/**
 * 一整年每天的「事件密度」：日記算 1、每筆待辦算 1、白板活動算 1。
 * 年檢視只需要濃淡，不需要細節——細節點進去看日檢視。
 */
export function buildYearDensity(boards: BoardRecord[], year: number): Map<string, number> {
    const prefix = `${year}-`
    const map = new Map<string, number>()
    const bump = (ds: string, n = 1) => map.set(ds, (map.get(ds) ?? 0) + n)
    for (const board of boards) {
        if (board.isHome || board.isInbox) continue
        const boardDs = dateStr(new Date(board.updatedAt))
        if (boardDs.startsWith(prefix)) bump(boardDs)
        for (const shape of getCardShapes(board.snapshot)) {
            if (board.isJournal && shape.props.type === 'journal' && shape.props.journalDate?.startsWith(prefix)) {
                bump(shape.props.journalDate)
            }
            if (shape.props.type === 'todo') {
                for (const t of shape.props.todos ?? []) {
                    if (t.dueDate?.startsWith(prefix)) bump(t.dueDate)
                }
            }
        }
    }
    return map
}

/** 密度分級：0–4，給年檢視的色階用（0 ＝ 無事件） */
export function densityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count <= 0) return 0
    if (count === 1) return 1
    if (count <= 3) return 2
    if (count <= 6) return 3
    return 4
}

/**
 * 星期短名，**索引即 Date.getDay()**（0=日）。只給「由日期查名稱」用，
 * 不要直接 map 出表頭——格線是週一起頭的，順序不同，用 WEEKDAY_HEADER。
 */
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 格線表頭的顯示順序：週一起頭。
 * 全站的「週」都是 ISO 週——startOfWeek 取週一、getISOWeekKey 產出 week-YYYY-WW，
 * 而既有的週回顧卡就是用那個鍵存的，所以 ISO 不能動；月／年檢視只能跟著它走，
 * 否則月格子裡的一橫排和「第 40 週」講的不是同一週。（2026-09-29）
 */
export const WEEKDAY_HEADER = ['一', '二', '三', '四', '五', '六', '日']

/** 該日在週一起頭的格線中位於第幾欄（0=週一 … 6=週日） */
export function weekdayColumn(date: Date): number {
    return (date.getDay() + 6) % 7
}
/** 星期全名（議程標題） */
export const WEEKDAY_FULL_LABEL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']


/** 標題列要顯示的期間文字 */
export function viewRangeLabel(view: CalendarViewMode, date: Date): string {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    switch (view) {
        case 'day':
            return `${y} 年 ${m} 月 ${d} 日 星期${WEEKDAYS[date.getDay()]}`
        case 'week': {
            const s = startOfWeek(date)
            const e = addDays(s, 6)
            return `${s.getFullYear()} 年 ${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`
        }
        case 'month':
            return `${y} 年 ${m} 月`
        case 'year':
            return `${y} 年`
    }
}

/** 上一頁／下一頁：每種檢視跨的單位不同 */
export function shiftViewDate(view: CalendarViewMode, date: Date, delta: number): Date {
    const r = new Date(date)
    switch (view) {
        case 'day':
            r.setDate(r.getDate() + delta); break
        case 'week':
            r.setDate(r.getDate() + delta * 7); break
        case 'month':
            r.setMonth(r.getMonth() + delta); break
        case 'year':
            r.setFullYear(r.getFullYear() + delta); break
    }
    return r
}
