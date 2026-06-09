// @vitest-environment jsdom
// src/hooks/useBoardManager.test.ts
//
// useBoardManager 依賴 Dexie 資料庫，測試時用「替身（mock）」把整個 DB 層換掉，
// 讓 hook 在純記憶體裡跑，不碰真正的 IndexedDB。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { BoardRecord } from '../db'
import { onAppEvent, type AppEventName, type AppEventPayloads } from '../utils/appEvents'
import { getISOWeekKey } from '../utils/weeklyReviewUtils'

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

/* ===============================================================
   以下為第三批：導航 / 快照變更 / 排序 / 欄位 / 垃圾桶 handler
=============================================================== */

// 小工具：把 records 包成 hook 看得懂的 snapshot 形狀（getSnapshotStore 只讀 document.store）。
function snapWith(records: Record<string, Record<string, unknown>>): BoardRecord['snapshot'] {
    return { document: { store: records } } as unknown as BoardRecord['snapshot']
}
// 一張 card shape record。
function cardRec(id: string, props: Record<string, unknown>, x = 0, y = 0): Record<string, unknown> {
    return { typeName: 'shape', type: 'card', id, x, y, index: 'a1', parentId: 'page:page', props }
}
// 讀回 board snapshot 裡的 store，方便斷言。
function storeOf(board: BoardRecord | undefined): Record<string, Record<string, unknown>> {
    return ((board?.snapshot as unknown as { document?: { store?: Record<string, Record<string, unknown>> } })?.document?.store) ?? {}
}
// 捕捉某個 app event：回傳 { calls, off }，記得測試結束 off()。
function captureEvent<K extends AppEventName>(name: K) {
    const calls: AppEventPayloads[K][] = []
    const off = onAppEvent(name, ((d: AppEventPayloads[K]) => calls.push(d)) as never)
    return { calls, off }
}

describe('useBoardManager — 導航', () => {
    it('handleNew 建立「白板 N」、設為 active、navigationStack 重置成新板', async () => {
        const { result } = await setup() // 初始 0 塊
        act(() => { result.current.handleNew() })

        const created = result.current.boards.at(-1)!
        expect(created.name).toBe('白板 1') // boards.length(0)+1
        expect(result.current.activeBoardId).toBe(created.id)
        expect(result.current.navigationStack).toEqual([created.id])
        expect(mocks.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ id: created.id }))
    })

    it('handleSwitchToChild 把子板推進 navigationStack 並記錄 lastVisitedAt', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '父' }),
            board({ id: 'c1', name: '子' }),
        ])
        const { result } = await setup()
        expect(result.current.navigationStack).toEqual(['b1'])

        act(() => { result.current.handleSwitchToChild('c1') })

        expect(result.current.activeBoardId).toBe('c1')
        expect(result.current.navigationStack).toEqual(['b1', 'c1'])
        expect(mocks.saveBoard).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c1', lastVisitedAt: expect.any(Number) }),
        )
    })

    it('handleSwitchToChild 切到 stack 中已存在的板，會截斷到該層（不重複堆疊）', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '父' }),
            board({ id: 'c1', name: '子' }),
        ])
        const { result } = await setup()
        act(() => { result.current.handleSwitchToChild('c1') }) // [b1, c1]
        act(() => { result.current.handleSwitchToChild('b1') }) // b1 已在 idx0 → 截斷成 [b1]

        expect(result.current.navigationStack).toEqual(['b1'])
        expect(result.current.activeBoardId).toBe('b1')
    })

    it('handleBack 退回上一層；只剩一層時為無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '父' }),
            board({ id: 'c1', name: '子' }),
        ])
        const { result } = await setup()
        act(() => { result.current.handleSwitchToChild('c1') }) // [b1, c1]

        act(() => { result.current.handleBack() })
        expect(result.current.navigationStack).toEqual(['b1'])
        expect(result.current.activeBoardId).toBe('b1')

        // 已在根層，再 back 不變
        act(() => { result.current.handleBack() })
        expect(result.current.navigationStack).toEqual(['b1'])
    })

    it('handleSetParent 設定 parentId，切到父板並於 400ms 後發出 create-board-card-on 事件', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'p1', name: '父板' }),
            board({ id: 'c1', name: '子板' }),
        ])
        const { result } = await setup() // setup 用真 timers 等載入完成

        const cap = captureEvent('create-board-card-on')
        vi.useFakeTimers() // 載入完才切假時鐘
        act(() => { result.current.handleSetParent('c1', 'p1') })

        // 立即效果：寫 parentId、切到父板、navStack 重置
        expect(mocks.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', parentId: 'p1' }))
        expect(result.current.activeBoardId).toBe('p1')
        expect(result.current.navigationStack).toEqual(['p1'])
        // 事件還沒發（藏在 400ms setTimeout 裡）
        expect(cap.calls).toHaveLength(0)

        act(() => { vi.advanceTimersByTime(400) })
        expect(cap.calls).toEqual([
            { targetBoardId: 'p1', linkedBoardId: 'c1', boardName: '子板' },
        ])

        vi.useRealTimers()
        cap.off()
    })

    it('handleSetParent 傳 null 解除歸屬：active 是該板時重置 navigationStack', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '板', parentId: 'old' })])
        const { result } = await setup() // active = b1

        act(() => { result.current.handleSetParent('b1', null) })

        expect(mocks.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', parentId: null }))
        expect(result.current.navigationStack).toEqual(['b1'])
    })
})

