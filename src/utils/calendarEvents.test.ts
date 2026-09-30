// buildAgenda：月曆右欄（AgendaPanel）的資料。
// RC12：日誌板只當日記的倉庫，「白板活動」不能列它——那裡的「前往 →」會把人帶進隱藏的畫布。
import { describe, it, expect } from 'vitest'
import { buildAgenda } from './calendarEvents'
import type { BoardRecord } from '../db'

const at = (s: string) => new Date(s).getTime()

const board = (over: Partial<BoardRecord> & { id: string }): BoardRecord => ({
    name: '板',
    snapshot: null,
    thumbnail: null,
    updatedAt: at('2026-09-20T10:30:00'),
    ...over,
} as BoardRecord)

const journalSnap = {
    document: {
        store: {
            'shape:j': { id: 'shape:j', typeName: 'shape', type: 'card', x: 0, y: 0,
                props: { type: 'journal', journalDate: '2026-09-20', text: '<p>今天</p>' } },
        },
    },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('buildAgenda', () => {
    const day = new Date('2026-09-20T00:00:00')

    it('日誌板不列入白板活動，但那天的日記照樣找得到（RC12）', () => {
        const a = buildAgenda([
            board({ id: 'j', name: '📔 日誌', isJournal: true, snapshot: journalSnap }),
            board({ id: 'b', name: '技術債' }),
        ], day)
        expect(a.activeBoards.map(b => b.boardId)).toEqual(['b'])
        expect(a.journalCard?.shapeId).toBe('shape:j')
    })

    it('主頁與收件匣也不列', () => {
        const a = buildAgenda([board({ id: 'h', isHome: true }), board({ id: 'i', isInbox: true })], day)
        expect(a.activeBoards).toEqual([])
    })
})
