// src/utils/calendarViews.test.ts
//
// 五種檢視的資料層。這裡釘住的是「哪些東西進得了時間軸、哪些只能進全天列」——
// 待辦沒有時刻，所以它永遠不該出現在 timed 裡；白板活動有 updatedAt，所以它永遠在 timed。
import { describe, it, expect } from 'vitest'
import {
    buildDayTimeline, buildWeekTimelines, buildYearDensity, densityLevel,
    startOfWeek, shiftViewDate, viewRangeLabel, weekdayColumn,
    slotMinutes, hourSlot, moveSlot, formatMinutes,
} from './calendarViews'
import type { BoardRecord } from '../db'

const at = (s: string) => new Date(s).getTime()

const board = (over: Partial<BoardRecord> & { id: string }): BoardRecord => ({
    name: '板',
    snapshot: null,
    thumbnail: null,
    updatedAt: at('2026-09-20T10:30:00'),
    ...over,
} as BoardRecord)

const withCards = (cards: Record<string, unknown>[]) => ({
    document: {
        store: Object.fromEntries(cards.map((props, i) => [
            `shape:c${i}`,
            { id: `shape:c${i}`, typeName: 'shape', type: 'card', x: 0, y: 0, props },
        ])),
    },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

describe('buildDayTimeline', () => {
    it('白板活動依 updatedAt 落在時間軸上（帶時分）', () => {
        const b = board({ id: 'b1', name: '作品集', updatedAt: at('2026-09-20T14:05:00') })
        const t = buildDayTimeline([b], new Date('2026-09-20T00:00:00'))
        expect(t.timed).toHaveLength(1)
        expect(t.timed[0]).toMatchObject({ boardName: '作品集', hour: 14, minute: 5 })
    })

    it('待辦沒有時刻，只進全天列、不進時間軸', () => {
        const b = board({
            id: 'b1',
            snapshot: withCards([{ type: 'todo', todos: [{ text: '綁骨', checked: false, dueDate: '2026-09-20' }] }]),
            updatedAt: at('2026-01-01T00:00:00'), // 當天沒有白板活動
        })
        const t = buildDayTimeline([b], new Date('2026-09-20T00:00:00'))
        expect(t.todos).toMatchObject([{ text: '綁骨', checked: false }])
        expect(t.timed).toHaveLength(0)
    })

    it('journal 卡只在 isJournal 白板上才算日記', () => {
        const j = board({ id: 'b1', isJournal: true, snapshot: withCards([{ type: 'journal', journalDate: '2026-09-20' }]) })
        const notJ = board({ id: 'b2', snapshot: withCards([{ type: 'journal', journalDate: '2026-09-20' }]) })
        expect(buildDayTimeline([j], new Date('2026-09-20T00:00:00')).hasJournal).toBe(true)
        expect(buildDayTimeline([notJ], new Date('2026-09-20T00:00:00')).hasJournal).toBe(false)
    })

    it('日誌板的更新不算白板活動，但板上的日記照樣算（RC12）', () => {
        const j = board({
            id: 'j', isJournal: true, updatedAt: at('2026-09-20T10:00:00'),
            snapshot: withCards([{ type: 'journal', journalDate: '2026-09-20' }]),
        })
        const day = buildDayTimeline([j], new Date('2026-09-20T00:00:00'))
        expect(day.timed).toEqual([])
        expect(day.hasJournal).toBe(true)
    })

    it('主頁與收件匣不算白板活動', () => {
        const home = board({ id: 'home_board', isHome: true, updatedAt: at('2026-09-20T09:00:00') })
        const inbox = board({ id: 'inbox', isInbox: true, updatedAt: at('2026-09-20T09:00:00') })
        expect(buildDayTimeline([home, inbox], new Date('2026-09-20T00:00:00')).timed).toHaveLength(0)
    })

    it('時間軸依時刻排序', () => {
        const a = board({ id: 'a', name: '晚', updatedAt: at('2026-09-20T18:00:00') })
        const b = board({ id: 'b', name: '早', updatedAt: at('2026-09-20T08:00:00') })
        const t = buildDayTimeline([a, b], new Date('2026-09-20T00:00:00'))
        expect(t.timed.map(x => x.boardName)).toEqual(['早', '晚'])
    })
})

describe('startOfWeek / buildWeekTimelines', () => {
    it('週一為一週之始；週日回推到同一週的週一', () => {
        // 2026-09-20 是週日 → 該週週一是 9/14
        expect(startOfWeek(new Date('2026-09-20T12:00:00')).getDate()).toBe(14)
        expect(startOfWeek(new Date('2026-09-14T12:00:00')).getDate()).toBe(14)
    })

    it('回傳七天，第一天是週一', () => {
        const days = buildWeekTimelines([], new Date('2026-09-20T12:00:00'))
        expect(days).toHaveLength(7)
        expect(days[0].ds).toBe('2026-09-14')
        expect(days[6].ds).toBe('2026-09-20')
    })
})

describe('buildYearDensity', () => {
    it('日記、待辦、白板活動各記一筆', () => {
        const other = board({ id: 'b2', updatedAt: at('2026-09-20T11:00:00') })
        const b = board({
            id: 'b1', isJournal: true, updatedAt: at('2026-09-20T10:00:00'),
            snapshot: withCards([
                { type: 'journal', journalDate: '2026-09-20' },
                { type: 'todo', todos: [
                    { text: 'a', checked: false, dueDate: '2026-09-20' },
                    { text: 'b', checked: true, dueDate: '2026-09-20' },
                ] },
            ]),
        })
        const map = buildYearDensity([b, other], 2026)
        // 白板活動 1（只算 other；日誌板本身的更新不算，RC12）＋ 日記 1 ＋ 待辦 2
        expect(map.get('2026-09-20')).toBe(4)
    })

    it('不同年份不會被算進來', () => {
        const b = board({ id: 'b1', updatedAt: at('2025-09-20T10:00:00') })
        expect(buildYearDensity([b], 2026).size).toBe(0)
    })
})

describe('densityLevel', () => {
    it('0 件是 0 級，其餘往上分四級', () => {
        expect(densityLevel(0)).toBe(0)
        expect(densityLevel(1)).toBe(1)
        expect(densityLevel(3)).toBe(2)
        expect(densityLevel(6)).toBe(3)
        expect(densityLevel(20)).toBe(4)
    })
})

describe('weekdayColumn', () => {
    // 月／年檢視的格線是週一起頭（配合 ISO 週），所以欄位不等於 getDay()
    it('週一是第 0 欄、週日是第 6 欄', () => {
        expect(weekdayColumn(new Date('2026-09-28T12:00:00'))).toBe(0)   // 一
        expect(weekdayColumn(new Date('2026-09-29T12:00:00'))).toBe(1)   // 二
        expect(weekdayColumn(new Date('2026-10-03T12:00:00'))).toBe(5)   // 六
        expect(weekdayColumn(new Date('2026-10-04T12:00:00'))).toBe(6)   // 日
    })

    it('與 startOfWeek 一致：週首那天永遠落在第 0 欄', () => {
        for (const d of ['2026-09-29', '2026-01-01', '2026-12-31']) {
            expect(weekdayColumn(startOfWeek(new Date(d + 'T12:00:00')))).toBe(0)
        }
    })
})

describe('shiftViewDate', () => {
    const d = new Date('2026-09-20T12:00:00')
    it('每種檢視跨的單位不同', () => {
        expect(shiftViewDate('day', d, 1).getDate()).toBe(21)
        expect(shiftViewDate('day', d, -1).getDate()).toBe(19)
        expect(shiftViewDate('week', d, 1).getDate()).toBe(27)
        expect(shiftViewDate('month', d, 1).getMonth()).toBe(9)   // 10 月
        expect(shiftViewDate('year', d, -1).getFullYear()).toBe(2025)
    })
})

describe('viewRangeLabel', () => {
    const d = new Date('2026-09-20T12:00:00')
    it('日檢視帶星期，週檢視帶區間，年檢視只有年', () => {
        expect(viewRangeLabel('day', d)).toBe('2026 年 9 月 20 日 星期日')
        expect(viewRangeLabel('week', d)).toBe('2026 年 9/14 – 9/20')
        expect(viewRangeLabel('month', d)).toBe('2026 年 9 月')
        expect(viewRangeLabel('year', d)).toBe('2026 年')
    })
})

describe('待辦排時段（執行閉環 ④）', () => {
    it('slotMinutes：合法格式轉分鐘，壞的回 null', () => {
        expect(slotMinutes('2026-11-25T14:30')).toBe(14 * 60 + 30)
        expect(slotMinutes('2026-11-25')).toBeNull()
        expect(slotMinutes('2026-11-25T25:00')).toBeNull()
        expect(slotMinutes(null)).toBeNull()
    })

    it('hourSlot：從整點起排一小時；23 點不跨日', () => {
        expect(hourSlot('2026-11-25', 9)).toEqual({ start: '2026-11-25T09:00', end: '2026-11-25T10:00' })
        expect(hourSlot('2026-11-25', 23)).toEqual({ start: '2026-11-25T23:00', end: '2026-11-25T23:59' })
    })

    it('moveSlot：搬到別格長度不變', () => {
        expect(moveSlot('2026-11-26', 15, { startMin: 9 * 60, endMin: 10 * 60 + 30 }))
            .toEqual({ start: '2026-11-26T15:00', end: '2026-11-26T16:30' })
    })

    it('formatMinutes', () => {
        expect(formatMinutes(9 * 60 + 5)).toBe('09:05')
    })

    const b = board({ id: 'b1', updatedAt: at('2026-01-01T00:00:00'), snapshot: withCards([
        { type: 'todo', todos: [
            { id: 'a', text: '畫線稿', checked: false, dueDate: '2026-11-25', scheduledStart: '2026-11-25T14:00', scheduledEnd: '2026-11-25T15:30' },
            { id: 'b', text: '沒排', checked: false, dueDate: '2026-11-25' },
            { id: 'c', text: '別天', checked: false, scheduledStart: '2026-11-26T09:00', scheduledEnd: '2026-11-26T10:00' },
            { id: 'd', text: '壞結束', checked: true, scheduledStart: '2026-11-25T08:00', scheduledEnd: 'xx' },
        ] },
    ]) })

    it('排了時段的待辦進時間軸，帶得回原本的位置；當天排了時段就不在全天列重複（P2-7）', () => {
        const t = buildDayTimeline([b], new Date('2026-11-25T00:00:00'))
        expect(t.scheduled.map(s => s.todoId)).toEqual(['d', 'a'])   // 依開始時間排序
        expect(t.scheduled[1]).toMatchObject({ boardId: 'b1', shapeId: 'shape:c0', todoId: 'a', startMin: 840, endMin: 930 })
        expect(t.todos.map(x => x.todoId)).toEqual(['b'])
        expect(t.todos[0]).toMatchObject({ boardId: 'b1', shapeId: 'shape:c0' })
    })

    it('時段排在別天的待辦，到期那天照樣在全天列', () => {
        const moved = board({ id: 'b2', updatedAt: at('2026-01-01T00:00:00'), snapshot: withCards([
            { type: 'todo', todos: [{ id: 'x', text: '提早做', checked: false, dueDate: '2026-11-27', scheduledStart: '2026-11-25T10:00', scheduledEnd: '2026-11-25T11:00' }] },
        ]) })
        expect(buildDayTimeline([moved], new Date('2026-11-27T00:00:00')).todos.map(x => x.todoId)).toEqual(['x'])
        expect(buildDayTimeline([moved], new Date('2026-11-25T00:00:00')).scheduled.map(x => x.todoId)).toEqual(['x'])
    })

    it('收件匣裡的待辦也要出現（週回顧轉出來的待辦就在收件匣，P1-4）', () => {
        const inbox = board({ id: 'inbox_board', isInbox: true, updatedAt: at('2026-11-25T09:00:00'), snapshot: withCards([
            { type: 'todo', todos: [{ id: 'g', text: '下週目標', checked: false, dueDate: '2026-11-25' }] },
        ]) })
        const t = buildDayTimeline([inbox], new Date('2026-11-25T00:00:00'))
        expect(t.todos.map(x => x.todoId)).toEqual(['g'])
        expect(t.timed).toEqual([])   // 白板活動仍不算收件匣
        expect(buildYearDensity([inbox], 2026).get('2026-11-25')).toBe(1)
    })

    it('結束時間壞掉就當一小時', () => {
        const t = buildDayTimeline([b], new Date('2026-11-25T00:00:00'))
        expect(t.scheduled[0]).toMatchObject({ todoId: 'd', startMin: 480, endMin: 540 })
    })
})
