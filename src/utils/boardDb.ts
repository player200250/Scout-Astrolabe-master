import { db } from '../db'
import type { BoardRecord } from '../db'
import { HOME_BOARD_ID, INBOX_BOARD_ID } from '../constants'
import { EXAMPLE_SEED_FLAG } from './exampleBoard'
import { buildHomeBoardMigration } from './homeBoardMigration'
import { notifyBoardSaved, notifyBoardDeleted } from '../sync/syncEngine'

export const generateId = () => `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

/**
 * 在現有白板名稱中產生不重複名稱（base、base (2)、base (3)…）。純函式。
 * 原本在 useBoardCRUD，但 loadAllBoards 的主頁畫布搬遷也要用；
 * 從資料層 import hook 會與 useBoardCRUD → boardDb 形成循環，故移到這裡。
 */
export function uniqueName(base: string, currentBoards: BoardRecord[]): string {
    const existing = new Set(currentBoards.map(b => b.name))
    if (!existing.has(base)) return base
    let n = 2
    while (existing.has(`${base} (${n})`)) n++
    return `${base} (${n})`
}

export const isRasterThumbnail = (t: string | null | undefined): t is string =>
    typeof t === 'string' && (
        t.startsWith('data:image/png;base64,') ||
        t.startsWith('data:image/jpeg;base64,') ||
        t.startsWith('data:image/webp;base64,')
    )

/**
 * 白板持久化的**唯一**入口（全庫 20+ 處呼叫都經過這裡），因此也是自動同步唯一需要掛的點。
 *
 * ⚠️ 通知同步引擎的動作一律放在 Dexie 寫入**之後**、且用 try/catch 吞掉：
 * 雲端同步是可選的附加層（ADR 0006），它出任何狀況都不該讓本機存檔失敗。
 */
export const saveBoard = async (board: BoardRecord) => {
    await db.table('boards').put(board)
    try { notifyBoardSaved(board) } catch (err) { console.error('[sync] 通知存檔失敗', err) }
}

/**
 * 永久刪除。先把記錄讀出來再刪——同步引擎需要 id 與名稱才能推一列墓碑到雲端，
 * 否則另一端下次同步時會把這塊板整個推回來（「刪了又長回來」）。
 */
export const deleteBoard = async (id: string) => {
    let record: BoardRecord | undefined
    try { record = await db.table('boards').get(id) } catch { /* 讀不到就只刪本機 */ }
    await db.table('boards').delete(id)
    if (record) {
        try { notifyBoardDeleted(record) } catch (err) { console.error('[sync] 通知刪除失敗', err) }
    }
}

export const loadAllBoards = async (): Promise<BoardRecord[]> => {
    const boards = await db.table('boards').toArray()

    const svgBoards = boards.filter(b => !isRasterThumbnail(b.thumbnail) && b.thumbnail != null)
    if (svgBoards.length > 0) {
        await Promise.all(svgBoards.map(b => db.table('boards').put({ ...b, thumbnail: null })))
        svgBoards.forEach(b => { b.thumbnail = null })
    }

    let homeBoard = boards.find(b => b.isHome)
    if (!homeBoard) {
        homeBoard = {
            id: HOME_BOARD_ID,
            name: '🏠 主頁',
            snapshot: null,
            thumbnail: null,
            updatedAt: 0,
            isHome: true,
        }
        await db.table('boards').put(homeBoard)
        boards.unshift(homeBoard)
    }

    // D1：主頁不再有白板模式。舊主頁畫布若還有內容，整份搬成一張普通白板，
    // 否則那些 shape 會留在 DB 裡但沒有任何 UI 打得開（見 homeBoardMigration.ts）。
    const migration = buildHomeBoardMigration(
        homeBoard,
        generateId(),
        base => uniqueName(base, boards),
    )
    if (migration) {
        await db.table('boards').put(migration.migratedBoard)
        await db.table('boards').put(migration.clearedHome)
        const homeIdx = boards.findIndex(b => b.id === migration.clearedHome.id)
        if (homeIdx >= 0) boards[homeIdx] = migration.clearedHome
        boards.push(migration.migratedBoard)
        console.log(`[home] 主頁畫布已搬成「${migration.migratedBoard.name}」`)
    }

    let inboxBoard = boards.find(b => b.isInbox)
    if (!inboxBoard) {
        inboxBoard = {
            id: INBOX_BOARD_ID,
            name: '📥 收件匣',
            snapshot: null,
            thumbnail: null,
            updatedAt: 0,
            isInbox: true,
        }
        await db.table('boards').put(inboxBoard)
        boards.push(inboxBoard)
    }

    if (boards.filter(b => !b.isHome && !b.isInbox).length === 0) {
        const oldSnapshot = await db.table('snapshots').get('latest')
        const firstBoard: BoardRecord = {
            id: generateId(),
            name: '我的白板',
            snapshot: oldSnapshot?.snapshot ?? null,
            thumbnail: null,
            updatedAt: Date.now(),
        }
        await db.table('boards').put(firstBoard)
        boards.push(firstBoard)

        // 全新使用者（沒有可沿用的舊 snapshot）：標記這塊為待 seed 範例卡。
        // 實際建卡由 WhiteboardTools 掛載時走 editor.createShape 完成（見 exampleBoard.ts）。
        // 從舊版遷移（有 oldSnapshot）者不標記，避免覆蓋既有內容。
        if (!oldSnapshot?.snapshot) {
            try { localStorage.setItem(EXAMPLE_SEED_FLAG, firstBoard.id) } catch { /* localStorage 不可用時略過 */ }
        }
    }

    const home  = boards.filter(b => b.isHome)
    const inbox = boards.filter(b => b.isInbox)
    const rest  = boards.filter(b => !b.isHome && !b.isInbox).sort((a, b) => {
        if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder
        if (a.sortOrder != null) return -1
        if (b.sortOrder != null) return 1
        return a.updatedAt - b.updatedAt
    })
    return [...home, ...inbox, ...rest]
}

// ── 備份還原（P0 修復 3）──────────────────────────────────────────────────

export type RestoreValidation =
    | { ok: true; boards: BoardRecord[] }
    | { ok: false; error: string }

/**
 * 寫入前先驗證要還原的白板清單。純函式。
 * 刻意「整份拒絕」而不是濾掉壞的那幾塊：還原會清空現有資料，半份備份等於靜靜丟掉資料。
 */
export function validateRestoreBoards(input: unknown): RestoreValidation {
    if (!Array.isArray(input)) return { ok: false, error: '備份格式不正確（白板清單不是陣列）。' }
    if (input.length === 0) return { ok: false, error: '備份裡沒有任何白板。' }
    const seen = new Set<string>()
    for (let i = 0; i < input.length; i++) {
        const b = input[i] as Partial<BoardRecord> | null
        if (!b || typeof b !== 'object') return { ok: false, error: `備份第 ${i + 1} 筆不是白板資料。` }
        if (typeof b.id !== 'string' || !b.id) return { ok: false, error: `備份第 ${i + 1} 筆缺少白板 id。` }
        if (typeof b.name !== 'string') return { ok: false, error: `白板「${b.id}」缺少名稱。` }
        if (b.snapshot != null && typeof b.snapshot !== 'object') return { ok: false, error: `白板「${b.name}」的內容格式不正確。` }
        if (seen.has(b.id)) return { ok: false, error: `備份裡有重複的白板 id「${b.id}」。` }
        seen.add(b.id)
    }
    const boards = input as BoardRecord[]
    if (!boards.some(b => !b.deletedAt)) return { ok: false, error: '備份裡的白板全都在垃圾桶，還原後會沒有任何可用白板。' }
    return { ok: true, boards }
}

/**
 * 用備份**整批取代** boards 表——清空與寫入在同一個 Dexie 交易裡：
 * 任何一筆寫入失敗（配額、資料無法序列化、程序被中斷）⇒ 整個交易回滾，資料庫維持還原前的樣子。
 * 寫完在交易內再數一次筆數，對不上也回滾。
 *
 * ⚠️ 交易只涵蓋 IndexedDB。圖片實體檔（從備份資料夾補回缺檔）在主程序，
 * 那一步只新增缺少的檔、不覆蓋不刪除，失敗或取消都不影響現有資料，所以不需要回滾。
 * 同步狀態（clearSyncState）由呼叫端在交易成功後才處理。
 */
export async function replaceAllBoards(boards: BoardRecord[]): Promise<void> {
    const table = db.table('boards')
    await db.transaction('rw', table, async () => {
        await table.clear()
        await table.bulkPut(boards)
        const count = await table.count()
        if (count !== boards.length) {
            throw new Error(`還原後白板數量不符（預期 ${boards.length}，實際 ${count}）`)
        }
    })
}
