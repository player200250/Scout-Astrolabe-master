// @vitest-environment jsdom
// src/hooks/useJournal.test.ts
//
// P2-6：新使用者打開日記／週回顧時可以一鍵建立日誌白板。
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'
import { db, type BoardRecord } from '../db'
import { useJournal } from './useJournal'

const setup = (initial: BoardRecord[]) => renderHook(() => {
    const [boards, setBoards] = useState(initial)
    return { boards, ...useJournal({ boards, setBoards }) }
})

const board = (id: string, extra: Partial<BoardRecord> = {}): BoardRecord =>
    ({ id, name: id, snapshot: null, thumbnail: null, updatedAt: 0, ...extra })

beforeEach(async () => { await db.table('boards').clear() })

describe('handleCreateJournalBoard', () => {
    it('沒有日誌板 ⇒ 建一塊標成 Journal 的板，存進資料庫也放進清單', async () => {
        const { result } = setup([board('a')])
        let created!: BoardRecord
        act(() => { created = result.current.handleCreateJournalBoard() })
        expect(created.isJournal).toBe(true)
        expect(created.name).toBe('📔 日誌')
        expect(result.current.boards.filter(b => b.isJournal).map(b => b.id)).toEqual([created.id])
        await new Promise(r => setTimeout(r, 0))
        expect(await db.table('boards').get(created.id)).toMatchObject({ isJournal: true })
    })

    it('已經有日誌板 ⇒ 不重複建，直接回傳那塊', () => {
        const { result } = setup([board('j', { isJournal: true })])
        let got!: BoardRecord
        act(() => { got = result.current.handleCreateJournalBoard() })
        expect(got.id).toBe('j')
        expect(result.current.boards).toHaveLength(1)
    })

    it('名稱撞到既有白板時加編號', () => {
        const { result } = setup([board('x', { name: '📔 日誌' })])
        let created!: BoardRecord
        act(() => { created = result.current.handleCreateJournalBoard() })
        expect(created.name).toBe('📔 日誌 (2)')
    })
})
