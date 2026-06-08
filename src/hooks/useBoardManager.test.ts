// @vitest-environment jsdom
// src/hooks/useBoardManager.test.ts
//
// useBoardManager 依賴 Dexie 資料庫，測試時用「替身（mock）」把整個 DB 層換掉，
// 讓 hook 在純記憶體裡跑，不碰真正的 IndexedDB。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { BoardRecord } from '../db'

// ── 1. 建立所有替身 ───────────────────────────────────────────────────────
// vi.hoisted：因為 vi.mock 會被提升到檔案最上方執行，裡面用到的變數
// 必須也提前準備好，hoisted 就是用來安全地「提前建立」這些 mock 的。
const mocks = vi.hoisted(() => {
    // Dexie table 的鏈式 API（db.table('boards').where(...).above(...).count()）
    // 每個方法都回傳自己，終端方法回傳 Promise。
    const tableApi = {
        where: vi.fn(() => tableApi),
        above: vi.fn(() => tableApi),
        below: vi.fn(() => tableApi),
        equals: vi.fn(() => tableApi),
        count: vi.fn(async () => 0),
        toArray: vi.fn(async () => []),
        get: vi.fn(async () => undefined),
        update: vi.fn(async () => 1),
        clear: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
    }
    return {
        loadAllBoards: vi.fn(async () => [] as BoardRecord[]),
        saveBoard: vi.fn(async () => undefined),
        deleteBoard: vi.fn(async () => undefined),
        generateId: vi.fn(() => 'id_x'),
        db: { table: vi.fn(() => tableApi) },
        saveAutoBackup: vi.fn(async () => undefined),
    }
})

// ── 2. 把真模組換成替身 ────────────────────────────────────────────────────
vi.mock('../utils/boardDb', () => ({
    loadAllBoards: mocks.loadAllBoards,
    saveBoard: mocks.saveBoard,
    deleteBoard: mocks.deleteBoard,
    generateId: mocks.generateId,
}))
vi.mock('../db', () => ({
    db: mocks.db,
    saveAutoBackup: mocks.saveAutoBackup,
}))

// 替身設定完才能 import hook（import 時 hook 內部就會抓到替身版的 boardDb/db）
import { useBoardManager } from './useBoardManager'

// 小工具：補齊 BoardRecord 必要欄位，測試只填關心的部分。
const board = (over: Partial<BoardRecord> & { id: string; name: string }): BoardRecord =>
    ({ snapshot: null, thumbnail: null, updatedAt: 0, ...over } as BoardRecord)

// 掛載 hook 並等初始載入（loading 變 false）完成。
async function setup() {
    const view = renderHook(() => useBoardManager())
    await waitFor(() => expect(view.result.current.loading).toBe(false))
    return view
}

beforeEach(() => {
    vi.clearAllMocks()
    // generateId 每次給遞增 id，方便驗證
    let n = 0
    mocks.generateId.mockImplementation(() => `id_${++n}`)
    mocks.loadAllBoards.mockResolvedValue([])
})

describe('useBoardManager — 建立白板', () => {
    it('handleCreateBoard 建立並回傳新白板，寫入 DB，加進 state', async () => {
        const { result } = await setup()

        let created!: BoardRecord
        act(() => { created = result.current.handleCreateBoard('專案A') })

        expect(created.name).toBe('專案A')
        expect(created.id).toBe('id_1')
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ name: '專案A', id: 'id_1' }),
        )
        expect(result.current.boards).toHaveLength(1)
        expect(result.current.boards[0].name).toBe('專案A')
    })

    it('名稱重複時自動加序號「(2)」', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '專案A' })])
        const { result } = await setup()

        let created!: BoardRecord
        act(() => { created = result.current.handleCreateBoard('專案A') })

        expect(created.name).toBe('專案A (2)')
    })

    it('handleCreateFolder 建立的記錄帶 isFolder: true', async () => {
        const { result } = await setup()

        let folder!: BoardRecord
        act(() => { folder = result.current.handleCreateFolder('資料夾') })

        expect(folder.isFolder).toBe(true)
        expect(result.current.boards.at(-1)?.isFolder).toBe(true)
    })
})

describe('useBoardManager — 重新命名', () => {
    it('handleRename 更新名稱並寫入 DB', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '舊名' })])
        const { result } = await setup()

        act(() => { result.current.handleRename('b1', '新名') })

        expect(result.current.boards[0].name).toBe('新名')
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'b1', name: '新名' }),
        )
    })

    it('對不存在的 id 重新命名是無操作（不寫 DB、不報錯）', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '舊名' })])
        const { result } = await setup()

        mocks.saveBoard.mockClear() // 清掉前面（若有）的呼叫紀錄
        act(() => { result.current.handleRename('不存在', 'x') })

        expect(mocks.saveBoard).not.toHaveBeenCalled()
        expect(result.current.boards[0].name).toBe('舊名') // 原資料不變
    })
})

describe('useBoardManager — 側邊欄收合', () => {
    it('handleToggleCollapse 切換狀態並同步寫入 localStorage', async () => {
        const { result } = await setup()
        expect(result.current.sidebarCollapsed).toBe(false) // 預設展開

        act(() => { result.current.handleToggleCollapse() })

        expect(result.current.sidebarCollapsed).toBe(true)
        expect(localStorage.getItem('sidebar-collapsed')).toBe('true')
    })
})

