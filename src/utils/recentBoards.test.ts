// src/utils/recentBoards.test.ts
import { describe, it, expect } from 'vitest'
import type { BoardRecord } from '../db'
import { pickRecentBoards } from './recentBoards'

const b = (id: string, lastVisitedAt: number, extra: Partial<BoardRecord> = {}): BoardRecord =>
    ({ id, name: id, snapshot: null, thumbnail: null, updatedAt: 0, lastVisitedAt, ...extra })

const boards = [b('a', 1), b('b', 4), b('c', 3), b('d', 2), b('h', 9, { isHome: true }), b('p', 8, { status: 'pinned' })]
const ids = (list: BoardRecord[]) => list.map(x => x.id)

describe('pickRecentBoards', () => {
    it('沒凍結：照最近造訪排，排除目前白板、主頁、釘選', () => {
        expect(ids(pickRecentBoards(boards, 'b', null))).toEqual(['c', 'd', 'a'])
    })

    it('凍結：點了清單裡的 c（變成目前白板、造訪時間變最新），順序和位置都不變', () => {
        const frozen = ids(pickRecentBoards(boards, 'b', null))
        const after = boards.map(x => x.id === 'c' ? { ...x, lastVisitedAt: 10 } : x.id === 'b' ? { ...x, lastVisitedAt: 9.5 } : x)
        expect(ids(pickRecentBoards(after, 'c', frozen))).toEqual(['c', 'd', 'a'])
        // 解凍後才重排：c 是目前白板拿掉，剛離開的 b 排第一
        expect(ids(pickRecentBoards(after, 'c', null))).toEqual(['b', 'd', 'a'])
    })

    it('凍結時被刪掉或改成釘選的板照樣拿掉', () => {
        const after = boards.filter(x => x.id !== 'd').map(x => x.id === 'a' ? { ...x, status: 'pinned' as const } : x)
        expect(ids(pickRecentBoards(after, 'b', ['c', 'd', 'a']))).toEqual(['c'])
    })

    it('最多 5 塊', () => {
        const many = Array.from({ length: 8 }, (_, i) => b(`x${i}`, i + 1))
        expect(pickRecentBoards(many, null, null)).toHaveLength(5)
    })
})
