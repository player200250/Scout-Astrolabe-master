// src/sync/cloudCleanup.ts
//
// 雲端殘留物的清理（roadmap-mobile：墓碑列的 GC ＋ Storage 孤兒物件的 GC）。
//
// ── 兩種殘留，同一個成因 ────────────────────────────────────────────────────
// 1. **墓碑列**：白板被永久刪除時不能把雲端那列刪掉——另一端還留著它，一同步就會
//    以「僅本機」的身分整塊推回來＝復活。所以改推一列 `deleted_at` 有值、
//    snapshot/thumbnail 清空的墓碑。代價是那一列從此永遠留著。
// 2. **Storage 孤兒物件**：卡片刪掉之後，`card-images` 裡那張圖沒有人再引用，
//    但也沒有人去刪它。
//
// ── 為什麼做成「先預覽、按了才刪」而不是自動 GC ──────────────────────────
// 這兩件事刪錯的代價不對稱，而且都不可逆：
//   - 墓碑刪太早 ⇒ 一台很久沒同步的裝置會把那塊板**復活**（資料自己冒出來）
//   - 孤兒圖刪錯 ⇒ 使用者的圖**永久消失**
// 兩者都不該在背景靜默發生。這個檔只提供「掃描出候選 ＋ 執行刪除」兩個動作，
// 由資料安全中心顯示數量、使用者確認後才真的刪。
//
// ⚠️ 判斷「有沒有人引用」用的是**本機**的白板。前提是本機與雲端已經同步——
// 所以 UI 端要在同步狀態不乾淨時擋下來（見 DataSafetyPanel）。
import { getSupabase, getCurrentUserId, describeNetworkError } from './supabaseClient'
import { listRemoteBoards, type RemoteBoardSummary } from './boardSync'
import { IMAGE_BUCKET, collectImageNames, describeStorageError } from './imageSync'
import { db, type BoardRecord } from '../db'

/**
 * 墓碑保留多久才可以清掉。
 *
 * 這個數字的意義是「一台裝置最久可以多久沒同步，而不會讓已刪除的板復活」。
 * 垃圾桶是 14 天，這裡刻意訂得更長——垃圾桶過期只是本機清掉，這裡過期
 * 卻可能讓資料在別台冒出來，錯的代價比較高。
 */
export const TOMBSTONE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000   // 60 天

/**
 * 圖片上傳後多久才可以被當成孤兒。
 *
 * ⚠️ 這個寬限期是必要的，不是保險起見：`imageSync` 是**先上傳圖、再推白板列**。
 * 中間那段時間物件確實存在、卻還沒有任何白板引用它——沒有寬限期的話，
 * 剛上傳的圖會被同一輪清理當成孤兒刪掉。
 */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000               // 1 天

// ── 純函式（可單元測試的部分）────────────────────────────────────────────

/** 挑出「已經是墓碑、而且久到可以清掉」的列 */
export function findStaleTombstones(
    rows: RemoteBoardSummary[],
    now: number,
    retentionMs: number = TOMBSTONE_RETENTION_MS,
): RemoteBoardSummary[] {
    return rows.filter(r => r.deletedAt !== null && now - r.deletedAt > retentionMs)
}

export interface RemoteObject {
    name: string
    /** ISO 字串，Supabase Storage 回的格式 */
    createdAt: string | null
}

/**
 * 挑出沒有人引用、而且過了寬限期的圖片物件。
 *
 * 拿不到 createdAt 的物件**一律保留**——寧可留著垃圾，也不要因為缺一個時間戳
 * 就刪掉使用者的圖。
 */
export function findOrphanImages(
    objects: RemoteObject[],
    referenced: Set<string>,
    now: number,
    graceMs: number = ORPHAN_GRACE_MS,
): RemoteObject[] {
    return objects.filter(o => {
        if (referenced.has(o.name)) return false
        if (!o.createdAt) return false
        const created = Date.parse(o.createdAt)
        if (Number.isNaN(created)) return false
        return now - created > graceMs
    })
}

