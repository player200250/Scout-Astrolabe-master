// src/platform/backupFile.test.ts
import { describe, it, expect } from 'vitest'
import type { BoardRecord } from '../db'
import { buildDiskBackup, parseDiskBackup } from './backupFile'

const card = (id: string, props: Record<string, unknown>) => ({
    [id]: { id, typeName: 'shape', type: 'card', x: 0, y: 0, props: { type: 'text', text: '', ...props } },
})
const board = (id: string, store: Record<string, unknown>, extra: Partial<BoardRecord> = {}): BoardRecord => ({
    id, name: id, updatedAt: 1, thumbnail: 'data:image/png;base64,AAAA',
    snapshot: { document: { store, schema: {} }, session: {} } as never,
    ...extra,
})

describe('buildDiskBackup', () => {
    it('一張卡都沒有 ⇒ 不寫（事故後的空資料不能把好備份擠掉）', () => {
        expect(buildDiskBackup([board('a', {}), board('b', {})])).toBeNull()
        expect(buildDiskBackup([])).toBeNull()
    })

    it('只有垃圾桶裡有卡也算空（垃圾桶不代表使用者還有資料）', () => {
        expect(buildDiskBackup([board('t', card('shape:x', {}), { deletedAt: 5 })])).toBeNull()
    })

    it('格式與 App 內備份相同（BackupRecord），縮圖拿掉、垃圾桶的板也一起備份', () => {
        const out = buildDiskBackup([
            board('a', card('shape:1', { text: 'hi' })),
            board('t', card('shape:2', {}), { deletedAt: 5 }),
        ], 1000)!
        const rec = JSON.parse(out.json)
        expect(rec).toMatchObject({ id: 'file_1000', timestamp: 1000, boardCount: 2 })
        expect(rec.boards.map((b: BoardRecord) => b.id)).toEqual(['a', 't'])
        expect(rec.boards.every((b: BoardRecord) => b.thumbnail === null)).toBe(true)
        expect(rec.boards[0].snapshot.document.store['shape:1'].props.text).toBe('hi')
    })

    it('收集所有圖片卡的檔名（去重），讓主程序把圖片一起複製', () => {
        const out = buildDiskBackup([
            board('a', { ...card('shape:1', { type: 'image', storedName: 'x.png' }), ...card('shape:2', { type: 'image', storedName: 'y.jpeg' }) }),
            board('b', card('shape:3', { type: 'image', storedName: 'x.png' })),
        ])!
        expect(out.imageNames.sort()).toEqual(['x.png', 'y.jpeg'])
    })
})

describe('parseDiskBackup', () => {
    it('自己寫出來的備份可以原封不動讀回來（來回一致）', () => {
        const out = buildDiskBackup([board('a', card('shape:1', { text: 'hi' }))], 1000)!
        const r = parseDiskBackup(out.json, 5000)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.timestamp).toBe(1000)
        expect(r.cardCount).toBe(1)
        expect(r.boards[0].snapshot).toEqual(JSON.parse(out.json).boards[0].snapshot)
    })

    it('updatedAt 推進到現在——否則雲端較舊的「新」版本會把還原結果蓋回去', () => {
        const out = buildDiskBackup([board('a', card('shape:1', {}))], 1000)!
        const r = parseDiskBackup(out.json, 9999)
        expect(r.ok && r.boards.every(b => b.updatedAt === 9999)).toBe(true)
    })

    it('壞掉或不是備份的檔案給看得懂的錯誤，不會還原', () => {
        expect(parseDiskBackup('{oops')).toMatchObject({ ok: false, error: expect.stringContaining('JSON') })
        expect(parseDiskBackup('{"hello":1}')).toMatchObject({ ok: false, error: expect.stringContaining('不是') })
        expect(parseDiskBackup('{"boards":[]}')).toMatchObject({ ok: false, error: expect.stringContaining('沒有任何白板') })
        expect(parseDiskBackup('{"boards":[{"foo":1}]}')).toMatchObject({ ok: false })
    })
})