describe('useBoardManager — 切換白板', () => {
    it('handleSwitch 切到另一塊白板：更新 activeBoardId、寫入 lastVisitedAt', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '一' }),
            board({ id: 'b2', name: '二' }),
        ])
        const { result } = await setup()
        expect(result.current.activeBoardId).toBe('b1') // 預設選第一塊

        mocks.saveBoard.mockClear()
        act(() => { result.current.handleSwitch('b2') })

        expect(result.current.activeBoardId).toBe('b2')
        expect(result.current.navigationStack).toEqual(['b2'])
        // 被切到的白板會記錄 lastVisitedAt 並寫回 DB
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'b2', lastVisitedAt: expect.any(Number) }),
        )
        expect(result.current.boards.find(b => b.id === 'b2')?.lastVisitedAt).toEqual(expect.any(Number))
    })

    it('切到目前已在的白板是無操作（不寫 DB）', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '一' })])
        const { result } = await setup()

        mocks.saveBoard.mockClear()
        act(() => { result.current.handleSwitch('b1') }) // 已是 active

        expect(mocks.saveBoard).not.toHaveBeenCalled()
    })
})

describe('useBoardManager — 資料夾歸屬', () => {
    it('handleSetFolder 設定白板的 folderId 並寫入 DB', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '白板' })])
        const { result } = await setup()

        act(() => { result.current.handleSetFolder('b1', 'f1') })

        expect(result.current.boards[0].folderId).toBe('f1')
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'b1', folderId: 'f1' }),
        )
    })

    it('handleSetFolder 傳 null 把白板移出資料夾', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '白板', folderId: 'f1' })])
        const { result } = await setup()

        act(() => { result.current.handleSetFolder('b1', null) })

        expect(result.current.boards[0].folderId).toBeNull()
    })

    it('對不存在的白板設定資料夾是無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '白板' })])
        const { result } = await setup()

        mocks.saveBoard.mockClear()
        act(() => { result.current.handleSetFolder('不存在', 'f1') })

        expect(mocks.saveBoard).not.toHaveBeenCalled()
    })

    it('handleDeleteFolder 刪資料夾，並把夾內白板的 folderId 清為 null', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'f1', name: '資料夾', isFolder: true }),
            board({ id: 'b1', name: '內層白板', folderId: 'f1' }),
            board({ id: 'b2', name: '無關白板', folderId: 'f2' }),
        ])
        const { result } = await setup()

        act(() => { result.current.handleDeleteFolder('f1') })

        // 資料夾本體被刪
        expect(mocks.deleteBoard).toHaveBeenCalledWith('f1')
        expect(result.current.boards.find(b => b.id === 'f1')).toBeUndefined()
        // 夾內白板留下但 folderId 歸 null，且有寫回 DB
        const b1 = result.current.boards.find(b => b.id === 'b1')
        expect(b1?.folderId).toBeNull()
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'b1', folderId: null }),
        )
        // 不相干的白板不受影響
        expect(result.current.boards.find(b => b.id === 'b2')?.folderId).toBe('f2')
    })
})

describe('useBoardManager — 刪除白板', () => {
    it('handleSoftDeleteBoard 標記 deletedAt、移出清單、active 落到下一塊', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '一' }),
            board({ id: 'b2', name: '二' }),
        ])
        const { result } = await setup()
        expect(result.current.activeBoardId).toBe('b1')

        await act(async () => { await result.current.handleSoftDeleteBoard('b1') })

        // 軟刪：寫回帶 deletedAt 的記錄（不是真的從 DB 移除）
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'b1', deletedAt: expect.any(Number) }),
        )
        expect(mocks.deleteBoard).not.toHaveBeenCalled()
        // 從現役清單移除，active 落到剩下的第一塊
        expect(result.current.boards.map(b => b.id)).toEqual(['b2'])
        expect(result.current.activeBoardId).toBe('b2')
    })

    it('對不存在的白板軟刪是無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '一' })])
        const { result } = await setup()

        mocks.saveBoard.mockClear()
        await act(async () => { await result.current.handleSoftDeleteBoard('不存在') })

        expect(mocks.saveBoard).not.toHaveBeenCalled()
        expect(result.current.boards).toHaveLength(1)
    })

    it('handlePermanentDeleteBoard 真刪，並把子白板的 parentId 收養為 null', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'p1', name: '父白板' }),
            board({ id: 'c1', name: '子白板', parentId: 'p1' }),
        ])
        const { result } = await setup()

        await act(async () => { await result.current.handlePermanentDeleteBoard('p1') })

        // 父白板從 DB 永久刪除
        expect(mocks.deleteBoard).toHaveBeenCalledWith('p1')
        expect(result.current.boards.find(b => b.id === 'p1')).toBeUndefined()
        // 孤兒子白板保留，parentId 歸 null 並寫回 DB
        const c1 = result.current.boards.find(b => b.id === 'c1')
        expect(c1?.parentId).toBeNull()
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c1', parentId: null }),
        )
    })
})
