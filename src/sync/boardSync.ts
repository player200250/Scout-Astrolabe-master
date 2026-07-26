// src/sync/boardSync.ts
// 白板的雲端推 / 拉（S0(b) 最小鏈路）。
//
// 範圍限定：**手動推一塊板上雲、手動拉回覆蓋**，不碰現有存檔流程、不自動同步、不輪詢。
// 這是「零風險探路」——先把整條 本機 → Supabase → 本機 的鏈路在真實服務上跑通，
// 確認資料進得去、回得來、RLS 有生效，再往上疊自動同步（見 docs/roadmap-mobile.md S0(b) 後續）。
//
// 衝突策略：整板 last-write-wins，比較 updatedAt（epoch 毫秒，兩端同一把尺）。
import type { BoardRecord } from '../db'
import type { TLEditorSnapshot } from 'tldraw'
import { getSupabase, getCurrentUserId, describeNetworkError } from './supabaseClient'

const TABLE = 'boards'

/** 雲端 boards 表的一列（欄名 snake_case，對應 supabase/schema.sql）*/
export interface RemoteBoardRow {
    id: string
    user_id: string
    name: string
    snapshot: TLEditorSnapshot | null
    thumbnail: string | null
    updated_at: number
    parent_id: string | null
    is_home: boolean | null
    is_journal: boolean | null
    is_inbox: boolean | null
    status: string | null
    last_visited_at: number | null
    sort_order: number | null
    deleted_at: number | null
    folder_id: string | null
    is_folder: boolean | null
}

// ── 純函式：本機 ↔ 雲端 的欄位對映（camelCase ↔ snake_case）────────────────────
// 抽成純函式是為了能單元測試——欄位漏掉或型別對錯，是這種鏡像 schema 最常見的 bug，
// 而它在真實服務上只會表現為「某個屬性同步後不見了」，很難查。

export function toRemoteRow(board: BoardRecord, userId: string): RemoteBoardRow {
    return {
        id: board.id,
        user_id: userId,
        name: board.name,
        snapshot: board.snapshot,
        thumbnail: board.thumbnail,
        updated_at: board.updatedAt,
        parent_id: board.parentId ?? null,
        is_home: board.isHome ?? null,
        is_journal: board.isJournal ?? null,
        is_inbox: board.isInbox ?? null,
        status: board.status ?? null,
        last_visited_at: board.lastVisitedAt ?? null,
        sort_order: board.sortOrder ?? null,
        deleted_at: board.deletedAt ?? null,
        folder_id: board.folderId ?? null,
        is_folder: board.isFolder ?? null,
    }
}

export function fromRemoteRow(row: RemoteBoardRow): BoardRecord {
    const board: BoardRecord = {
        id: row.id,
        name: row.name,
        snapshot: row.snapshot,
        thumbnail: row.thumbnail,
        updatedAt: row.updated_at,
    }
    // 選填欄位只在雲端真的有值時才補上——直接塞 undefined 會讓 Dexie 存進一堆
    // 空欄位，也會讓「這塊板有沒有設過 parentId」這種判斷變得模糊
    if (row.parent_id !== null) board.parentId = row.parent_id
    if (row.is_home !== null) board.isHome = row.is_home
    if (row.is_journal !== null) board.isJournal = row.is_journal
    if (row.is_inbox !== null) board.isInbox = row.is_inbox
    if (row.status !== null) board.status = row.status as BoardRecord['status']
    if (row.last_visited_at !== null) board.lastVisitedAt = row.last_visited_at
    if (row.sort_order !== null) board.sortOrder = row.sort_order
    if (row.deleted_at !== null) board.deletedAt = row.deleted_at
    if (row.folder_id !== null) board.folderId = row.folder_id
    if (row.is_folder !== null) board.isFolder = row.is_folder
    return board
}

export type SyncDecision = 'push' | 'pull' | 'in-sync' | 'local-only' | 'remote-only'

/**
 * 整板 LWW 的判斷（純函式）。
 * 兩邊 updatedAt 相同就視為一致——不比 snapshot 內容，因為 tldraw snapshot
 * 的鍵順序不保證穩定，逐欄比對會一直誤判成有差異。
 */
export function decideSync(
    localUpdatedAt: number | null,
    remoteUpdatedAt: number | null,
): SyncDecision {
    if (localUpdatedAt === null && remoteUpdatedAt === null) return 'in-sync'
    if (remoteUpdatedAt === null) return 'local-only'
    if (localUpdatedAt === null) return 'remote-only'
    if (localUpdatedAt > remoteUpdatedAt) return 'push'
    if (localUpdatedAt < remoteUpdatedAt) return 'pull'
    return 'in-sync'
}

// ── 實際的推 / 拉 ────────────────────────────────────────────────────────────

export interface SyncResult<T = void> {
    ok: boolean
    error?: string
    data?: T
}

/** 把一塊本機白板推上雲（upsert，以 (user_id, id) 為主鍵）*/
export async function pushBoard(board: BoardRecord): Promise<SyncResult> {
    const supabase = getSupabase()
    if (!supabase) return { ok: false, error: '尚未設定雲端同步' }
    const userId = await getCurrentUserId()
    if (!userId) return { ok: false, error: '尚未登入' }

    try {
        const { error } = await supabase
            .from(TABLE)
            .upsert(toRemoteRow(board, userId), { onConflict: 'user_id,id' })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }
}

/** 從雲端取回一塊白板；雲端沒有這塊板時回 data: null（不算錯誤）*/
export async function pullBoard(boardId: string): Promise<SyncResult<BoardRecord | null>> {
    const supabase = getSupabase()
    if (!supabase) return { ok: false, error: '尚未設定雲端同步' }
    if (!await getCurrentUserId()) return { ok: false, error: '尚未登入' }

    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .eq('id', boardId)
            .maybeSingle()
        if (error) return { ok: false, error: error.message }
        return { ok: true, data: data ? fromRemoteRow(data as RemoteBoardRow) : null }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }
}

export interface RemoteBoardSummary {
    id: string
    name: string
    updatedAt: number
    deletedAt: number | null
}

/** 列出雲端有哪些板（只取摘要欄位，不拉 snapshot——那可能好幾 MB）*/
export async function listRemoteBoards(): Promise<SyncResult<RemoteBoardSummary[]>> {
    const supabase = getSupabase()
    if (!supabase) return { ok: false, error: '尚未設定雲端同步' }
    if (!await getCurrentUserId()) return { ok: false, error: '尚未登入' }

    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select('id, name, updated_at, deleted_at')
            .order('updated_at', { ascending: false })
        if (error) return { ok: false, error: error.message }
        const rows = (data ?? []) as Pick<RemoteBoardRow, 'id' | 'name' | 'updated_at' | 'deleted_at'>[]
        return {
            ok: true,
            data: rows.map(r => ({
                id: r.id, name: r.name, updatedAt: r.updated_at, deletedAt: r.deleted_at,
            })),
        }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }
}

/** 從雲端刪掉一列（測試/清理用；一般的「刪除白板」走 deletedAt 軟刪除同步）*/
export async function deleteRemoteBoard(boardId: string): Promise<SyncResult> {
    const supabase = getSupabase()
    if (!supabase) return { ok: false, error: '尚未設定雲端同步' }
    if (!await getCurrentUserId()) return { ok: false, error: '尚未登入' }

    try {
        const { error } = await supabase.from(TABLE).delete().eq('id', boardId)
        if (error) return { ok: false, error: error.message }
        return { ok: true }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }
}
