// src/utils/orphanFiles.test.ts
//
// 這支測試守的是「不要刪到還有人要的圖」。誤判的代價是使用者的圖永久消失，
// 所以每一個引用來源（白板／垃圾桶單卡／模板／備份）都要有一個案例釘住。
import { describe, it, expect } from 'vitest'
import type { BoardRecord, BackupRecord, BoardTemplateRecord, DeletedCardRecord } from '../db'
import type { StoredFileInfo } from '../platform/fileStore'
import {
    collectReferencedStoredNames, planOrphanFiles, MIN_ORPHAN_AGE_MS,
} from './orphanFiles'

// 造一塊含 image/file 卡的白板
function board(id: string, storedNames: (string | undefined)[], extra: Partial<BoardRecord> = {}): BoardRecord {
    const store: Record<string, unknown> = {}
    storedNames.forEach((name, i) => {
        store[`shape:${id}_${i}`] = {
            typeName: 'shape', id: `shape:${id}_${i}`, type: 'card',
            props: { type: 'image', ...(name ? { storedName: name } : {}) },
        }
    })
    return {
        id, name: `板 ${id}`, thumbnail: null, updatedAt: 0,
        snapshot: { document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} } as unknown as BoardRecord['snapshot'],
        ...extra,
    }
}

const emptySources = { boards: [], deletedCards: [], templates: [], backups: [] }
const file = (name: string, size = 100, mtimeMs = 0): StoredFileInfo => ({ name, size, mtimeMs })

describe('collectReferencedStoredNames', () => {
    it('收集現存白板裡的 storedName', () => {
        const refs = collectReferencedStoredNames({ ...emptySources, boards: [board('a', ['x.png', 'y.jpg'])] })
        expect([...refs].sort()).toEqual(['x.png', 'y.jpg'])
    })

    it('垃圾桶裡的白板也算數（還能還原，圖不能先被刪掉）', () => {
        const trashed = board('t', ['keep.png'], { deletedAt: 123 })
        const refs = collectReferencedStoredNames({ ...emptySources, boards: [trashed] })
        expect(refs.has('keep.png')).toBe(true)
    })

    it('垃圾桶裡的單卡（shapeData 是一個 shape，不是 snapshot）', () => {
        const card = {
            id: 'd1', shapeId: 'shape:1', boardId: 'b', boardName: '板',
            shapeData: { props: { type: 'image', storedName: 'trashed.png' } },
            deletedAt: 0, type: 'image', preview: '',
        } as DeletedCardRecord
        const refs = collectReferencedStoredNames({ ...emptySources, deletedCards: [card] })
        expect(refs.has('trashed.png')).toBe(true)
    })

    it('白板模板裡的圖', () => {
        const tpl: BoardTemplateRecord = {
            id: 't1', name: '模板', createdAt: 0, thumbnail: null,
            snapshot: board('x', ['tpl.png']).snapshot,
        }
        const refs = collectReferencedStoredNames({ ...emptySources, templates: [tpl] })
        expect(refs.has('tpl.png')).toBe(true)
    })

    it('自動備份裡的圖（還原舊備份時那些卡會回來）', () => {
        const bk: BackupRecord = { id: 'bk1', timestamp: 0, boardCount: 1, boards: [board('old', ['inbackup.png'])] }
        const refs = collectReferencedStoredNames({ ...emptySources, backups: [bk] })
        expect(refs.has('inbackup.png')).toBe(true)
    })

    it('沒有 storedName 的卡、snapshot 為 null 的板都不會炸', () => {
        const noSnapshot: BoardRecord = { id: 'n', name: '空', snapshot: null, thumbnail: null, updatedAt: 0 }
        const refs = collectReferencedStoredNames({
            ...emptySources,
            boards: [noSnapshot, board('b', [undefined])],
            deletedCards: [{ shapeData: null } as unknown as DeletedCardRecord],
            backups: [{ id: 'bk', timestamp: 0, boardCount: 0 } as BackupRecord],
        })
        expect(refs.size).toBe(0)
    })
})

describe('planOrphanFiles', () => {
    const now = 10 * MIN_ORPHAN_AGE_MS

    it('沒人提到、而且夠舊的檔才進刪除名單', () => {
        const files = [file('orphan.png', 500), file('used.png', 300)]
        const plan = planOrphanFiles(files, new Set(['used.png']), now)
        expect(plan.orphans.map(f => f.name)).toEqual(['orphan.png'])
        expect(plan.bytes).toBe(500)
        expect(plan.scanned).toBe(2)
    })

    it('24 小時內修改過的檔一律跳過（剛貼上、參照還沒寫回 DB）', () => {
        const fresh = file('just-pasted.png', 900, now - 1000)
        const plan = planOrphanFiles([fresh], new Set(), now)
        expect(plan.orphans).toEqual([])
        expect(plan.skippedTooNew).toBe(1)
        expect(plan.bytes).toBe(0)
    })

    it('剛好卡在門檻上：滿 24 小時就可以刪', () => {
        const exactly = file('old-enough.png', 10, now - MIN_ORPHAN_AGE_MS)
        expect(planOrphanFiles([exactly], new Set(), now).orphans).toHaveLength(1)
        const oneMsShort = file('too-new.png', 10, now - MIN_ORPHAN_AGE_MS + 1)
        expect(planOrphanFiles([oneMsShort], new Set(), now).orphans).toHaveLength(0)
    })

    it('被引用的檔再舊也不刪', () => {
        const ancient = file('ancient.png', 10, 0)
        expect(planOrphanFiles([ancient], new Set(['ancient.png']), now).orphans).toEqual([])
    })

    it('磁碟是空的時候回空計畫，不丟例外', () => {
        expect(planOrphanFiles([], new Set(), now))
            .toEqual({ orphans: [], bytes: 0, scanned: 0, skippedTooNew: 0 })
    })

    it('端到端：一塊被永久刪掉的板留下的圖會被判成孤兒', () => {
        // 板還在時：圖被引用
        const alive = collectReferencedStoredNames({ ...emptySources, boards: [board('a', ['pic.png'])] })
        expect(planOrphanFiles([file('pic.png')], alive, now).orphans).toEqual([])
        // 板永久刪除後：沒有任何來源提到它
        const gone = collectReferencedStoredNames(emptySources)
        expect(planOrphanFiles([file('pic.png')], gone, now).orphans.map(f => f.name)).toEqual(['pic.png'])
    })
})
