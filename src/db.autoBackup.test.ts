// src/db.autoBackup.test.ts — saveAutoBackup（RC26）
//
// 沒裝 fake-indexeddb，所以把 Dexie 換成最小替身：只要撐得過 db.ts 的 version().stores().upgrade()
// 初始化，並提供 boards／backups 兩張表的 toArray／put／orderBy 即可。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
    const tables: Record<string, { rows: { id: string; timestamp?: number }[] }> = {
        boards: { rows: [] },
        backups: { rows: [] },
    }
    const api = (name: string) => ({
        toArray: vi.fn(async () => tables[name].rows),
        put: vi.fn(async (r: { id: string }) => { tables[name].rows = [...tables[name].rows.filter(x => x.id !== r.id), r] }),
        orderBy: vi.fn(() => ({ primaryKeys: async () => tables[name].rows.map(r => r.id) })),
        bulkDelete: vi.fn(async () => undefined),
    })
    const apis: Record<string, ReturnType<typeof api>> = { boards: api('boards'), backups: api('backups') }
    class FakeDexie {
        version() { const v = { stores: () => v, upgrade: () => v }; return v }
        table(name: string) { return apis[name] }
    }
    return { tables, apis, FakeDexie }
})

vi.mock('dexie', () => ({ default: h.FakeDexie }))

import { saveAutoBackup, type BoardRecord, type BackupRecord } from './db'

const card = (id: string) => ({ [id]: { id, typeName: 'shape', type: 'card', props: { type: 'text' } } })
const board = (id: string, store: Record<string, unknown>, extra: Partial<BoardRecord> = {}): BoardRecord => ({
    id, name: id, updatedAt: 1, thumbnail: null,
    snapshot: { document: { store, schema: {} }, session: {} } as never, ...extra,
})

beforeEach(() => {
    h.tables.boards.rows = []
    h.tables.backups.rows = []
    h.apis.backups.put.mockClear()
})

describe('saveAutoBackup', () => {
    it('從資料庫讀全部白板，垃圾桶的板也在備份裡（RC26）', async () => {
        h.tables.boards.rows = [board('live', card('shape:1')), board('trashed', card('shape:2'), { deletedAt: 5 })] as never
        await saveAutoBackup()
        const rec = h.apis.backups.put.mock.calls[0][0] as unknown as BackupRecord
        expect(rec.boards.map(b => b.id).sort()).toEqual(['live', 'trashed'])
        expect(rec.boardCount).toBe(2)
    })

    it('一張卡都沒有（含只有垃圾桶有卡）⇒ 不存，避免空資料把好備份擠掉', async () => {
        h.tables.boards.rows = [board('empty', {}), board('trashed', card('shape:2'), { deletedAt: 5 })] as never
        await saveAutoBackup()
        expect(h.apis.backups.put).not.toHaveBeenCalled()
    })
})
