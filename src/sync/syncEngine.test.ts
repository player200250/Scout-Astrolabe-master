// @vitest-environment jsdom
// src/sync/syncEngine.test.ts
//
// 這裡測的是引擎的**決策規則**，不是網路層——boardSync 整個被 mock 掉。
// 會挑這幾條來測，是因為它們正好是「在真機上很難驗、驗錯了又很傷」的那種：
// 板子復活、正在編輯的畫布被偷換、推送失敗卻被記成已推（＝那塊板從此再也不會上傳）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { BoardRecord } from '../db'

// ── mock 掉所有外部依賴 ──────────────────────────────────────────────────────

// ⚠️ vi.mock 的 factory 會被提升到檔案最上面，因此不能引用之後才宣告的 const。
// 用 vi.hoisted 把 mock 們也一起提升，是官方建議的作法。
const h = vi.hoisted(() => {
    const boardsTable = {
        rows: [] as { id: string; updatedAt: number }[],
        toArray: vi.fn(async () => boardsTable.rows),
        put: vi.fn(async (b: { id: string }) => {
            boardsTable.rows = [...boardsTable.rows.filter(x => x.id !== b.id), b as never]
        }),
    }
    return {
        boardsTable,
        getCurrentUserId: vi.fn(async () => 'user-1' as string | null),
        pushBoard: vi.fn(async (_b: BoardRecord) => ({ ok: true }) as { ok: boolean; error?: string }),
        pullBoard: vi.fn(async (_id: string) => ({ ok: true, data: null }) as { ok: boolean; data: BoardRecord | null; error?: string }),
        listRemoteBoards: vi.fn(async () => ({ ok: true, data: [] }) as {
            ok: boolean
            data: { id: string; name: string; updatedAt: number; deletedAt: number | null }[]
            error?: string
        }),
    }
})

vi.mock('../db', () => ({ db: { table: () => h.boardsTable } }))
vi.mock('./supabaseClient', () => ({ getCurrentUserId: h.getCurrentUserId }))
vi.mock('./syncConfig', () => ({
    isSyncConfigured: () => true,
    isAutoSyncEnabled: () => true,
}))
vi.mock('./boardSync', async importOriginal => {
    const actual = await importOriginal<typeof import('./boardSync')>()
    // decideSync 保留真貨——它才是被測的判斷邏輯
    return { ...actual, pushBoard: h.pushBoard, pullBoard: h.pullBoard, listRemoteBoards: h.listRemoteBoards }
})

const { boardsTable, pushBoard, pullBoard, listRemoteBoards } = h

import {
    startSyncEngine, setActiveBoardForSync, notifyBoardSaved, syncNow,
    getSyncStatus, __resetSyncEngineForTest,
} from './syncEngine'
import { loadSyncState, saveSyncState } from './syncState'
import { onAppEvent } from '../utils/appEvents'

const board = (id: string, updatedAt: number, extra: Partial<BoardRecord> = {}): BoardRecord => ({
    id, name: id, snapshot: null, thumbnail: null, updatedAt, ...extra,
})

const remote = (id: string, updatedAt: number, deletedAt: number | null = null) =>
    ({ id, name: id, updatedAt, deletedAt })

const setLocal = (rows: BoardRecord[]) => { boardsTable.rows = rows as never }

/** 等 startSyncEngine() 自己觸發的那一輪跑完，測試才不會與它撞在一起 */
const settle = () => new Promise<void>(r => setTimeout(r, 0))

beforeEach(() => {
    localStorage.clear()
    boardsTable.rows = []
    boardsTable.put.mockClear()
    h.getCurrentUserId.mockImplementation(async () => 'user-1')
    pushBoard.mockClear(); pushBoard.mockImplementation(async () => ({ ok: true }))
    pullBoard.mockClear(); pullBoard.mockImplementation(async () => ({ ok: true, data: null }))
    listRemoteBoards.mockClear(); listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [] }))
    __resetSyncEngineForTest()
})

afterEach(() => { __resetSyncEngineForTest() })

describe('syncEngine — 推送', () => {
    it('沒推過的板會被推上去，並記錄下來', async () => {
        setLocal([board('b1', 100), board('b2', 200)])
        await syncNow()

        expect(pushBoard.mock.calls.map(c => c[0].id).sort()).toEqual(['b1', 'b2'])
        expect(loadSyncState('user-1').pushed).toEqual({ b1: 100, b2: 200 })
        expect(getSyncStatus().phase).toBe('idle')
    })

    it('推過又沒改的板不會重推（第二輪一次都不推）', async () => {
        setLocal([board('b1', 100)])
        await syncNow()
        pushBoard.mockClear()

        await syncNow()
        expect(pushBoard).not.toHaveBeenCalled()
    })

    it('改過之後（updatedAt 變大）會再推一次', async () => {
        setLocal([board('b1', 100)])
        await syncNow()
        pushBoard.mockClear()

        setLocal([board('b1', 300)])
        await syncNow()
        expect(pushBoard).toHaveBeenCalledTimes(1)
        expect(loadSyncState('user-1').pushed.b1).toBe(300)
    })

    // 這條最要命：失敗卻記成已推的話，那塊板之後永遠不會再被送上去，
    // 而且完全不會有任何徵兆——雲端就是少了一塊板。
    it('推送失敗不會被記成已推，狀態轉為 error', async () => {
        setLocal([board('b1', 100)])
        pushBoard.mockImplementation(async () => ({ ok: false, error: '連不上 Supabase' }))
        await syncNow()

        expect(loadSyncState('user-1').pushed.b1).toBeUndefined()
        expect(getSyncStatus().phase).toBe('error')
        expect(getSyncStatus().lastError).toContain('連不上')
    })

    it('存檔通知會把狀態標成 pending（UI 立刻看得到有東西待上傳）', async () => {
        setLocal([board('b1', 100)])
        startSyncEngine()
        await settle()
        await syncNow()

        notifyBoardSaved(board('b1', 500))
        expect(getSyncStatus().phase).toBe('pending')
    })
})