describe('useBoardManager — 快照變更', () => {
    it('handleAddCardToInbox 在 Inbox 追加文字卡並發出 quick-capture-card 事件', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'inbox', name: 'Inbox', isInbox: true }), // snapshot 預設 null
        ])
        const { result } = await setup()
        const cap = captureEvent('quick-capture-card')

        act(() => { result.current.handleAddCardToInbox('待辦一則') })

        const inbox = result.current.boards.find(b => b.isInbox)
        const cards = Object.values(storeOf(inbox)).filter(r => r.typeName === 'shape' && r.type === 'card')
        expect(cards).toHaveLength(1)
        expect((cards[0].props as { text?: string }).text).toBe('待辦一則')
        expect(mocks.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ id: 'inbox' }))
        expect(cap.calls[0]).toMatchObject({ text: '待辦一則' })

        cap.off()
    })

    it('沒有 Inbox 白板時 handleAddCardToInbox 為無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '一般板' })])
        const { result } = await setup()
        mocks.saveBoard.mockClear()

        act(() => { result.current.handleAddCardToInbox('x') })
        expect(mocks.saveBoard).not.toHaveBeenCalled()
    })

    it('handleSaveJournal 在空白板新建 journal 卡（帶 journalDate 與內文）', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'j1', name: '日誌' })]) // snapshot null
        const { result } = await setup()

        act(() => { result.current.handleSaveJournal('j1', '2026-06-09', '<p>今日</p>', null) })

        const j1 = result.current.boards.find(b => b.id === 'j1')
        const cards = Object.values(storeOf(j1)).filter(r => r.type === 'card')
        expect(cards).toHaveLength(1)
        expect(cards[0].props).toMatchObject({ type: 'journal', journalDate: '2026-06-09', text: '<p>今日</p>' })
    })

    it('handleSaveJournal 指定既有 shapeId 時，只更新該卡內文', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({
                id: 'j1', name: '日誌',
                snapshot: snapWith({ 'shape:e': cardRec('shape:e', { type: 'journal', text: '舊內容' }) }),
            }),
        ])
        const { result } = await setup()

        act(() => { result.current.handleSaveJournal('j1', '2026-06-09', '新內容', 'shape:e') })

        const j1 = result.current.boards.find(b => b.id === 'j1')
        expect((storeOf(j1)['shape:e'].props as { text?: string }).text).toBe('新內容')
        // 沒有多建卡片
        expect(Object.values(storeOf(j1)).filter(r => r.type === 'card')).toHaveLength(1)
    })

    it('handleMoveCardToBoard 把卡片從 Inbox 移到目標板，並發出 delete-shape-from-editor', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({
                id: 'inbox', name: 'Inbox', isInbox: true,
                snapshot: snapWith({ 'shape:x': cardRec('shape:x', { type: 'text', text: '卡片' }) }),
            }),
            board({ id: 't1', name: '目標板' }),
        ])
        const { result } = await setup()
        const cap = captureEvent('delete-shape-from-editor')

        act(() => { result.current.handleMoveCardToBoard('shape:x', 't1') })

        // Inbox 不再有該卡，目標板多了該卡
        const inbox = result.current.boards.find(b => b.isInbox)
        const target = result.current.boards.find(b => b.id === 't1')
        expect(storeOf(inbox)['shape:x']).toBeUndefined()
        expect(storeOf(target)['shape:x']).toBeDefined()
        expect(cap.calls).toEqual([{ shapeId: 'shape:x' }])

        cap.off()
    })

    it('Inbox 中找不到該 shape 時 handleMoveCardToBoard 為無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'inbox', name: 'Inbox', isInbox: true, snapshot: snapWith({}) }),
            board({ id: 't1', name: '目標板' }),
        ])
        const { result } = await setup()
        mocks.saveBoard.mockClear()

        act(() => { result.current.handleMoveCardToBoard('shape:none', 't1') })
        expect(mocks.saveBoard).not.toHaveBeenCalled()
    })
})

