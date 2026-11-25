// src/utils/boardDb.restore.test.ts
//
// P0 修復 3：備份還原的原子性與驗證。fake-indexeddb 跑真的 Dexie 交易（隔離資料庫）。
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, type BoardRecord, type DeletedCardRecord } from '../db'
import { replaceAllBoards, validateRestoreBoards, saveBoard } from './boardDb'
import { parseDiskBackup, buildDiskBackup } from '../platform/backupFile'
import { collectReferencedStoredNames } from './orphanFiles'

const snapWith = (records: Record<string, Record<string, unknown>>) =>
    ({ document: { store: records } }) as unknown as BoardRecord['snapshot']
const card = (id: string, props: Record<string, unknown>) =>
    ({ typeName: 'shape', type: 'card', id, x: 0, y: 0, props })
const board = (id: string, over: Partial<BoardRecord> = {}): BoardRecord =>
    ({ id, name: id, snapshot: null, thumbnail: null, updatedAt: 0, ...over })

const allBoards = async () => (await db.table('boards').toArray() as BoardRecord[]).sort((a, b) => a.id.localeCompare(b.id))

beforeEach(async () => {
    await Promise.all(['boards', 'deletedCards'].map(t => db.table(t).clear()))
    await db.table('boards').bulkPut([
        board('cur1', { snapshot: snapWith({ 'shape:a': card('shape:a', { type: 'text', text: '現有一' }) }) }),
        board('cur2'),
    ])
})

describe('replaceAllBoards — 還原中途失敗', () => {
    it('寫到一半有一筆存不進去（無法序列化）⇒ 整批回滾，原本的白板完整保留', async () => {
        const before = await allBoards()
        const bad = { ...board('r2'), snapshot: { broken: () => 1 } } as unknown as BoardRecord   // DataCloneError
        await expect(replaceAllBoards([board('r1'), bad, board('r3')])).rejects.toThrow()

        expect(await allBoards()).toEqual(before)
    })

    it('交易內筆數對不上（同 id 被覆蓋）⇒ 回滾', async () => {
        const before = await allBoards()
        await expect(replaceAllBoards([board('dup'), board('dup')])).rejects.toThrow('數量不符')
        expect(await allBoards()).toEqual(before)
    })
})

describe('replaceAllBoards — 成功還原', () => {
    it('資料庫內容恰好等於備份（舊的板被移除、欄位原樣）', async () => {
        const restored = [board('r1', { name: '備份一', folderId: 'f1' }), board('trash', { deletedAt: 5 })]
        await replaceAllBoards(restored)
        expect(await allBoards()).toEqual([board('r1', { name: '備份一', folderId: 'f1' }), board('trash', { deletedAt: 5 })])
    })

    it('還原前剛發出的一般存檔，排在還原交易之前 ⇒ 最後是還原的內容', async () => {
        void saveBoard(board('cur1', { name: '還原前最後一次存檔' }))   // 白板補存（不 await，模擬同步發出）
        await replaceAllBoards([board('cur1', { name: '備份裡的' })])
        expect((await db.table('boards').get('cur1')).name).toBe('備份裡的')
    })
})

describe('validateRestoreBoards — 無效備份不會碰到資料庫', () => {
    it.each([
        ['不是陣列', { boards: [] }],
        ['空陣列', []],
        ['缺 id', [{ name: 'x' }]],
        ['缺名稱', [{ id: 'x' }]],
        ['snapshot 型別錯', [{ id: 'x', name: 'x', snapshot: 'oops' }]],
        ['重複 id', [{ id: 'x', name: 'a' }, { id: 'x', name: 'b' }]],
        ['全部在垃圾桶', [{ id: 'x', name: 'x', deletedAt: 1 }]],
        ['含 null', [null]],
    ])('%s ⇒ 拒絕', (_label, input) => {
        const r = validateRestoreBoards(input)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
    })

    it('正常備份 ⇒ 通過且原樣回傳', () => {
        const input = [board('a'), board('b', { deletedAt: 1 })]
        expect(validateRestoreBoards(input)).toEqual({ ok: true, boards: input })
    })
})

describe('完整備份檔往返：白板、卡片、圖片、連結、垃圾桶', () => {
    it('buildDiskBackup → parseDiskBackup → validate → replaceAllBoards，內容與參照都完整', async () => {
        const source: BoardRecord[] = [
            board('b1', {
                name: '專案',
                snapshot: snapWith({
                    'shape:img': card('shape:img', { type: 'image', storedName: 'photo.png', image: null }),
                    'shape:txt': card('shape:txt', { type: 'text', text: '見 [[規劃]]' }),
                    'shape:lnk': card('shape:lnk', { type: 'board', linkedBoardId: 'b2', text: '規劃' }),
                }),
            }),
            board('b2', { name: '規劃', snapshot: snapWith({ 'shape:t': card('shape:t', { type: 'todo', todos: [{ id: 't1', text: '做', checked: false }] }) }) }),
            board('b3', { name: '垃圾桶的板', deletedAt: 9, snapshot: snapWith({ 'shape:old': card('shape:old', { type: 'image', storedName: 'old.png' }) }) }),
        ]
        const file = buildDiskBackup(source, 1000)!
        expect(file.imageNames.sort()).toEqual(['old.png', 'photo.png'])   // 圖片清單交給主程序複製

        const parsed = parseDiskBackup(file.json, 2000)
        if (!parsed.ok) throw new Error(parsed.error)
        const checked = validateRestoreBoards(parsed.boards)
        if (!checked.ok) throw new Error(checked.error)
        await replaceAllBoards(checked.boards)

        const after = await allBoards()
        expect(after.map(b => b.id)).toEqual(['b1', 'b2', 'b3'])
        expect(after.find(b => b.id === 'b3')?.deletedAt).toBe(9)
        expect(after.every(b => b.updatedAt === 2000)).toBe(true)
        // 卡片、白板卡連結、待辦都還在
        expect(after.find(b => b.id === 'b1')?.snapshot).toEqual(source[0].snapshot)
        expect(after.find(b => b.id === 'b2')?.snapshot).toEqual(source[1].snapshot)
        // 圖片參照完整：孤兒判定會把兩張圖都視為「有人引用」
        const refs = collectReferencedStoredNames({ boards: after, deletedCards: [] as DeletedCardRecord[], templates: [], backups: [] })
        expect([...refs].sort()).toEqual(['old.png', 'photo.png'])
    })
})
