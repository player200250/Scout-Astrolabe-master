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