describe('useBoardManager — 排序', () => {
    it('handleReorderBoards 把 active 拖到 over 的位置並重寫 sortOrder', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '一' }),
            board({ id: 'b2', name: '二' }),
            board({ id: 'b3', name: '三' }),
        ])
        const { result } = await setup()
        mocks.saveBoard.mockClear()

        act(() => { result.current.handleReorderBoards('b1', 'b3') }) // b1 移到 b3 位置

        expect(result.current.boards.map(b => b.id)).toEqual(['b2', 'b3', 'b1'])
        // 每塊都帶上對應 sortOrder 並寫回
        expect(result.current.boards.map(b => b.sortOrder)).toEqual([0, 1, 2])
        expect(mocks.saveBoard).toHaveBeenCalledTimes(3)
    })

    it('handleReorderBoards 對不存在的 id 為無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '一' })])
        const { result } = await setup()
        mocks.saveBoard.mockClear()

        act(() => { result.current.handleReorderBoards('b1', '不存在') })
        expect(mocks.saveBoard).not.toHaveBeenCalled()
    })
})

describe('useBoardManager — 欄位更新', () => {
    it('handleSetStatus 更新 status 並寫入 DB', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '板' })])
        const { result } = await setup()

        act(() => { result.current.handleSetStatus('b1', 'pinned') })

        expect(result.current.boards[0].status).toBe('pinned')
        expect(mocks.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', status: 'pinned' }))
    })

    it('handleSetJournal 標記白板為日誌板並寫入 DB', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '板' })])
        const { result } = await setup()

        act(() => { result.current.handleSetJournal('b1', true) })

        expect(result.current.boards[0].isJournal).toBe(true)
        expect(mocks.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', isJournal: true }))
    })
})

