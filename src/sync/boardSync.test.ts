// src/sync/boardSync.test.ts
//
// 這裡測的是「鏡像 schema 最容易靜默出錯」的那一層：本機 BoardRecord ↔ 雲端列 的欄位對映。
// 漏一個欄位不會爆錯，只會表現成「同步之後某個屬性不見了」——在真實服務上極難查，
// 所以用一張**填滿所有欄位**的板做 round-trip，並反過來驗「本機新增欄位時測試要抓得到」。
import { describe, it, expect } from 'vitest'
import { toRemoteRow, fromRemoteRow, decideSync, type RemoteBoardRow } from './boardSync'
import type { BoardRecord } from '../db'

const FULL_BOARD: Required<BoardRecord> = {
    id: 'board_123_abc',
    name: '測試白板',
    snapshot: { document: { store: {} } } as unknown as BoardRecord['snapshot'] as never,
    thumbnail: 'data:image/webp;base64,AAAA',
    updatedAt: 1784994416400,
    parentId: 'board_parent',
    isHome: true,
    isJournal: false,
    isInbox: false,
    status: 'pinned',
    lastVisitedAt: 1784994416000,
    sortOrder: 3.5,
    deletedAt: 1784994410000,
    folderId: 'folder_1',
    isFolder: false,
}

describe('toRemoteRow / fromRemoteRow', () => {
    it('填滿欄位的板 round-trip 後完全相等（漏欄位就會在這裡爆）', () => {
        const row = toRemoteRow(FULL_BOARD, 'user-uuid')
        expect(fromRemoteRow(row)).toEqual(FULL_BOARD)
    })

    it('BoardRecord 的每個欄位都有對應到雲端列（防止本機加欄位卻忘了同步）', () => {
        const row = toRemoteRow(FULL_BOARD, 'user-uuid')
        // user_id 是雲端獨有（RLS 用），synced_at 由 DB trigger 產生，故不在對映裡
        const remoteKeys = Object.keys(row).filter(k => k !== 'user_id')
        expect(remoteKeys.length).toBe(Object.keys(FULL_BOARD).length)
    })

    it('帶上登入者的 user_id（RLS 會再驗一次，這裡先給對）', () => {
        expect(toRemoteRow(FULL_BOARD, 'user-uuid').user_id).toBe('user-uuid')
    })

    it('只有必填欄位的板：選填欄位轉成 null 上雲', () => {
        const minimal: BoardRecord = {
            id: 'b1', name: '極簡板', snapshot: null, thumbnail: null, updatedAt: 100,
        }
        const row = toRemoteRow(minimal, 'u')
        expect(row.parent_id).toBeNull()
        expect(row.status).toBeNull()
        expect(row.sort_order).toBeNull()
        expect(row.snapshot).toBeNull()
    })

    it('雲端的 null 選填欄位不會變成本機的 undefined 欄位（避免存進一堆空欄位）', () => {
        const row: RemoteBoardRow = {
            id: 'b1', user_id: 'u', name: '極簡板', snapshot: null, thumbnail: null,
            updated_at: 100, parent_id: null, is_home: null, is_journal: null,
            is_inbox: null, status: null, last_visited_at: null, sort_order: null,
            deleted_at: null, folder_id: null, is_folder: null,
        }
        const board = fromRemoteRow(row)
        expect(board).toEqual({ id: 'b1', name: '極簡板', snapshot: null, thumbnail: null, updatedAt: 100 })
        expect('parentId' in board).toBe(false)
        expect('status' in board).toBe(false)
    })

    it('軟刪除的 deletedAt 會同步（否則另一端會把刪掉的板復活）', () => {
        const row = toRemoteRow({ ...FULL_BOARD, deletedAt: 999 }, 'u')
        expect(row.deleted_at).toBe(999)
        expect(fromRemoteRow(row).deletedAt).toBe(999)
    })

    it('sortOrder 為 0 時不會被當成沒設定（0 是合法排序值）', () => {
        const row = toRemoteRow({ ...FULL_BOARD, sortOrder: 0 }, 'u')
        expect(row.sort_order).toBe(0)
        expect(fromRemoteRow(row).sortOrder).toBe(0)
    })

    it('isHome=false 會如實同步，不會被當成未設定', () => {
        const row = toRemoteRow({ ...FULL_BOARD, isHome: false }, 'u')
        expect(row.is_home).toBe(false)
        expect(fromRemoteRow(row).isHome).toBe(false)
    })
})

describe('decideSync（整板 last-write-wins）', () => {
    it('本機較新 → push', () => {
        expect(decideSync(200, 100)).toBe('push')
    })

    it('遠端較新 → pull', () => {
        expect(decideSync(100, 200)).toBe('pull')
    })

    it('時間戳相同 → in-sync（不比 snapshot 內容：tldraw 的鍵順序不保證穩定，逐欄比會一直誤判）', () => {
        expect(decideSync(150, 150)).toBe('in-sync')
    })

    it('雲端還沒有這塊板 → local-only', () => {
        expect(decideSync(150, null)).toBe('local-only')
    })

    it('本機沒有但雲端有（例如手機新建的）→ remote-only', () => {
        expect(decideSync(null, 150)).toBe('remote-only')
    })

    it('兩邊都沒有 → in-sync', () => {
        expect(decideSync(null, null)).toBe('in-sync')
    })

    it('updatedAt 為 0 不會被誤判成「沒有」', () => {
        expect(decideSync(0, null)).toBe('local-only')
        expect(decideSync(0, 100)).toBe('pull')
    })
})
