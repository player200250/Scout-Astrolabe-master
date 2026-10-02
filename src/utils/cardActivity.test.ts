// src/utils/cardActivity.test.ts
// RC16：週回顧要看「每張卡自己什麼時候動過」，不是整塊白板的更新時間。
import { describe, it, expect } from 'vitest'
import {
    ACTIVITY_TRACKING_SINCE, trackingCoverage, cardActiveIn, todoCompletedIn,
    stampCreated, stampUpdated, isContentChange, withCheckedAt,
} from './cardActivity'
import { computeRangeStats, getWeekRange } from './weeklyReviewUtils'
import type { BoardRecord } from '../db'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const week = (y: number, m: number, d: number) => getWeekRange(new Date(y, m - 1, d))

describe('trackingCoverage', () => {
    it('2026-10-02 起記錄：之前的週 none、跨過那天 partial、之後 full', () => {
        expect(new Date(ACTIVITY_TRACKING_SINCE).getDate()).toBe(2)
        const w34 = week(2026, 8, 20), w40 = week(2026, 10, 2), w41 = week(2026, 10, 7)
        expect(trackingCoverage(w34.start, w34.end)).toBe('none')
        expect(trackingCoverage(w40.start, w40.end)).toBe('partial')
        expect(trackingCoverage(w41.start, w41.end)).toBe('full')
    })
})

describe('cardActiveIn / todoCompletedIn', () => {
    const w = week(2026, 10, 7)
    it('createdAt 或 updatedAt 任一落在期間內就算', () => {
        expect(cardActiveIn({ updatedAt: at(2026, 10, 7) }, w.start, w.end)).toBe(true)
        expect(cardActiveIn({ createdAt: at(2026, 10, 6), updatedAt: at(2026, 10, 20) }, w.start, w.end)).toBe(true)
        expect(cardActiveIn({ updatedAt: at(2026, 9, 1) }, w.start, w.end)).toBe(false)
        expect(cardActiveIn({}, w.start, w.end)).toBe(false)
        expect(cardActiveIn(undefined, w.start, w.end)).toBe(false)
    })
    it('有 checkedAt 看 checkedAt；沒有就退回到期日；沒勾一律不算', () => {
        expect(todoCompletedIn({ id: 'a', text: '', checked: true, checkedAt: at(2026, 10, 8) }, w.start, w.end)).toBe(true)
        // 到期日在這週，但其實是上個月就勾掉的 ⇒ 以 checkedAt 為準
        expect(todoCompletedIn({ id: 'a', text: '', checked: true, checkedAt: at(2026, 9, 1), dueDate: '2026-10-07' }, w.start, w.end)).toBe(false)
        expect(todoCompletedIn({ id: 'a', text: '', checked: true, dueDate: '2026-10-11' }, w.start, w.end)).toBe(true)
        expect(todoCompletedIn({ id: 'a', text: '', checked: true, dueDate: '2026-10-12' }, w.start, w.end)).toBe(false)
        expect(todoCompletedIn({ id: 'a', text: '', checked: true }, w.start, w.end)).toBe(false)
        expect(todoCompletedIn({ id: 'a', text: '', checked: false, dueDate: '2026-10-07' }, w.start, w.end)).toBe(false)
    })
})