describe('useBoardManager — 垃圾桶', () => {
    // 取回 hook 內部用的 Dexie table 替身（db.table 永遠回同一個 tableApi）
    const tbl = () => mocks.db.table('boards') as unknown as {
        get: ReturnType<typeof vi.fn>
        update: ReturnType<typeof vi.fn>
        toArray: ReturnType<typeof vi.fn>
    }

    it('handleEmptyTrash 真刪所有已軟刪白板、清空 deletedCards、trashCount 歸零', async () => {
        const { result } = await setup()
        // 模擬垃圾桶裡有兩塊已刪白板
        tbl().toArray.mockResolvedValueOnce([
            board({ id: 'd1', name: 'x', deletedAt: 1 }),
            board({ id: 'd2', name: 'y', deletedAt: 1 }),
        ])

        await act(async () => { await result.current.handleEmptyTrash() })

        expect(mocks.deleteBoard).toHaveBeenCalledWith('d1')
        expect(mocks.deleteBoard).toHaveBeenCalledWith('d2')
        expect(result.current.trashCount).toBe(0)
    })

    it('handleRestoreBoard 還原存在的白板：清掉 deletedAt 並放回清單', async () => {
        const { result } = await setup()
        tbl().get.mockResolvedValueOnce(board({ id: 'r1', name: '還原板', deletedAt: 123 }))
        tbl().update.mockResolvedValueOnce(1) // Dexie update 回 1 = 成功

        await act(async () => { await result.current.handleRestoreBoard('r1') })

        const restored = result.current.boards.find(b => b.id === 'r1')
        expect(restored).toBeDefined()
        expect(restored?.deletedAt).toBeUndefined()
    })

    it('handleRestoreBoard 找不到記錄時為無操作', async () => {
        const { result } = await setup()
        tbl().get.mockResolvedValueOnce(undefined)

        await act(async () => { await result.current.handleRestoreBoard('missing') })
        expect(result.current.boards.find(b => b.id === 'missing')).toBeUndefined()
    })

    it('handleRestoreBoard DB 更新回 0（失敗）時跳警告且不放回清單', async () => {
        const alertSpy = vi.fn()
        vi.stubGlobal('alert', alertSpy)
        const { result } = await setup()
        tbl().get.mockResolvedValueOnce(board({ id: 'r1', name: '還原板', deletedAt: 123 }))
        tbl().update.mockResolvedValueOnce(0) // 更新 0 筆 = 失敗

        await act(async () => { await result.current.handleRestoreBoard('r1') })

        expect(alertSpy).toHaveBeenCalled()
        expect(result.current.boards.find(b => b.id === 'r1')).toBeUndefined()
        vi.unstubAllGlobals()
    })
})

describe('useBoardManager — 跳轉', () => {
    it('handleJump 在同一塊白板上直接呼叫 jumpRef（不切板、不延遲）', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '板' })])
        const { result } = await setup()
        const jumpSpy = vi.fn()
        result.current.jumpRef.current = jumpSpy

        act(() => { result.current.handleJump('b1', 'shape:a', 10, 20) })

        expect(jumpSpy).toHaveBeenCalledWith('shape:a', 10, 20)
        expect(result.current.activeBoardId).toBe('b1')
    })

    it('handleJump 跨白板時先切板，延遲 400ms 後才跳轉', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '一' }),
            board({ id: 'b2', name: '二' }),
        ])
        const { result } = await setup()
        const jumpSpy = vi.fn()
        result.current.jumpRef.current = jumpSpy

        vi.useFakeTimers()
        act(() => { result.current.handleJump('b2', 'shape:x', 1, 2) })

        expect(result.current.activeBoardId).toBe('b2') // 立即切板
        expect(jumpSpy).not.toHaveBeenCalled()          // 跳轉還在計時器裡

        act(() => { vi.advanceTimersByTime(400) })
        expect(jumpSpy).toHaveBeenCalledWith('shape:x', 1, 2)

        vi.useRealTimers()
    })
})

describe('useBoardManager — 本週日誌卡', () => {
    it('handleGoToWeeklyCard 切到日誌板並於 400ms 後跳到本週卡片', async () => {
        const weekKey = getISOWeekKey(new Date())
        mocks.loadAllBoards.mockResolvedValue([
            board({ id: 'b1', name: '一般板' }), // active 落在這裡
            board({
                id: 'j1', name: '日誌', isJournal: true,
                snapshot: snapWith({
                    'shape:wk': cardRec('shape:wk', { type: 'journal', journalDate: weekKey }, 30, 40),
                }),
            }),
        ])
        const { result } = await setup()
        const jumpSpy = vi.fn()
        result.current.jumpRef.current = jumpSpy

        vi.useFakeTimers()
        act(() => { result.current.handleGoToWeeklyCard() })

        expect(result.current.activeBoardId).toBe('j1')
        expect(result.current.navigationStack).toEqual(['j1'])
        expect(jumpSpy).not.toHaveBeenCalled()

        act(() => { vi.advanceTimersByTime(400) })
        expect(jumpSpy).toHaveBeenCalledWith('shape:wk', 30, 40)

        vi.useRealTimers()
    })

    it('沒有日誌板時 handleGoToWeeklyCard 為無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '板' })])
        const { result } = await setup()

        act(() => { result.current.handleGoToWeeklyCard() })
        expect(result.current.activeBoardId).toBe('b1') // 不變
    })
})

