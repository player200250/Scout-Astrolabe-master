// src/sync/cloudCleanup.test.ts
//
// 這裡測的是「哪些東西可以刪」的判斷。刪錯的代價不對稱而且不可逆：
// 墓碑刪太早 ⇒ 別台會把那塊板復活；孤兒圖刪錯 ⇒ 使用者的圖永久消失。
import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({
    getSupabase: vi.fn(() => null),
    getCurrentUserId: vi.fn(async () => null),
    describeNetworkError: (e: unknown) => String(e),
}))
vi.mock('../db', () => ({ db: { table: () => ({ toArray: async () => [] }) } }))

import {
    findStaleTombstones, findOrphanImages, collectReferencedImages,
    TOMBSTONE_RETENTION_MS, ORPHAN_GRACE_MS,
} from './cloudCleanup'
import type { BoardRecord } from '../db'
import type { TLEditorSnapshot } from 'tldraw'

const NOW = Date.parse('2026-08-02T00:00:00Z')
const daysAgo = (n: number) => NOW - n * 24 * 60 * 60 * 1000

const row = (id: string, deletedAt: number | null) =>
    ({ id, name: id, updatedAt: deletedAt ?? NOW, deletedAt })

describe('findStaleTombstones', () => {
    it('還活著的板（deletedAt 為 null）永遠不會被選中', () => {
        expect(findStaleTombstones([row('alive', null)], NOW)).toEqual([])
    })

    it('剛刪掉的墓碑還不能清（另一台可能還沒同步到）', () => {
        expect(findStaleTombstones([row('fresh', daysAgo(1))], NOW)).toEqual([])
    })

    it('超過保留期的墓碑才可以清', () => {
        const r = findStaleTombstones([row('old', daysAgo(61))], NOW)
        expect(r.map(x => x.id)).toEqual(['old'])
    })

    // 剛好在邊界上時保留：多留一天沒壞處，早刪一天可能讓板在別台復活
    it('剛好等於保留期不清（嚴格大於才清）', () => {
        expect(findStaleTombstones([row('edge', NOW - TOMBSTONE_RETENTION_MS)], NOW)).toEqual([])
    })

    it('混在一起時只挑出該清的那些', () => {
        const rows = [row('alive', null), row('fresh', daysAgo(2)), row('old1', daysAgo(90)), row('old2', daysAgo(70))]
        expect(findStaleTombstones(rows, NOW).map(x => x.id).sort()).toEqual(['old1', 'old2'])
    })
})

describe('findOrphanImages', () => {
    const obj = (name: string, createdAt: string | null) => ({ name, createdAt })
    const iso = (ms: number) => new Date(ms).toISOString()

    it('還有卡片引用的圖不會被當成孤兒', () => {
        const r = findOrphanImages([obj('used.png', iso(daysAgo(30)))], new Set(['used.png']), NOW)
        expect(r).toEqual([])
    })

    it('沒人引用且過了寬限期 ⇒ 是孤兒', () => {
        const r = findOrphanImages([obj('orphan.png', iso(daysAgo(30)))], new Set(), NOW)
        expect(r.map(o => o.name)).toEqual(['orphan.png'])
    })

    // ⚠️ 這條防的是真的會發生的競態：imageSync 先上傳圖、再推白板列。
    // 中間那段時間物件存在但還沒有人引用它——沒有寬限期就會被同一輪清理刪掉。
    it('剛上傳、白板還沒推上去的圖不會被誤刪', () => {
        const r = findOrphanImages([obj('justUploaded.png', iso(NOW - 60_000))], new Set(), NOW)
        expect(r).toEqual([])
    })

    it('剛好等於寬限期不刪（嚴格大於才刪）', () => {
        const r = findOrphanImages([obj('edge.png', iso(NOW - ORPHAN_GRACE_MS))], new Set(), NOW)
        expect(r).toEqual([])
    })

    // 寧可留著垃圾，也不要因為缺一個時間戳就刪掉使用者的圖
    it('拿不到 createdAt 的物件一律保留', () => {
        expect(findOrphanImages([obj('noDate.png', null)], new Set(), NOW)).toEqual([])
        expect(findOrphanImages([obj('bad.png', '不是日期')], new Set(), NOW)).toEqual([])
    })
})

describe('collectReferencedImages', () => {
    const boardWith = (id: string, names: string[]): BoardRecord => {
        const store: Record<string, unknown> = {}
        names.forEach((n, i) => {
            store[`shape:${id}${i}`] = {
                typeName: 'shape', id: `shape:${id}${i}`, type: 'card',
                props: { type: 'image', storedName: n },
            }
        })
        return {
            id, name: id, updatedAt: NOW, thumbnail: null,
            snapshot: { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as TLEditorSnapshot,
        }
    }

    it('收齊所有白板引用到的圖', () => {
        const s = collectReferencedImages([boardWith('a', ['x.png']), boardWith('b', ['y.png', 'x.png'])])
        expect([...s].sort()).toEqual(['x.png', 'y.png'])
    })

    // 垃圾桶裡的板還原時需要它的圖，所以一樣算「有人引用」
    it('在垃圾桶裡的板（有 deletedAt 但 snapshot 還在）也算引用', () => {
        const trashed = { ...boardWith('t', ['keep.png']), deletedAt: NOW }
        expect([...collectReferencedImages([trashed])]).toEqual(['keep.png'])
    })

    it('墓碑（snapshot 為 null）不會讓它爆掉', () => {
        const tomb: BoardRecord = { id: 'x', name: 'x', snapshot: null, thumbnail: null, updatedAt: NOW, deletedAt: NOW }
        expect(collectReferencedImages([tomb]).size).toBe(0)
    })
})