describe('syncEngine — 拉取', () => {
    it('雲端較新的板會被拉回來寫進 DB 並發出事件', async () => {
        setLocal([board('b1', 100)])
        saveSyncState({ userId: 'user-1', pushed: { b1: 100 }, lastPulledAt: null })
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 500)] }))
        pullBoard.mockImplementation(async () => ({ ok: true, data: board('b1', 500, { name: '雲端版' }) }))

        const seen: BoardRecord[] = []
        const off = onAppEvent('sync-boards-updated', ({ boards }) => seen.push(...boards))

        await syncNow()
        off()

        expect(boardsTable.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', updatedAt: 500 }))
        expect(seen.map(b => b.name)).toEqual(['雲端版'])
        // 拉回來之後要記一筆，否則下一輪會把剛拉回的東西原封不動再推上去
        expect(loadSyncState('user-1').pushed.b1).toBe(500)
    })

    it('本機較新時不拉（改成推上去）', async () => {
        setLocal([board('b1', 900)])
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 100)] }))
        await syncNow()

        expect(pullBoard).not.toHaveBeenCalled()
        expect(pushBoard).toHaveBeenCalledTimes(1)
    })

    it('雲端才有的新板（另一台裝置建的）會被拉回來', async () => {
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('new1', 700)] }))
        pullBoard.mockImplementation(async () => ({ ok: true, data: board('new1', 700) }))
        await syncNow()

        expect(boardsTable.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'new1' }))
    })
})

describe('syncEngine — 活躍板保護（不靜默覆蓋）', () => {
    it('正在開著的板遠端較新時只發提示、不寫 DB', async () => {
        setLocal([board('b1', 100)])
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 500)] }))

        const prompts: string[] = []
        const off = onAppEvent('sync-remote-newer', ({ boardId }) => prompts.push(boardId))

        setActiveBoardForSync('b1')
        await syncNow()
        off()

        expect(prompts).toEqual(['b1'])
        expect(pullBoard).not.toHaveBeenCalled()
        expect(boardsTable.put).not.toHaveBeenCalled()
    })

    it('同一個遠端版本只提示一次（不會每輪輪詢都彈）', async () => {
        setLocal([board('b1', 100)])
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 500)] }))

        let count = 0
        const off = onAppEvent('sync-remote-newer', () => { count++ })

        setActiveBoardForSync('b1')
        await syncNow()
        await syncNow()
        await syncNow()
        off()

        expect(count).toBe(1)
    })

    it('切換到別的板之後，原本那塊就會正常被拉回來', async () => {
        setLocal([board('b1', 100), board('b2', 100)])
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 500)] }))
        pullBoard.mockImplementation(async () => ({ ok: true, data: board('b1', 500) }))

        setActiveBoardForSync('b1')
        await syncNow()
        expect(boardsTable.put).not.toHaveBeenCalled()

        setActiveBoardForSync('b2')
        await syncNow()
        expect(boardsTable.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', updatedAt: 500 }))
    })
})

describe('syncEngine — 刪除不會復活', () => {
    // 本機永久刪除後，雲端那列還在。若照「雲端有、本機沒有 ⇒ 拉回來」的直覺處理，
    // 刪掉的板下一輪就自己長回來了。
    it('本機刪掉（曾推過）的板不會被拉回，改推一列墓碑', async () => {
        setLocal([])   // b1 已被永久刪除
        saveSyncState({ userId: 'user-1', pushed: { b1: 100 }, lastPulledAt: null })
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 100)] }))

        await syncNow()

        expect(pullBoard).not.toHaveBeenCalled()
        const tombstone = pushBoard.mock.calls[0][0]
        expect(tombstone.id).toBe('b1')
        expect(tombstone.deletedAt).toBeGreaterThan(0)
        expect(tombstone.snapshot).toBeNull()
    })

    // 反過來的安全閥：另一台裝置在我們刪除之後又改過它 ⇒ 有人還在用，別當成刪除
    it('雲端版本比我們最後推的還新時，照常拉回來（不推墓碑）', async () => {
        setLocal([])
        saveSyncState({ userId: 'user-1', pushed: { b1: 100 }, lastPulledAt: null })
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 999)] }))
        pullBoard.mockImplementation(async () => ({ ok: true, data: board('b1', 999) }))

        await syncNow()

        expect(boardsTable.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', updatedAt: 999 }))
        expect(pushBoard).not.toHaveBeenCalled()
    })

    it('另一端軟刪除的板會被套用到本機（帶著 deletedAt 進垃圾桶）', async () => {
        setLocal([board('b1', 100)])
        listRemoteBoards.mockImplementation(async () => ({ ok: true, data: [remote('b1', 500, 500)] }))
        pullBoard.mockImplementation(async () => ({ ok: true, data: board('b1', 500, { deletedAt: 500 }) }))

        await syncNow()

        expect(boardsTable.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', deletedAt: 500 }))
    })
})

describe('syncEngine — 未設定時完全不動作', () => {
    it('沒登入就不會呼叫任何同步 API', async () => {
        h.getCurrentUserId.mockImplementation(async () => null)

        setLocal([board('b1', 100)])
        await syncNow()

        expect(pushBoard).not.toHaveBeenCalled()
        expect(listRemoteBoards).not.toHaveBeenCalled()
        expect(getSyncStatus().phase).toBe('disabled')
    })
})