describe('useBoardManager — 全量還原（備份重灌）', () => {
    it('handleRestore 清空 DB、灌入備份白板、active 落到第一塊', async () => {
        const { result } = await setup()
        const tbl = mocks.db.table('boards')
        const backup = [board({ id: 'r1', name: '備份一' }), board({ id: 'r2', name: '備份二' })]

        await act(async () => { await result.current.handleRestore(backup) })

        expect(tbl.clear).toHaveBeenCalled()
        expect(tbl.put).toHaveBeenCalledTimes(2)
        expect(result.current.boards.map(b => b.id)).toEqual(['r1', 'r2'])
        expect(result.current.activeBoardId).toBe('r1')
        expect(result.current.navigationStack).toEqual(['r1'])
    })
})

describe('useBoardManager — 軟刪並搬卡進 Inbox', () => {
    it('moveToInbox=true：把卡片複製進 Inbox 後軟刪原白板', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({
                id: 'src', name: '來源', // active 落在這裡
                snapshot: snapWith({
                    'shape:a': cardRec('shape:a', { type: 'text', text: 'A' }, 0, 0),
                    'shape:b': cardRec('shape:b', { type: 'text', text: 'B' }, 0, 0),
                }),
            }),
            board({ id: 'inbox', name: 'Inbox', isInbox: true }),
        ])
        const { result } = await setup()

        await act(async () => { await result.current.handleSoftDeleteBoardWithInboxMove('src', true) })

        // 原白板被軟刪（標 deletedAt、移出清單，但非真刪）
        expect(mocks.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ id: 'src', deletedAt: expect.any(Number) }))
        expect(mocks.deleteBoard).not.toHaveBeenCalled()
        expect(result.current.boards.find(b => b.id === 'src')).toBeUndefined()
        expect(result.current.activeBoardId).toBe('inbox') // active 落到剩下的板

        // 兩張卡都進了 Inbox
        const inbox = result.current.boards.find(b => b.isInbox)
        const cards = Object.values(storeOf(inbox)).filter(r => r.type === 'card')
        expect(cards).toHaveLength(2)
    })

    it('moveToInbox=false：只軟刪、不動 Inbox', async () => {
        mocks.loadAllBoards.mockResolvedValue([
            board({
                id: 'src', name: '來源',
                snapshot: snapWith({ 'shape:a': cardRec('shape:a', { type: 'text', text: 'A' }) }),
            }),
            board({ id: 'inbox', name: 'Inbox', isInbox: true }),
        ])
        const { result } = await setup()

        await act(async () => { await result.current.handleSoftDeleteBoardWithInboxMove('src', false) })

        expect(result.current.boards.find(b => b.id === 'src')).toBeUndefined()
        // Inbox 仍是空的（沒被塞卡）
        const inbox = result.current.boards.find(b => b.isInbox)
        expect(Object.values(storeOf(inbox)).filter(r => r.type === 'card')).toHaveLength(0)
    })

    it('找不到白板時 handleSoftDeleteBoardWithInboxMove 為無操作', async () => {
        mocks.loadAllBoards.mockResolvedValue([board({ id: 'b1', name: '板' })])
        const { result } = await setup()
        mocks.saveBoard.mockClear()

        await act(async () => { await result.current.handleSoftDeleteBoardWithInboxMove('不存在', true) })
        expect(mocks.saveBoard).not.toHaveBeenCalled()
    })
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})
