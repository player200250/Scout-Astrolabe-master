// src/utils/desktopSummary.test.ts
import { describe, it, expect } from 'vitest'
import { buildDesktopSummary, sameDesktopSummary, DESKTOP_TASK_LIMIT } from './desktopSummary'
import type { BoardRecord } from '../db'

const TODAY = '2026-10-08'

const snap = (cards: Record<string, Record<string, unknown>>) => ({
    document: {
        store: Object.fromEntries(Object.entries(cards).map(([id, props]) => [
            id, { id, typeName: 'shape', type: 'card', x: 0, y: 0, props },
        ])),
    },
})

const todo = (items: { text: string; dueDate?: string | null; checked?: boolean }[]) => ({
    type: 'todo',
    todos: items.map((t, i) => ({ id: `t${i}`, checked: false, ...t })),
})

const board = (b: Partial<BoardRecord> & { id: string }): BoardRecord =>
    ({ name: b.id, snapshot: null, thumbnail: null, updatedAt: 0, ...b }) as BoardRecord

describe('buildDesktopSummary — 今日待辦', () => {
    const boards = [
        board({ id: 'w', name: '工作', snapshot: snap({
            'shape:a': todo([
                { text: '今天的', dueDate: TODAY },
                { text: '逾期的', dueDate: '2026-10-01' },
                { text: '明天的', dueDate: '2026-10-09' },
                { text: '沒日期', dueDate: null },
                { text: '已完成逾期', dueDate: '2026-10-01', checked: true },
            ]),
        }) as unknown as BoardRecord['snapshot'] }),
        board({ id: 'h', name: '首頁', isHome: true, snapshot: snap({
            'shape:b': todo([{ text: '首頁逾期', dueDate: '2026-09-30' }]),
        }) as unknown as BoardRecord['snapshot'] }),
    ]

    it('只算未完成、到期日 ≤ 今天；首頁也算（和側邊欄徽章一致）', () => {
        const s = buildDesktopSummary(boards, TODAY, 0)
        expect(s.tasks.overdueCount).toBe(2)
        expect(s.tasks.todayCount).toBe(1)
        expect(s.tasks.items.map(i => i.text)).toEqual(['首頁逾期', '逾期的', '今天的'])
    })

    it('逾期排在前面並標記 isOverdue', () => {
        const s = buildDesktopSummary(boards, TODAY, 0)
        expect(s.tasks.items.map(i => i.isOverdue)).toEqual([true, true, false])
        expect(s.tasks.items[0].boardName).toBe('首頁')
    })

    it(`清單最多 ${DESKTOP_TASK_LIMIT} 筆，但數量照實計算`, () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ text: `#${i}`, dueDate: TODAY }))
        const s = buildDesktopSummary([
            board({ id: 'x', snapshot: snap({ 'shape:m': todo(many) }) as unknown as BoardRecord['snapshot'] }),
        ], TODAY, 0)
        expect(s.tasks.todayCount).toBe(30)
        expect(s.tasks.items).toHaveLength(DESKTOP_TASK_LIMIT)
    })

    it('垃圾桶裡的白板不算', () => {
        const s = buildDesktopSummary([
            board({ id: 'd', deletedAt: 1, snapshot: snap({ 'shape:z': todo([{ text: 'x', dueDate: TODAY }]) }) as unknown as BoardRecord['snapshot'] }),
        ], TODAY, 0)
        expect(s.tasks.todayCount).toBe(0)
    })
})

describe('buildDesktopSummary — 最近白板', () => {
    it('排除首頁、收件匣、日誌、資料夾、已刪除、沒造訪過的；依造訪時間新到舊、最多 5 個', () => {
        const boards = [
            board({ id: 'home', isHome: true, lastVisitedAt: 99 }),
            board({ id: 'inbox', isInbox: true, lastVisitedAt: 98 }),
            board({ id: 'journal', isJournal: true, lastVisitedAt: 97 }),
            board({ id: 'folder', isFolder: true, lastVisitedAt: 96 }),
            board({ id: 'trash', deletedAt: 1, lastVisitedAt: 95 }),
            board({ id: 'never' }),
            ...[1, 2, 3, 4, 5, 6].map(n => board({ id: `b${n}`, lastVisitedAt: n })),
        ]
        const s = buildDesktopSummary(boards, TODAY, 0)
        expect(s.recentBoards.map(b => b.id)).toEqual(['b6', 'b5', 'b4', 'b3', 'b2'])
    })
})

describe('buildDesktopSummary — 日記與收件匣', () => {
    it('跨多塊日誌白板找今天的日記', () => {
        const boards = [
            board({ id: 'j1', isJournal: true, snapshot: snap({ 'shape:old': { type: 'journal', journalDate: '2026-10-07' } }) as unknown as BoardRecord['snapshot'] }),
            board({ id: 'j2', isJournal: true, snapshot: snap({ 'shape:now': { type: 'journal', journalDate: TODAY } }) as unknown as BoardRecord['snapshot'] }),
        ]
        expect(buildDesktopSummary(boards, TODAY, 0).journal.hasEntryToday).toBe(true)
        expect(buildDesktopSummary(boards.slice(0, 1), TODAY, 0).journal.hasEntryToday).toBe(false)
    })

    it('週回顧卡（week-…）不算今天的日記', () => {
        const boards = [
            board({ id: 'j', isJournal: true, snapshot: snap({ 'shape:w': { type: 'journal', journalDate: 'week-2026-41' } }) as unknown as BoardRecord['snapshot'] }),
        ]
        expect(buildDesktopSummary(boards, TODAY, 0).journal.hasEntryToday).toBe(false)
    })

    it('收件匣卡片數', () => {
        const boards = [
            board({ id: 'inbox', isInbox: true, snapshot: snap({ 'shape:1': { type: 'text' }, 'shape:2': { type: 'text' } }) as unknown as BoardRecord['snapshot'] }),
        ]
        expect(buildDesktopSummary(boards, TODAY, 0).inbox.count).toBe(2)
    })

    it('不帶任何卡片內容以外的欄位（沒有縮圖、snapshot）', () => {
        const s = buildDesktopSummary([board({ id: 'b', lastVisitedAt: 1, thumbnail: 'data:image/png;base64,xxx' })], TODAY, 0)
        expect(JSON.stringify(s)).not.toContain('base64')
    })
})

describe('sameDesktopSummary', () => {
    it('只差在 generatedAt → 視為相同（不必送 IPC）', () => {
        const a = buildDesktopSummary([], TODAY, 1)
        const b = buildDesktopSummary([], TODAY, 2)
        expect(sameDesktopSummary(a, b)).toBe(true)
    })

    it('日期不同 → 不同', () => {
        expect(sameDesktopSummary(buildDesktopSummary([], TODAY, 0), buildDesktopSummary([], '2026-10-09', 0))).toBe(false)
    })

    it('null 只和 null 相同', () => {
        expect(sameDesktopSummary(null, null)).toBe(true)
        expect(sameDesktopSummary(null, buildDesktopSummary([], TODAY, 0))).toBe(false)
    })
})