/** 把本機所有白板（含在垃圾桶裡的）引用到的圖片名稱收成一個集合 */
export function collectReferencedImages(boards: BoardRecord[]): Set<string> {
    const out = new Set<string>()
    for (const b of boards) {
        // 墓碑本身 snapshot 是 null，collectImageNames 會回空陣列
        for (const name of collectImageNames(b.snapshot)) out.add(name)
    }
    return out
}

// ── 掃描與執行 ──────────────────────────────────────────────────────────

export interface CleanupPlan {
    tombstones: RemoteBoardSummary[]
    orphanImages: RemoteObject[]
}

export interface ScanResult {
    ok: boolean
    error?: string
    plan?: CleanupPlan
}

/** 列出這個使用者在 Storage 裡的所有圖片物件 */
async function listRemoteImages(): Promise<RemoteObject[]> {
    const supabase = getSupabase()
    if (!supabase) return []
    const userId = await getCurrentUserId()
    if (!userId) return []

    const out: RemoteObject[] = []
    const PAGE = 100
    // Storage 的 list 有筆數上限，得自己翻頁；沒翻的話超過一頁的物件會被
    // 誤判成「不存在」——那不會刪錯東西，但清理就永遠清不乾淨。
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase.storage
            .from(IMAGE_BUCKET)
            .list(userId, { limit: PAGE, offset })
        if (error) throw new Error(describeStorageError(error.message))
        const batch = data ?? []
        for (const o of batch) out.push({ name: o.name, createdAt: o.created_at ?? null })
        if (batch.length < PAGE) break
    }
    return out
}

/** 掃描雲端有哪些可以清掉的殘留；不刪任何東西 */
export async function scanCloudLeftovers(now: number = Date.now()): Promise<ScanResult> {
    if (!getSupabase()) return { ok: false, error: '尚未設定雲端同步' }
    if (!await getCurrentUserId()) return { ok: false, error: '尚未登入' }

    try {
        const list = await listRemoteBoards()
        if (!list.ok) return { ok: false, error: list.error ?? '讀取雲端清單失敗' }

        const localBoards: BoardRecord[] = await db.table('boards').toArray()
        const referenced = collectReferencedImages(localBoards)

        return {
            ok: true,
            plan: {
                tombstones: findStaleTombstones(list.data ?? [], now),
                orphanImages: findOrphanImages(await listRemoteImages(), referenced, now),
            },
        }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e) }
    }
}

export interface CleanupResult {
    ok: boolean
    error?: string
    deletedTombstones: number
    deletedImages: number
}

/** 真的把掃描出來的殘留刪掉。只刪 plan 裡列出的，不重新掃描。 */
export async function cleanupCloudLeftovers(plan: CleanupPlan): Promise<CleanupResult> {
    const supabase = getSupabase()
    if (!supabase) return { ok: false, error: '尚未設定雲端同步', deletedTombstones: 0, deletedImages: 0 }
    const userId = await getCurrentUserId()
    if (!userId) return { ok: false, error: '尚未登入', deletedTombstones: 0, deletedImages: 0 }

    let deletedTombstones = 0
    let deletedImages = 0

    try {
        if (plan.tombstones.length > 0) {
            const ids = plan.tombstones.map(t => t.id)
            // ⚠️ 一定要同時帶 deleted_at 條件：萬一掃描到執行之間那塊板被還原了，
            // 沒有這個條件就會把一塊活著的板從雲端刪掉。
            const { error } = await supabase
                .from('boards')
                .delete()
                .eq('user_id', userId)
                .in('id', ids)
                .not('deleted_at', 'is', null)
            if (error) return { ok: false, error: error.message, deletedTombstones, deletedImages }
            deletedTombstones = ids.length
        }

        if (plan.orphanImages.length > 0) {
            const paths = plan.orphanImages.map(o => `${userId}/${o.name}`)
            const { error } = await supabase.storage.from(IMAGE_BUCKET).remove(paths)
            if (error) return { ok: false, error: describeStorageError(error.message), deletedTombstones, deletedImages }
            deletedImages = paths.length
        }

        return { ok: true, deletedTombstones, deletedImages }
    } catch (e) {
        return { ok: false, error: describeNetworkError(e), deletedTombstones, deletedImages }
    }
}