describe('stamp / isContentChange / withCheckedAt', () => {
    it('stampCreated 保留既有 createdAt；stampUpdated 只動 updatedAt', () => {
        expect(stampCreated({}, 5)).toEqual({ createdAt: 5, updatedAt: 5 })
        expect(stampCreated({ createdAt: 1, other: 'x' }, 5)).toEqual({ createdAt: 1, updatedAt: 5, other: 'x' })
        expect(stampUpdated({ createdAt: 1 }, 9)).toEqual({ createdAt: 1, updatedAt: 9 })
    })
    it('只改尺寸、進出編輯模式、開關預覽不算內容改動', () => {
        const base = { type: 'text', text: 'a', w: 100, h: 100, state: 'idle', preview: false }
        expect(isContentChange(base, { ...base, w: 200, h: 300 })).toBe(false)
        expect(isContentChange(base, { ...base, state: 'editing' })).toBe(false)
        expect(isContentChange(base, { ...base, preview: true })).toBe(false)
        expect(isContentChange(base, { ...base, text: 'b' })).toBe(true)
        expect(isContentChange(base, { ...base, priority: 'high' })).toBe(true)
    })
    it('打勾補 checkedAt、取消勾拿掉；沒變化回傳同一個陣列', () => {
        const prev = [{ id: 'a', text: '', checked: false }, { id: 'b', text: '', checked: true, checkedAt: 1 }]
        const next = [{ id: 'a', text: '', checked: true }, { id: 'b', text: '', checked: false, checkedAt: 1 }]
        expect(withCheckedAt(prev, next, 7)).toEqual([{ id: 'a', text: '', checked: true, checkedAt: 7 }, { id: 'b', text: '', checked: false }])
        expect(withCheckedAt(prev, prev, 7)).toBe(prev)
        // 已經有 checkedAt 的不覆蓋（例如從別處同步過來）
        const same = [{ id: 'b', text: '', checked: true, checkedAt: 1 }]
        expect(withCheckedAt([], same, 7)).toBe(same)
    })
})

describe('computeRangeStats（RC16）', () => {
    const card = (id: string, props: Record<string, unknown>, meta: Record<string, unknown> = {}) =>
        [id, { id, typeName: 'shape', type: 'card', x: 0, y: 0, props, meta }]
    const snap = (cards: unknown[][]) => ({ document: { store: Object.fromEntries(cards) } })
    const board = (id: string, name: string, cards: unknown[][], extra: Partial<BoardRecord> = {}) =>
        ({ id, name, snapshot: snap(cards), thumbnail: null, updatedAt: at(2026, 10, 8), ...extra }) as unknown as BoardRecord

    // 兩塊板的 updatedAt 都在 10/8——舊邏輯會把整塊板全部算進 10/5 那週
    const boards = [
        board('work', '工作', [
            card('shape:new', { type: 'text', text: '見 [[A]] [[B]]' }, { createdAt: at(2026, 10, 6), updatedAt: at(2026, 10, 6) }),
            card('shape:old', { type: 'text', text: '[[C]]' }, { createdAt: at(2026, 8, 1), updatedAt: at(2026, 8, 1) }),
            card('shape:legacy', { type: 'text', text: '舊卡，沒有 meta' }),
            card('shape:todo', { type: 'todo', todos: [
                { id: 't1', text: '', checked: true, checkedAt: at(2026, 10, 7) },
                { id: 't2', text: '', checked: true, dueDate: '2026-08-19' },
            ] }),
        ]),
        board('j', '📔 日誌', [
            card('shape:d1', { type: 'journal', journalDate: '2026-08-18' }),
            card('shape:d2', { type: 'journal', journalDate: '2026-08-20' }),
            card('shape:w', { type: 'journal', journalDate: 'week-2026-34' }),
        ], { isJournal: true }),
    ]

    it('只算這週動過的卡，不再因為白板這週更新過就整塊算進來', () => {
        const w = week(2026, 10, 7)
        const s = computeRangeStats(boards, w.start, w.end)
        // 只有 shape:new；todo 卡本身沒 meta（勾選時間記在項目上，算進完成待辦而非卡片活動）
        expect(s.totalCards).toBe(1)
        expect(s.cardsByBoard).toEqual([{ boardName: '工作', count: 1 }])
        expect(s.wikiLinks).toBe(2)
        expect(s.completedTodos).toBe(1)
        expect(s.journalDays).toBe(0)
        expect(s.coverage).toBe('full')
    })

    it('第 34 週（10/02 之前）：卡片無紀錄，但日記天數與到期日落在那週的完成待辦照算', () => {
        const w = week(2026, 8, 20)
        const s = computeRangeStats(boards, w.start, w.end)
        expect(s.coverage).toBe('none')
        expect(s.totalCards).toBe(0)
        expect(s.journalDays).toBe(2)           // 8/18、8/20；週回顧卡不算一天
        expect(s.completedTodos).toBe(1)        // t2：到期 8/19、已勾
    })
})
