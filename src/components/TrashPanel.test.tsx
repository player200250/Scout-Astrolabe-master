// @vitest-environment jsdom
// src/components/TrashPanel.test.tsx
//
// P0 修復 1（UI 路徑）：垃圾桶「永久刪除」與「清空垃圾桶」不可刪掉仍被引用的實體檔。
// 真的元件 + 真的 Dexie（fake-indexeddb 隔離資料庫），只替換「刪磁碟檔」那一層。
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const deleteStoredFile = vi.hoisted(() => vi.fn())
vi.mock('../platform/fileStore', () => ({
    deleteStoredFile,
    canListStoredFiles: () => true,
    listStoredFiles: async () => [],
}))

import { db, type BoardRecord, type DeletedCardRecord } from '../db'
import { TrashPanel } from './TrashPanel'

const imageCard = (id: string, storedName: string) =>
    ({ typeName: 'shape', type: 'card', id, x: 0, y: 0, props: { type: 'image', storedName, image: null } })
const boardWith = (storedName: string): BoardRecord => ({
    id: 'b1', name: '白板', thumbnail: null, updatedAt: 0,
    snapshot: { document: { store: { 'shape:orig': imageCard('shape:orig', storedName) } } } as unknown as BoardRecord['snapshot'],
})
const trashed = (id: string, storedName: string): DeletedCardRecord => ({
    id, shapeId: `shape:${id}`, boardId: 'b1', boardName: '白板', deletedAt: Date.now(), type: 'image', preview: '圖片卡片',
    shapeData: imageCard(`shape:${id}`, storedName),
})

function renderPanel(onEmptyTrash = vi.fn(async () => { await db.table('deletedCards').clear() })) {
    render(
        <TrashPanel
            onClose={() => {}}
            onRestoreBoard={() => {}}
            onPermanentDeleteBoard={() => {}}
            onEmptyTrash={onEmptyTrash}
            onCardRestored={() => {}}
        />,
    )
    return { onEmptyTrash }
}

beforeEach(async () => {
    deleteStoredFile.mockClear()
    await Promise.all(['boards', 'deletedCards', 'boardTemplates', 'backups'].map(t => db.table(t).clear()))
})
afterEach(cleanup)

describe('TrashPanel — 共用圖片檔不被連帶刪除', () => {
    it('永久刪除複本；原卡仍在白板上 ⇒ 記錄刪掉、實體檔保留', async () => {
        await db.table('boards').put(boardWith('shared.png'))
        await db.table('deletedCards').put(trashed('copy', 'shared.png'))
        renderPanel()

        fireEvent.click(await screen.findByText('永久刪除'))
        fireEvent.click(await screen.findByText('確認刪除'))

        await waitFor(async () => expect(await db.table('deletedCards').count()).toBe(0))
        expect(deleteStoredFile).not.toHaveBeenCalled()
    })

    it('清空垃圾桶；原卡仍在白板上 ⇒ 實體檔保留', async () => {
        await db.table('boards').put(boardWith('shared.png'))
        await db.table('deletedCards').put(trashed('copy', 'shared.png'))
        const { onEmptyTrash } = renderPanel()

        await screen.findByText('永久刪除')   // 等清單載入
        fireEvent.click(screen.getByText('清空垃圾桶'))
        fireEvent.click(await screen.findByText('確認清空'))

        await waitFor(() => expect(onEmptyTrash).toHaveBeenCalled())
        await waitFor(async () => expect(await db.table('deletedCards').count()).toBe(0))
        expect(deleteStoredFile).not.toHaveBeenCalled()
    })

    it('清空垃圾桶；沒有任何地方再引用 ⇒ 實體檔照舊刪除', async () => {
        await db.table('deletedCards').put(trashed('only', 'alone.png'))
        renderPanel()

        await screen.findByText('永久刪除')
        fireEvent.click(screen.getByText('清空垃圾桶'))
        fireEvent.click(await screen.findByText('確認清空'))

        await waitFor(() => expect(deleteStoredFile).toHaveBeenCalledWith('alone.png'))
    })
})
