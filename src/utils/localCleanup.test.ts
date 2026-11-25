// src/utils/localCleanup.test.ts
//
// P0 修復 1：共用圖片檔不可被連帶刪除。
// 用 fake-indexeddb 跑真的 Dexie（隔離的記憶體資料庫，不碰使用者的 vault），
// 只把「真的刪磁碟檔」那一層（fileStore.deleteStoredFile）換成替身來觀察。
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const deleteStoredFile = vi.hoisted(() => vi.fn())
vi.mock('../platform/fileStore', () => ({
    deleteStoredFile,
    canListStoredFiles: () => true,
    listStoredFiles: async () => [],
}))

import { db, type BoardRecord, type DeletedCardRecord } from '../db'
import { releaseStoredFiles } from './localCleanup'
import { purgeTrashedCards } from './trashUtils'

const snapWith = (records: Record<string, Record<string, unknown>>) =>
    ({ document: { store: records } }) as unknown as BoardRecord['snapshot']
const imageCard = (id: string, storedName: string) =>
    ({ typeName: 'shape', type: 'card', id, x: 0, y: 0, props: { type: 'image', storedName, image: null } })
const board = (id: string, cards: Record<string, unknown>[], over: Partial<BoardRecord> = {}): BoardRecord => ({
    id, name: id, thumbnail: null, updatedAt: 0,
    snapshot: snapWith(Object.fromEntries(cards.map(c => [(c as { id: string }).id, c as Record<string, unknown>]))),
    ...over,
})
const trashed = (id: string, storedName: string, type = 'image'): DeletedCardRecord => ({
    id, shapeId: `shape:${id}`, boardId: 'b1', boardName: 'b1', deletedAt: 0, type, preview: '',
    shapeData: imageCard(`shape:${id}`, storedName),
})

beforeEach(async () => {
    deleteStoredFile.mockClear()
    await Promise.all(['boards', 'deletedCards', 'boardTemplates', 'backups'].map(t => db.table(t).clear()))
})

describe('releaseStoredFiles — 只刪沒人引用的實體檔', () => {
    it('兩張卡共用圖片、刪掉其中一張後，另一張還在用 ⇒ 不刪檔', async () => {
        // 複製出來的卡：原卡留在白板上，複本被丟進垃圾桶後永久刪除
        await db.table('boards').put(board('b1', [imageCard('shape:orig', 'shared.png')]))
        const res = await releaseStoredFiles(['shared.png'])
        expect(deleteStoredFile).not.toHaveBeenCalled()
        expect(res).toEqual({ deleted: [], kept: ['shared.png'] })
    })

    it('最後一個引用被移除 ⇒ 照既有設計刪檔', async () => {
        await db.table('boards').put(board('b1', []))
        const res = await releaseStoredFiles(['last.png'])
        expect(deleteStoredFile).toHaveBeenCalledWith('last.png')
        expect(res.deleted).toEqual(['last.png'])
    })

    it.each([
        ['垃圾桶裡的白板（還能還原）', async () => db.table('boards').put(board('t', [imageCard('shape:x', 'f.png')], { deletedAt: 1 }))],
        ['垃圾桶裡另一張單卡', async () => db.table('deletedCards').put(trashed('other', 'f.png'))],
        ['白板模板', async () => db.table('boardTemplates').put({ id: 'tpl', name: 't', snapshot: snapWith({ x: imageCard('shape:x', 'f.png') }), thumbnail: null, createdAt: 0 })],
        ['App 內自動備份', async () => db.table('backups').put({ id: 'bk', timestamp: 1, boardCount: 1, boards: [board('old', [imageCard('shape:x', 'f.png')])] })],
    ])('%s 仍引用 ⇒ 不刪', async (_label, seed) => {
        await seed()
        await releaseStoredFiles(['f.png'])
        expect(deleteStoredFile).not.toHaveBeenCalled()
    })

    it('一次放多個檔：有人用的留、沒人用的刪，重複名稱只處理一次', async () => {
        await db.table('boards').put(board('b1', [imageCard('shape:a', 'used.png')]))
        const res = await releaseStoredFiles(['used.png', 'free.png', 'free.png', ''])
        expect(deleteStoredFile).toHaveBeenCalledTimes(1)
        expect(deleteStoredFile).toHaveBeenCalledWith('free.png')
        expect(res).toEqual({ deleted: ['free.png'], kept: ['used.png'] })
    })

    it('讀不到資料庫 ⇒ 一律不刪（寧可留孤兒）', async () => {
        const spy = vi.spyOn(db, 'table').mockImplementationOnce(() => { throw new Error('db closed') })
        const res = await releaseStoredFiles(['x.png'])
        spy.mockRestore()
        expect(deleteStoredFile).not.toHaveBeenCalled()
        expect(res.kept).toEqual(['x.png'])
    })
})

describe('purgeTrashedCards — 垃圾桶永久刪除／過期清理共用的路徑', () => {
    it('刪掉複本記錄，原卡仍引用同一檔 ⇒ 記錄沒了、檔還在', async () => {
        await db.table('boards').put(board('b1', [imageCard('shape:orig', 'shared.png')]))
        const copy = trashed('copy', 'shared.png')
        await db.table('deletedCards').put(copy)

        await purgeTrashedCards([copy])

        expect(await db.table('deletedCards').get('copy')).toBeUndefined()
        expect(deleteStoredFile).not.toHaveBeenCalled()
    })

    it('兩張共用同檔的卡都在垃圾桶、一起永久刪除（清空垃圾桶）⇒ 刪檔一次', async () => {
        const a = trashed('a', 'both.png'), b = trashed('b', 'both.png')
        await db.table('deletedCards').bulkPut([a, b])

        await purgeTrashedCards([a, b])

        expect(await db.table('deletedCards').count()).toBe(0)
        expect(deleteStoredFile).toHaveBeenCalledTimes(1)
        expect(deleteStoredFile).toHaveBeenCalledWith('both.png')
    })

    it('只永久刪除其中一張、另一張留在垃圾桶 ⇒ 不刪檔（之後還原那張圖要在）', async () => {
        const a = trashed('a', 'both.png'), b = trashed('b', 'both.png')
        await db.table('deletedCards').bulkPut([a, b])

        await purgeTrashedCards([a])

        expect(await db.table('deletedCards').get('b')).toBeTruthy()
        expect(deleteStoredFile).not.toHaveBeenCalled()
    })

    it('檔案卡同樣受保護；文字卡沒有實體檔、不呼叫刪檔', async () => {
        await db.table('boards').put(board('b1', [{ ...imageCard('shape:f', 'doc.pdf'), props: { type: 'file', storedName: 'doc.pdf' } }]))
        const fileCopy = trashed('fc', 'doc.pdf', 'file')
        const text: DeletedCardRecord = { ...trashed('t', ''), type: 'text', shapeData: { props: { type: 'text', text: 'hi' } } }
        await db.table('deletedCards').bulkPut([fileCopy, text])

        await purgeTrashedCards([fileCopy, text])

        expect(deleteStoredFile).not.toHaveBeenCalled()
        expect(await db.table('deletedCards').count()).toBe(0)
    })
})
