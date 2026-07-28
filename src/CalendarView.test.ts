// src/CalendarView.test.ts
//
// buildMonthEvents 決定月曆格子上看得到什麼。它漏算什麼，使用者就得一天天點進去才知道
// ——「白板活動」原本就是這樣：右側 agenda 有、月曆沒有。這裡把三種來源都釘住。
import { describe, it, expect } from 'vitest'
import { buildMonthEvents } from './CalendarView'
import type { BoardRecord } from './db'

const iso = (s: string) => new Date(s).getTime()

const board = (over: Partial<BoardRecord> & { id: string }): BoardRecord => ({
    name: '板',
    snapshot: null,
    thumbnail: null,
    updatedAt: iso('2026-07-15T10:00:00'),
    ...over,
} as BoardRecord)

/** 造一個帶卡片的 snapshot（getCardShapes 讀 store 裡 typeName==='shape' 的 card） */
const withCards = (cards: Record<string, unknown>[]) => ({
    document: {
        store: Object.fromEntries(cards.map((props, i) => [
            `shape:c${i}`,
            { id: `shape:c${i}`, typeName: 'shape', type: 'card', x: 0, y: 0, props },
        ])),
    },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

describe('buildMonthEvents', () => {
    it('journal 卡只在 isJournal 白板上才算日記', () => {
        const j = board({ id: 'b1', isJournal: true, snapshot: withCards([{ type: 'journal', journalDate: '2026-07-03', text: '' }]) })
        const notJ = board({ id: 'b2', snapshot: withCards([{ type: 'journal', journalDate: '2026-07-04', text: '' }]) })
        const map = buildMonthEvents([j, notJ], 2026, 6)
        expect(map.get('2026-07-03')?.hasJournal).toBe(true)
        expect(map.get('2026-07-04')?.hasJournal).toBeUndefined()
    })

    it('待辦依 dueDate 落格，保留完成狀態', () => {
        const b = board({
            id: 'b1',
            snapshot: withCards([{ type: 'todo', todos: [
                { id: 't1', text: '甲', dueDate: '2026-07-10', checked: false },
                { id: 't2', text: '乙', dueDate: '2026-07-10', checked: true },
            ] }]),
        })
        const day = buildMonthEvents([b], 2026, 6).get('2026-07-10')
        expect(day?.todos).toEqual([{ text: '甲', checked: false }, { text: '乙', checked: true }])
    })

    it('沒有 dueDate 的待辦不進月曆（＝任務中心那 32 筆看不到的原因）', () => {
        const b = board({ id: 'b1', snapshot: withCards([{ type: 'todo', todos: [{ id: 't1', text: '無期限', checked: false }] }]) })
        expect(buildMonthEvents([b], 2026, 6).size).toBe(1) // 只剩該板 updatedAt 那天的白板活動
        expect([...buildMonthEvents([b], 2026, 6).values()].every(v => v.todos.length === 0)).toBe(true)
    })

    it('白板活動依 updatedAt 落格並累加', () => {
        const map = buildMonthEvents([
            board({ id: 'b1', updatedAt: iso('2026-07-20T09:00:00') }),
            board({ id: 'b2', updatedAt: iso('2026-07-20T22:00:00') }),
            board({ id: 'b3', updatedAt: iso('2026-07-21T09:00:00') }),
        ], 2026, 6)
        expect(map.get('2026-07-20')?.boardActivity).toBe(2)
        expect(map.get('2026-07-21')?.boardActivity).toBe(1)
    })

    it('主頁與收件匣不算白板活動', () => {
        const map = buildMonthEvents([
            board({ id: 'home', isHome: true, updatedAt: iso('2026-07-20T09:00:00') }),
            board({ id: 'inbox', isInbox: true, updatedAt: iso('2026-07-20T09:00:00') }),
        ], 2026, 6)
        expect(map.get('2026-07-20')).toBeUndefined()
    })

    it('其他月份的資料不進本月', () => {
        const map = buildMonthEvents([board({ id: 'b1', updatedAt: iso('2026-06-30T09:00:00') })], 2026, 6)
        expect(map.size).toBe(0)
    })
})
