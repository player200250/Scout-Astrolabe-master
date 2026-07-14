// src/utils/dataSafetyStats.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { BoardRecord, BackupRecord } from '../db'
import { computeVaultStats, formatBytes } from './dataSafetyStats'

// 造一個帶 card shapes 的 snapshot（比照 getCardShapes 讀取的最小結構）
const snapWithCards = (types: string[]): BoardRecord['snapshot'] => ({
    document: {
        store: Object.fromEntries(
            types.map((t, i) => [`shape:c${i}`, { typeName: 'shape', type: 'card', id: `shape:c${i}`, x: 0, y: 0, props: { type: t } }]),
        ),
        schema: {},
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)

const board = (over: Partial<BoardRecord> & { id: string }): BoardRecord =>
    ({ name: over.id, snapshot: null, thumbnail: null, updatedAt: 0, ...over } as BoardRecord)

describe('formatBytes', () => {
    it('0 或負數 → 0 B', () => {
        expect(formatBytes(0)).toBe('0 B')
        expect(formatBytes(-5)).toBe('0 B')
    })
    it('各級距', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(1024)).toBe('1.0 KB')
        expect(formatBytes(1536)).toBe('1.5 KB')
        expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
        expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
    })
})

describe('computeVaultStats', () => {
    it('空 vault → 全 0', () => {
        const s = computeVaultStats([], [])
        expect(s.boards.total).toBe(0)
        expect(s.cards.total).toBe(0)
        expect(s.imageCards).toBe(0)
        expect(s.backups.count).toBe(0)
    })

    it('白板分類：一般/封存/子板/資料夾/home/inbox', () => {
        const boards = [
            board({ id: 'home', isHome: true }),
            board({ id: 'inbox', isInbox: true }),
            board({ id: 'f1', isFolder: true }),
            board({ id: 'b1' }),
            board({ id: 'b2', status: 'archived' }),
            board({ id: 'sub1', parentId: 'b1' }),
        ]
        const s = computeVaultStats(boards, [])
        expect(s.boards.total).toBe(6)
        expect(s.boards.normal).toBe(3) // b1, b2, sub1（排除 home/inbox/folder）
        expect(s.boards.archived).toBe(1)
        expect(s.boards.sub).toBe(1)
        expect(s.boards.folders).toBe(1)
    })

    it('卡片依型別計數、圖片卡另計', () => {
        const boards = [
            board({ id: 'b1', snapshot: snapWithCards(['text', 'text', 'image', 'todo']) }),
            board({ id: 'b2', snapshot: snapWithCards(['image']) }),
        ]
        const s = computeVaultStats(boards, [])
        expect(s.cards.total).toBe(5)
        expect(s.cards.byType.text).toBe(2)
        expect(s.cards.byType.image).toBe(2)
        expect(s.cards.byType.todo).toBe(1)
        expect(s.imageCards).toBe(2)
    })

    it('縮圖 base64 與備份體積會被估算累加', () => {
        const boards = [board({ id: 'b1', thumbnail: 'data:image/png;base64,' + 'A'.repeat(100) })]
        const backups: BackupRecord[] = [
            { id: 'bk1', timestamp: 1, boardCount: 1, boards: [board({ id: 'x' })] },
        ]
        const s = computeVaultStats(boards, backups)
        expect(s.thumbnailBytes).toBeGreaterThan(100)
        expect(s.backups.count).toBe(1)
        expect(s.backups.bytes).toBeGreaterThan(0)
    })
})
