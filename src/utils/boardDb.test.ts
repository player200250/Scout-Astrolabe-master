// src/utils/boardDb.test.ts
//
// boardDb 是資料層：純函式（generateId / isRasterThumbnail）直接測；
// 會碰 DB 的（saveBoard / deleteBoard / loadAllBoards）用替身把 '../db' 換掉，
// 在純記憶體裡驗證它對 Dexie table 下了哪些指令、回傳怎麼整理。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BoardRecord } from '../db'
import { HOME_BOARD_ID, INBOX_BOARD_ID } from '../constants'

// ── 替身：一個共用的 table API（db.table('boards' / 'snapshots') 都回它）──
const mocks = vi.hoisted(() => {
    const tableApi = {
        toArray: vi.fn(async () => [] as BoardRecord[]),
        put: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
        get: vi.fn(async (): Promise<unknown> => undefined),
    }
    return { tableApi, db: { table: vi.fn(() => tableApi) } }
})
vi.mock('../db', () => ({ db: mocks.db }))

import { generateId, isRasterThumbnail, saveBoard, deleteBoard, loadAllBoards } from './boardDb'

// 補齊 BoardRecord 必要欄位的小工具。
const board = (over: Partial<BoardRecord> & { id: string }): BoardRecord =>
    ({ name: over.id, snapshot: null, thumbnail: null, updatedAt: 0, ...over } as BoardRecord)

beforeEach(() => {
    vi.clearAllMocks()
    // 還原預設回傳，避免測試間殘留
    mocks.tableApi.toArray.mockResolvedValue([])
    mocks.tableApi.get.mockResolvedValue(undefined)
    mocks.tableApi.put.mockResolvedValue(undefined)
    mocks.tableApi.delete.mockResolvedValue(undefined)
})

/* ===============================================================
   純函式
=============================================================== */
describe('generateId', () => {
    it('格式為 board_<時間戳>_<亂數>', () => {
        expect(generateId()).toMatch(/^board_\d+_[a-z0-9]+$/)
    })

    it('兩次呼叫不相同', () => {
        expect(generateId()).not.toBe(generateId())
    })
})

describe('isRasterThumbnail', () => {
    it('PNG / JPEG / WebP 的 data URI 為 true', () => {
        expect(isRasterThumbnail('data:image/png;base64,AAAA')).toBe(true)
        expect(isRasterThumbnail('data:image/jpeg;base64,AAAA')).toBe(true)
        expect(isRasterThumbnail('data:image/webp;base64,AAAA')).toBe(true)
    })

    it('SVG 字串 / 一般字串為 false', () => {
        expect(isRasterThumbnail('<svg></svg>')).toBe(false)
        expect(isRasterThumbnail('data:image/svg+xml;base64,AAAA')).toBe(false)
        expect(isRasterThumbnail('hello')).toBe(false)
    })

    it('null / undefined 為 false', () => {
        expect(isRasterThumbnail(null)).toBe(false)
        expect(isRasterThumbnail(undefined)).toBe(false)
    })
})

/* ===============================================================
   薄包裝
=============================================================== */
describe('saveBoard / deleteBoard', () => {
    it('saveBoard 以該白板呼叫 table.put', async () => {
        const b = board({ id: 'b1' })
        await saveBoard(b)
        expect(mocks.tableApi.put).toHaveBeenCalledWith(b)
    })

    it('deleteBoard 以 id 呼叫 table.delete', async () => {
        await deleteBoard('b1')
        expect(mocks.tableApi.delete).toHaveBeenCalledWith('b1')
    })
})

/* ===============================================================
   loadAllBoards
=============================================================== */
describe('loadAllBoards', () => {
    it('空資料庫 → 注入 home、inbox，並建立第一塊「我的白板」', async () => {
        const result = await loadAllBoards()

        // 三塊：home / inbox / 第一塊白板
        expect(result).toHaveLength(3)
        expect(result[0].isHome).toBe(true)
        expect(result[0].id).toBe(HOME_BOARD_ID)
        expect(result[1].isInbox).toBe(true)
        expect(result[1].id).toBe(INBOX_BOARD_ID)
        expect(result[2].name).toBe('我的白板')
        // 三塊都被寫進 DB
        expect(mocks.tableApi.put).toHaveBeenCalledTimes(3)
    })

    it('第一塊白板會沿用 snapshots「latest」的內容', async () => {
        // 已有 home / inbox，但沒有任何真實白板 → 走建立第一塊的分支
        mocks.tableApi.toArray.mockResolvedValue([
            board({ id: HOME_BOARD_ID, isHome: true }),
            board({ id: INBOX_BOARD_ID, isInbox: true }),
        ])
        const oldSnap = { document: { store: {} } }
        mocks.tableApi.get.mockResolvedValueOnce({ snapshot: oldSnap })

        const result = await loadAllBoards()

        expect(mocks.tableApi.get).toHaveBeenCalledWith('latest')
        const first = result.find(b => b.name === '我的白板')!
        expect(first.snapshot).toBe(oldSnap)
    })

    it('非點陣（SVG）縮圖會被遷移成 null 並寫回 DB；點陣縮圖保留', async () => {
        mocks.tableApi.toArray.mockResolvedValue([
            board({ id: HOME_BOARD_ID, isHome: true }),
            board({ id: INBOX_BOARD_ID, isInbox: true }),
            board({ id: 'svg1', thumbnail: '<svg>圖</svg>' }),                       // 舊 SVG → 清空
            board({ id: 'png1', thumbnail: 'data:image/png;base64,AAAA' }),          // 點陣 → 保留
        ])

        const result = await loadAllBoards()

        const svg1 = result.find(b => b.id === 'svg1')!
        const png1 = result.find(b => b.id === 'png1')!
        expect(svg1.thumbnail).toBeNull()
        expect(png1.thumbnail).toBe('data:image/png;base64,AAAA')
        // 遷移會對 svg1 下一次 put（thumbnail 已清成 null）
        expect(mocks.tableApi.put).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'svg1', thumbnail: null }),
        )
    })

    it('排序：home、inbox 在前，其餘先依 sortOrder、再依 updatedAt', async () => {
        mocks.tableApi.toArray.mockResolvedValue([
            board({ id: 'r3', updatedAt: 100 }),                  // 無 sortOrder
            board({ id: 'r1', sortOrder: 1, updatedAt: 999 }),
            board({ id: INBOX_BOARD_ID, isInbox: true }),
            board({ id: 'r4', updatedAt: 50 }),                   // 無 sortOrder
            board({ id: HOME_BOARD_ID, isHome: true }),
            board({ id: 'r2', sortOrder: 0, updatedAt: 999 }),
        ])

        const result = await loadAllBoards()

        // home → inbox →（有 sortOrder 升冪：r2,r1）→（無 sortOrder 依 updatedAt 升冪：r4,r3）
        expect(result.map(b => b.id)).toEqual([
            HOME_BOARD_ID, INBOX_BOARD_ID, 'r2', 'r1', 'r4', 'r3',
        ])
        // 已有 home/inbox/真實白板，無遷移、無注入 → 完全沒寫 DB
        expect(mocks.tableApi.put).not.toHaveBeenCalled()
    })
})
