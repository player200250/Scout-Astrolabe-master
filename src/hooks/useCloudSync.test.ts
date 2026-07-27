// src/hooks/useCloudSync.test.ts
import { describe, it, expect } from 'vitest'
import type { BoardRecord } from '../db'
import { mergeSyncedBoards } from './useCloudSync'

const board = (id: string, patch: Partial<BoardRecord> = {}): BoardRecord => ({
    id, name: id, snapshot: null, thumbnail: null, updatedAt: 1, ...patch,
})

describe('mergeSyncedBoards', () => {
    it('沒有變更時原樣回傳（避免無謂的 re-render）', () => {
        const current = [board('a')]
        expect(mergeSyncedBoards(current, [])).toBe(current)
    })

    it('雲端才有的板會被加進來', () => {
        const merged = mergeSyncedBoards([board('a')], [board('b')])
        expect(merged.map(b => b.id)).toEqual(['a', 'b'])
    })

    it('本機已有的板會被換成雲端版（就地取代，不改順序）', () => {
        const merged = mergeSyncedBoards(
            [board('a'), board('b'), board('c')],
            [board('b', { name: '雲端改過的名字', updatedAt: 99 })],
        )
        expect(merged.map(b => b.id)).toEqual(['a', 'b', 'c'])
        expect(merged[1].name).toBe('雲端改過的名字')
    })

    // 另一端刪掉的板要從側邊欄清單消失（它仍在 DB 裡帶著 deletedAt＝在垃圾桶）
    it('帶 deletedAt 的板會從清單移除', () => {
        const merged = mergeSyncedBoards(
            [board('a'), board('b')],
            [board('b', { deletedAt: 555 })],
        )
        expect(merged.map(b => b.id)).toEqual(['a'])
    })

    it('本機沒有的板若已被標記刪除，不會又被加回來', () => {
        const merged = mergeSyncedBoards([board('a')], [board('zombie', { deletedAt: 1 })])
        expect(merged.map(b => b.id)).toEqual(['a'])
    })

    it('一次混合多種變更', () => {
        const merged = mergeSyncedBoards(
            [board('a'), board('b'), board('c')],
            [board('b', { name: '改過' }), board('c', { deletedAt: 1 }), board('d')],
        )
        expect(merged.map(b => b.id)).toEqual(['a', 'b', 'd'])
        expect(merged.find(b => b.id === 'b')!.name).toBe('改過')
    })

    it('不會改動傳進來的陣列', () => {
        const current = [board('a')]
        mergeSyncedBoards(current, [board('b')])
        expect(current.map(b => b.id)).toEqual(['a'])
    })
})
